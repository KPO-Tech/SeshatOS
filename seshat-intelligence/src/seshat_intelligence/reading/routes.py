from __future__ import annotations

from fastapi import APIRouter, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel

from seshat_intelligence.reading.models import PageResult, ReadResult
from seshat_intelligence.reading.router import PdfMode, ReadingMode

router = APIRouter(prefix="/v1/documents", tags=["reading"])


class PageResponse(BaseModel):
    page: int
    source: str
    chars: int
    has_image: bool
    reason: str = ""
    engine: str | None = None


class ReadResponse(BaseModel):
    filename: str
    ok: bool
    markdown: str
    source: str
    page_count: int
    pages: list[PageResponse]
    engines_used: list[str]
    reason: str = ""


def _page(page: PageResult) -> PageResponse:
    return PageResponse(page=page.page, source=page.source.value, chars=page.chars, has_image=page.has_image, reason=page.reason, engine=page.engine)


def to_response(filename: str, result: ReadResult) -> ReadResponse:
    return ReadResponse(
        filename=filename,
        ok=result.ok,
        markdown=result.markdown,
        source=result.source,
        page_count=result.page_count,
        pages=[_page(page) for page in result.pages],
        engines_used=result.engines_used,
        reason=result.reason,
    )


@router.post("/read", response_model=ReadResponse)
async def read_document(
    request: Request,
    file: UploadFile,
    pdf_mode: PdfMode | None = Form(default=None),
    mode: ReadingMode | None = Form(default=None),
) -> ReadResponse:
    """Read a file into markdown by the cheapest path that gives usable text, and say how each page
    was read. `ok` false means no usable text was produced; the reason says why."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="uploaded file is empty")
    filename = file.filename or "upload.bin"
    result = await request.app.state.reading_router.read(filename, data, pdf_mode, mode)
    return to_response(filename, result)
