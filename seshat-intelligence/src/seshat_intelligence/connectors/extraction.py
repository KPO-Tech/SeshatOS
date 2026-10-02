"""Turns file bytes into text for connectors by way of the reading router."""

from __future__ import annotations

from typing import Awaitable, Callable, Protocol

from seshat_intelligence.reading.models import ReadResult

# bytes, mime type, file name -> extracted text, or None when the format is not supported.
Extractor = Callable[[bytes, str, str], Awaitable[str | None]]


class ExtractionError(Exception):
    """The file was understood to be readable but reading failed. Not worth retrying as is."""


class _Router(Protocol):
    async def read(self, filename: str, data: bytes, pdf_mode: str | None = None) -> ReadResult: ...


def router_extractor(router: _Router) -> Extractor:
    """An extractor backed by the reading router: native text first, conversion engines only for the
    pages that need them. An unreadable file raises ExtractionError with the router's reason."""

    async def extract(data: bytes, mime_type: str, name: str) -> str | None:
        result = await router.read(name, data)
        if not result.ok:
            raise ExtractionError(f"could not read {name}: {result.reason}")
        return result.markdown

    return extract
