"""Deterministic, in-memory demo target for explicitly initiated requests."""

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

app = FastAPI(title="TraceLens Demo API", version="0.1.0")


class Item(BaseModel):
    id: int
    name: str


class NewItem(BaseModel):
    name: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/items")
def list_items() -> list[Item]:
    return [Item(id=1, name="Notebook"), Item(id=2, name="Pencil")]


@app.post("/items", status_code=201)
def create_item(item: NewItem) -> Item:
    # Deliberately stateless: repeated examples do not modify demo data.
    return Item(id=3, name=item.name)


@app.get("/redirect")
def redirect() -> RedirectResponse:
    """Safe fixture to verify even same-origin redirects are refused."""
    return RedirectResponse(url="http://127.0.0.1:8001/items", status_code=302)
