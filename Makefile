.PHONY: install check format up down

install:
	uv sync --frozen
	cd apps/web && npm ci

check:
	uv run --frozen ruff format --check apps/api demo-api
	uv run --frozen ruff check apps/api demo-api
	uv run --frozen mypy
	uv run --frozen pytest
	cd apps/web && npm run format:check && npm run lint && npm test && npm run build

format:
	uv run --frozen ruff format apps/api demo-api
	cd apps/web && npm run format

up:
	docker compose up --build -d --wait

down:
	docker compose down
