"""Connect only to a freshly validated, pinned demo address."""

import asyncio
import ipaddress
import socket
import time
from collections.abc import Awaitable, Callable
from urllib.parse import urlsplit

import httpx

from app.core.config import Settings
from app.schemas.requests import MAX_BODY, SendRequest, SendResult

Resolver = Callable[[str, int], Awaitable[list[str]]]
PRIVATE_DOCKER_RANGES = tuple(
    ipaddress.ip_network(network) for network in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
)
HEADER_NAME_CHARS = "!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie", "proxy-authorization", "x-api-key"}
FORBIDDEN_HEADERS = SENSITIVE_HEADERS | {
    "host",
    "connection",
    "content-length",
    "transfer-encoding",
    "upgrade",
    "te",
    "trailer",
    "proxy-connection",
    "keep-alive",
    "forwarded",
    "x-forwarded-for",
    "x-forwarded-host",
    "accept-encoding",
}


class RequestFailure(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        self.status = status
        self.code = code
        self.message = message
        super().__init__(message)


async def resolve_addresses(host: str, port: int) -> list[str]:
    results = await asyncio.wait_for(
        asyncio.to_thread(socket.getaddrinfo, host, port, type=socket.SOCK_STREAM), timeout=2
    )
    return list(dict.fromkeys(str(result[4][0]) for result in results))


class RequestService:
    def __init__(
        self,
        settings: Settings,
        resolver: Resolver = resolve_addresses,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.settings = settings
        self.resolver = resolver
        self.transport = transport
        self.semaphore = asyncio.Semaphore(8)

    def _validate_url(self, url: str) -> tuple[str, str]:
        # No URL normalization before comparison: reject ambiguous authorities and userinfo.
        if any(ord(char) < 33 or char == "\\" for char in url):
            raise RequestFailure(400, "INVALID_URL", "URL contains forbidden characters")
        try:
            parsed = urlsplit(url)
            origin = f"{parsed.scheme}://{parsed.netloc}"
            if (
                parsed.scheme != "http"
                or origin != self.settings.demo_origin
                or parsed.username is not None
                or parsed.password is not None
                or parsed.fragment
                or parsed.port != 8001
            ):
                raise RequestFailure(403, "DESTINATION_BLOCKED", "Only the demo API is allowed")
        except ValueError as exc:
            raise RequestFailure(400, "INVALID_URL", "Invalid destination URL") from exc
        return parsed.hostname or "", parsed.netloc

    async def _pinned_address(self, host: str) -> str:
        try:
            addresses = await self.resolver(host, 8001)
            if not addresses:
                raise ValueError("No addresses")
            for address in addresses:
                ip = ipaddress.ip_address(address)
                if not isinstance(ip, ipaddress.IPv4Address) or (
                    (host == "127.0.0.1" and ip != ipaddress.ip_address("127.0.0.1"))
                    or (host == "demo-api" and not any(ip in net for net in PRIVATE_DOCKER_RANGES))
                ):
                    raise ValueError("Unexpected demo address")
            return addresses[0]
        except (TimeoutError, OSError, ValueError) as exc:
            raise RequestFailure(
                502, "DESTINATION_UNAVAILABLE", "Demo destination unavailable"
            ) from exc

    async def send(self, payload: SendRequest) -> SendResult:
        host, authority = self._validate_url(payload.url)
        for name, value in payload.headers.items():
            if (
                not name.isascii()
                or not name
                or any(char not in HEADER_NAME_CHARS for char in name)
                or name.lower() in FORBIDDEN_HEADERS
                or "api-key" in name.lower()
                or not value.isascii()
                or any(ord(char) < 32 or ord(char) == 127 for char in value)
            ):
                raise RequestFailure(400, "INVALID_HEADER", "Unsupported request header")
        if sum(len(name) + len(value) for name, value in payload.headers.items()) > 16384:
            raise RequestFailure(413, "REQUEST_TOO_LARGE", "Request headers exceed size limit")
        if payload.body is not None and len(payload.body.encode("utf-8")) > MAX_BODY:
            raise RequestFailure(413, "REQUEST_TOO_LARGE", "Request body exceeds 1 MiB")

        try:
            await asyncio.wait_for(self.semaphore.acquire(), timeout=1)
        except TimeoutError as exc:
            raise RequestFailure(503, "BUSY", "Too many active requests") from exc
        try:
            address = await self._pinned_address(host)
            try:
                original = httpx.URL(payload.url).copy_merge_params(payload.query)
            except httpx.InvalidURL as exc:
                raise RequestFailure(400, "INVALID_URL", "Invalid destination URL") from exc
            if len(str(original).encode("utf-8")) > 4096:
                raise RequestFailure(413, "REQUEST_TOO_LARGE", "Destination URL exceeds size limit")
            # httpx connects to the literal IP. The Host header retains the validated
            # authority; DNS cannot be consulted a second time by the HTTP transport.
            pinned = original.copy_with(host=address)
            headers = {**payload.headers, "host": authority, "accept-encoding": "identity"}
            start = time.monotonic()
            try:
                return await asyncio.wait_for(
                    self._execute(payload, pinned, headers, start), timeout=10
                )
            except TimeoutError as exc:
                raise RequestFailure(504, "REQUEST_TIMEOUT", "Demo API request timed out") from exc
        finally:
            self.semaphore.release()

    async def _execute(
        self, payload: SendRequest, pinned: httpx.URL, headers: dict[str, str], start: float
    ) -> SendResult:
        try:
            async with httpx.AsyncClient(
                transport=self.transport or httpx.AsyncHTTPTransport(retries=0),
                trust_env=False,
                follow_redirects=False,
                timeout=httpx.Timeout(5.0, connect=2.0),
            ) as client:
                async with client.stream(
                    payload.method, pinned, headers=headers, content=payload.body
                ) as response:
                    if 300 <= response.status_code < 400:
                        raise RequestFailure(502, "REDIRECT_BLOCKED", "Demo API redirect blocked")
                    chunks = bytearray()
                    truncated = False
                    if response.is_stream_consumed:
                        # In-memory transports may return a preloaded response.
                        chunks.extend(response.content[:MAX_BODY])
                        truncated = len(response.content) > MAX_BODY
                    else:
                        async for part in response.aiter_raw():
                            if len(chunks) + len(part) > MAX_BODY:
                                chunks.extend(part[: MAX_BODY - len(chunks)])
                                truncated = True
                                break
                            chunks.extend(part)
                    content_type = response.headers.get("content-type", "").lower()
                    is_text = response.headers.get(
                        "content-encoding", "identity"
                    ) == "identity" and (content_type.startswith("text/") or "json" in content_type)
                    body = chunks.decode("utf-8", errors="replace") if is_text else None
                    safe_headers = {
                        key: value
                        for key, value in response.headers.items()
                        if key.lower() not in SENSITIVE_HEADERS and "api-key" not in key.lower()
                    }
                    return SendResult(
                        status=response.status_code,
                        duration_ms=round((time.monotonic() - start) * 1000),
                        headers=safe_headers,
                        body=body,
                        truncated=truncated,
                    )
        except httpx.TimeoutException as exc:
            raise RequestFailure(504, "REQUEST_TIMEOUT", "Demo API request timed out") from exc
        except httpx.RequestError as exc:
            raise RequestFailure(502, "CONNECTION_FAILED", "Demo API connection failed") from exc
