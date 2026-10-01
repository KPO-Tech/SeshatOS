from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class ChunkResult:
    """One document-aware chunk - the same shape seshat's own Go RAG pipeline
    already expects from docling-serve's hybrid chunk endpoint
    (internal/docling.Chunk in the seshat repo), so wiring this endpoint in
    later is a base-URL change there, not a data-model change. Shared across
    every chunker/*.py implementation, same role as providers/base.py's
    ConvertedDocument for conversion."""

    index: int
    text: str
    raw_text: str | None
    num_tokens: int | None
    headings: list[str] = field(default_factory=list)
    captions: list[str] = field(default_factory=list)
    page_numbers: list[int] = field(default_factory=list)
    doc_items: list[str] = field(default_factory=list)


class ChunkingFailed(Exception):
    """Carries `errors` as the sole pickled arg (not a pre-joined string) so
    this reconstructs correctly when it crosses the ChunkingPool's process
    boundary - see concurrent.futures.process's exception pickling."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__(errors)
        self.errors = errors

    def __str__(self) -> str:
        return "; ".join(self.errors) or "unknown failure"
