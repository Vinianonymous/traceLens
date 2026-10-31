"""Demo-only destination configuration; arbitrary URLs are never configured."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    demo_origin: str = "http://127.0.0.1:8001"
    data_dir: str = "./data"

    def __post_init__(self) -> None:
        if self.demo_origin not in ("http://127.0.0.1:8001", "http://demo-api:8001"):
            raise ValueError("Only the bundled demo API origin is supported")


def load_settings() -> Settings:
    return Settings(
        demo_origin=os.environ.get("TRACELENS_DEMO_ORIGIN", "http://127.0.0.1:8001"),
        data_dir=os.environ.get("TRACELENS_DATA_DIR", "./data"),
    )
