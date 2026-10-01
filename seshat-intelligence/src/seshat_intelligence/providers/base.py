from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(slots=True)
class ConvertedDocument:
    """What every provider hands back, regardless of which library did the
    work underneath - see docling.py and marker.py. `raw` is the provider's
    own full structured result, made JSON-serializable, kept alongside the
    markdown so a document never needs re-converting just because chunking
    or embeddings change later (see DocumentStore's own doc comment)."""

    status: str
    markdown: str
    raw: dict[str, Any] | None = None
    errors: list[str] = field(default_factory=list)


class DocumentProvider(Protocol):
    """One document-conversion engine behind this interface - Docling,
    Marker, or whatever comes next. Callers only ever talk to this, never
    to a specific library, so adding a provider never touches the
    application/storage/API layers."""

    def convert_bytes(self, filename: str, data: bytes) -> ConvertedDocument: ...
