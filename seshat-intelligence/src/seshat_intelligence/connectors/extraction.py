"""Turns file bytes into text for connectors by reusing the document conversion pool."""

from __future__ import annotations

from typing import Awaitable, Callable, Protocol

from seshat_intelligence.providers.base import ConvertedDocument

# bytes, mime type, file name -> extracted text, or None when the format is not supported.
Extractor = Callable[[bytes, str, str], Awaitable[str | None]]

_USABLE = {"success", "partial_success"}


class ExtractionError(Exception):
    """The file was understood to be convertible but conversion failed. Not worth retrying as is."""


class _Converter(Protocol):
    async def convert(self, filename: str, data: bytes) -> ConvertedDocument: ...


def pool_extractor(pool: _Converter) -> Extractor:
    """An extractor backed by a conversion pool (Docling or Marker). Conversion runs in the pool's
    worker processes, so the event loop stays free while a connector streams."""

    async def extract(data: bytes, mime_type: str, name: str) -> str | None:
        converted = await pool.convert(name, data)
        if converted.status not in _USABLE:
            reason = "; ".join(converted.errors) or converted.status
            raise ExtractionError(f"could not convert {name}: {reason}")
        return converted.markdown

    return extract
