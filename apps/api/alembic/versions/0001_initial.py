"""Initial collections, saved templates and history metadata.

Revision ID: 0001
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "collections",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "saved_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "collection_id",
            sa.String(36),
            sa.ForeignKey("collections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("method", sa.String(6), nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("query_json", sa.JSON, nullable=False),
        sa.Column("headers_json_redacted", sa.JSON, nullable=False),
        sa.Column("body_template", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_saved_requests_collection_id", "saved_requests", ["collection_id"])
    op.create_table(
        "request_history",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("method", sa.String(6), nullable=False),
        sa.Column("sanitized_url", sa.Text, nullable=False),
        sa.Column("status", sa.Integer, nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("error_code", sa.String(50), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("response_size_bytes", sa.Integer, nullable=True),
        sa.Column("truncated", sa.Boolean, nullable=False),
    )
    op.create_index("ix_request_history_requested_at", "request_history", ["requested_at"])
    op.create_index("ix_request_history_status", "request_history", ["status"])


def downgrade() -> None:
    op.drop_index("ix_request_history_status", table_name="request_history")
    op.drop_index("ix_request_history_requested_at", table_name="request_history")
    op.drop_table("request_history")
    op.drop_index("ix_saved_requests_collection_id", table_name="saved_requests")
    op.drop_table("saved_requests")
    op.drop_table("collections")
