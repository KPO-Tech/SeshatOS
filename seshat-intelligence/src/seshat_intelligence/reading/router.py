"""Reads a file into markdown by the cheapest path that gives usable text.

The routing follows seshat/internal/documentreading and pdfsmart in the Go engine:

1. Office files (DOCX, PPTX, XLSX) are read natively first; an engine is used only when the native
   text is too thin or garbled.
2. PDFs are judged page by page. A page keeps its own text layer unless it carries a meaningful image,
   has almost no text, or has garbled text. Only those pages go to an engine, consecutive ones in a
   single call so a table that spans pages stays whole.
3. Everything else goes to an engine.

Safety contract (the same as the Go side): the result is ok only when every page that needed text got
some. If even one page could not be read, the pages are discarded and the whole document is offered to
the engines instead, and if that fails too the result is not ok. A partial document that silently
misses a page is the failure this design exists to avoid.

Engines are tried in the order the policy gives, and the next one gets a second opinion when a result
is empty or garbled. Some content is invisible to this routing (borderless tables, vector charts, which
need a layout model to find), so `pdf_mode="whole"` sends every PDF to the engines.
"""

from __future__ import annotations

import logging
import os
from typing import Literal

from seshat_intelligence.providers.base import ConvertedDocument
from seshat_intelligence.reading.engines import Engines
from seshat_intelligence.reading.models import PageResult, PageSource, ReadError, ReadResult, UnsafeFile
from seshat_intelligence.reading.office import office_text
from seshat_intelligence.reading.pdfpages import MIN_CHARS_PER_PAGE, MIN_IMAGE_AREA_RATIO, PageAnalysis, analyze_pdf, extract_pages
from seshat_intelligence.reading.pool import LightPool
from seshat_intelligence.reading.quality import is_garbled_text

logger = logging.getLogger(__name__)

PdfMode = Literal["pages", "whole"]
_USABLE_STATUS = {"success", "partial_success"}
_TEXT_EXTENSIONS = {".txt", ".md"}
_OFFICE_EXTENSIONS = {".docx", ".pptx", ".xlsx"}


def _usable(converted: ConvertedDocument) -> bool:
    return converted.status in _USABLE_STATUS and bool(converted.markdown.strip()) and not is_garbled_text(converted.markdown)


def _runs(pages: list[int]) -> list[list[int]]:
    """Group sorted page numbers into runs of consecutive pages."""
    runs: list[list[int]] = []
    for page in pages:
        if runs and page == runs[-1][-1] + 1:
            runs[-1].append(page)
        else:
            runs.append([page])
    return runs


class ReadingRouter:
    def __init__(
        self,
        engines: Engines,
        pool: LightPool | None = None,
        pdf_mode: PdfMode = "pages",
        min_chars_per_page: int = MIN_CHARS_PER_PAGE,
        min_image_area_ratio: float = MIN_IMAGE_AREA_RATIO,
    ) -> None:
        self._engines = engines
        self._pool = pool or LightPool()
        self._pdf_mode = pdf_mode
        self._min_chars = min_chars_per_page
        self._min_image_ratio = min_image_area_ratio

    def shutdown(self) -> None:
        self._pool.shutdown()

    async def read(self, filename: str, data: bytes, pdf_mode: PdfMode | None = None) -> ReadResult:
        extension = os.path.splitext(filename)[1].lower()
        if extension in _TEXT_EXTENSIONS:
            return ReadResult(ok=True, markdown=data.decode("utf-8", errors="replace"), source="native")
        if extension in _OFFICE_EXTENSIONS:
            return await self._read_office(extension, filename, data)
        if extension == ".pdf":
            return await self._read_pdf(filename, data, pdf_mode or self._pdf_mode)
        return await self._read_whole(extension, filename, data)

    # -- office ------------------------------------------------------------------------------

    async def _read_office(self, extension: str, filename: str, data: bytes) -> ReadResult:
        try:
            text = await self._pool.run(office_text, extension, data)
        except UnsafeFile as exc:
            return ReadResult(ok=False, reason=str(exc))  # never offered to an engine
        except ReadError as exc:
            logger.info("native read of %s failed (%s); trying the engines", filename, exc)
            return await self._read_whole(extension, filename, data)
        if len(text.strip()) >= self._min_chars and not is_garbled_text(text):
            return ReadResult(ok=True, markdown=text, source="native")
        return await self._read_whole(extension, filename, data)

    # -- engines -----------------------------------------------------------------------------

    async def _convert(self, extension: str, filename: str, data: bytes) -> tuple[str, str] | None:
        """The first usable markdown among the engines in policy order, with the engine that made it."""
        for engine in self._engines.order_for(extension):
            try:
                converted = await self._engines.convert(engine, filename, data)
            except Exception as exc:  # noqa: BLE001 - a crashed engine is one failed attempt
                logger.warning("engine %s failed on %s: %s", engine, filename, exc)
                continue
            if _usable(converted):
                return converted.markdown, engine
            logger.info("engine %s gave no usable text for %s (%s)", engine, filename, converted.status)
        return None

    async def _read_whole(self, extension: str, filename: str, data: bytes) -> ReadResult:
        if not self._engines.order_for(extension):
            return ReadResult(ok=False, reason=f"no conversion engine is available for {extension or 'this file'}")
        outcome = await self._convert(extension, filename, data)
        if outcome is None:
            return ReadResult(ok=False, reason="no engine produced usable text")
        markdown, engine = outcome
        return ReadResult(ok=True, markdown=markdown, source="engine", engines_used=[engine])

    # -- pdf ---------------------------------------------------------------------------------

    async def _read_pdf(self, filename: str, data: bytes, mode: PdfMode) -> ReadResult:
        if mode == "whole":
            return await self._read_whole(".pdf", filename, data)
        try:
            analyses: list[PageAnalysis] = await self._pool.run(analyze_pdf, data, self._min_chars, self._min_image_ratio)
        except ReadError as exc:
            return ReadResult(ok=False, reason=str(exc))
        if not analyses:
            return ReadResult(ok=False, reason="the PDF has no pages")

        heavy = [a.page for a in analyses if a.needs_engine]
        if heavy and not self._engines.order_for(".pdf"):
            return ReadResult(ok=False, page_count=len(analyses), reason=f"{len(heavy)} page(s) need a conversion engine and none is available")

        runs = _runs(heavy)
        run_markdown: dict[int, str] = {}  # first page of a run -> the engine's markdown for the run
        engine_of: dict[int, str] = {}  # every page of a run -> the engine that read it
        engines_used: list[str] = []
        for run in runs:
            sub = data if len(run) == len(analyses) else await self._pool.run(extract_pages, data, run)
            outcome = await self._convert(".pdf", f"pages-{run[0]}-{run[-1]}.pdf", sub)
            if outcome is None:
                return await self._whole_fallback(filename, data, analyses)
            markdown, engine = outcome
            run_markdown[run[0]] = markdown
            for page in run:
                engine_of[page] = engine
            if engine not in engines_used:
                engines_used.append(engine)

        parts: list[str] = []
        pages: list[PageResult] = []
        for analysis in analyses:
            number = analysis.page
            if number in engine_of:
                markdown = run_markdown.get(number)  # only the first page of a run carries the run's text
                if markdown is not None:
                    parts.append(markdown)
                pages.append(
                    PageResult(page=number, source=PageSource.ENGINE, chars=len(markdown or ""), has_image=analysis.has_image, reason=analysis.reason, engine=engine_of[number])
                )
            else:
                text = analysis.text.strip()
                parts.append(text)
                pages.append(PageResult(page=number, source=PageSource.NATIVE, chars=len(text), has_image=analysis.has_image))
        if not engines_used:
            source = "native"
        else:
            source = "engine" if len(engine_of) == len(analyses) else "mixed"
        return ReadResult(ok=True, markdown="\n\n".join(part for part in parts if part), source=source, page_count=len(analyses), pages=pages, engines_used=engines_used)

    async def _whole_fallback(self, filename: str, data: bytes, analyses: list[PageAnalysis]) -> ReadResult:
        """A page that needed an engine could not get text, so no partial result is kept: the whole
        document goes to the engines, and if they fail too the result is not ok."""
        outcome = await self._convert(".pdf", filename, data)
        if outcome is None:
            return ReadResult(ok=False, page_count=len(analyses), reason="a page could not be read and the whole-document fallback failed too")
        markdown, engine = outcome
        pages = [PageResult(page=a.page, source=PageSource.ENGINE, chars=0, has_image=a.has_image, reason=a.reason or "fallback", engine=engine) for a in analyses]
        return ReadResult(ok=True, markdown=markdown, source="engine", page_count=len(analyses), pages=pages, engines_used=[engine])
