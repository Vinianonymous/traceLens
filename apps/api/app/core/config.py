"""Demo-only destination configuration; arbitrary URLs are never configured."""

import os
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    demo_origin: str = "http://127.0.0.1:8001"
    data_dir: str = "./data"
    sensitive_headers: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if self.demo_origin not in ("http://127.0.0.1:8001", "http://demo-api:8001"):
            raise ValueError("Only the bundled demo API origin is supported")
        if any(
            not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", name)
            for name in self.sensitive_headers
        ):
            raise ValueError("Invalid sensitive header name")


def load_settings() -> Settings:
    return Settings(
        demo_origin=os.environ.get("TRACELENS_DEMO_ORIGIN", "http://127.0.0.1:8001"),
        data_dir=os.environ.get("TRACELENS_DATA_DIR", "./data"),
        sensitive_headers=tuple(
            name.strip()
            for name in os.environ.get("TRACELENS_SENSITIVE_HEADERS", "").split(",")
            if name.strip()
        ),
    )
