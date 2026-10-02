from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class ReadError(Exception):
    """The file cannot be read at all (encrypted, corrupt, unsafe). Not worth retrying as is."""


class UnsafeFile(ReadError):
    """A file that must not be handed to any engine either (for example a zip bomb)."""


class PageSource(str, Enum):
    NATIVE = "native"  # the PDF's own text layer
    ENGINE = "engine"  # a conversion engine (Docling or Marker)


@dataclass(slots=True)
class PageResult:
    page: int  # 1-indexed
    source: PageSource
    chars: int
    has_image: bool = False
    # Why this page left the cheap path: "image", "sparse", "garbled". Empty for native pages.
    reason: str = ""
    engine: str | None = None


@dataclass(slots=True)
class ReadResult:
    ok: bool
    markdown: str = ""
    # "native" when no engine was needed, "engine" when only engines were, "mixed" otherwise.
    source: str = "native"
    page_count: int = 0
    pages: list[PageResult] = field(default_factory=list)
    engines_used: list[str] = field(default_factory=list)
    reason: str = ""  # set when ok is False

    @property
    def engine_page_count(self) -> int:
        return sum(1 for page in self.pages if page.source == PageSource.ENGINE)
