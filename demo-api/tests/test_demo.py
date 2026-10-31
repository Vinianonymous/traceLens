import asyncio
import importlib.util
from pathlib import Path

from httpx import ASGITransport, AsyncClient

spec = importlib.util.spec_from_file_location(
    "demo_main", Path(__file__).resolve().parents[1] / "main.py"
)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_demo_items() -> None:
    async def check() -> None:
        async with AsyncClient(
            transport=ASGITransport(app=module.app), base_url="http://test"
        ) as client:
            health = await client.get("/health")
            items = await client.get("/items")
            created = await client.post("/items", json={"name": "Eraser"})
            unchanged = await client.get("/items")
            redirect = await client.get("/redirect")
        assert health.json() == {"status": "ok"}
        assert items.json() == [{"id": 1, "name": "Notebook"}, {"id": 2, "name": "Pencil"}]
        assert created.status_code == 201
        assert created.json() == {"id": 3, "name": "Eraser"}
        assert unchanged.json() == items.json()
        assert redirect.status_code == 302

    asyncio.run(check())
