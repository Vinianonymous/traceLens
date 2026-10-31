"""Phase 0 API scaffold: no outbound request execution or storage yet."""

from fastapi import FastAPI

app = FastAPI(title="TraceLens API", version="0.1.0")


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
