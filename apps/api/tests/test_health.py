import asyncio

from app.main import app
from httpx import ASGITransport, AsyncClient


def test_health() -> None:
    async def check() -> None:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    asyncio.run(check())
