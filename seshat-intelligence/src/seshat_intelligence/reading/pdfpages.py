"""Page-level PDF analysis and splitting with PDFium. These functions run in the reading pool's worker
processes, so they only take and return plain, picklable values."""

from __future__ import annotations

import io
from dataclasses import dataclass

from seshat_intelligence.reading.models import ReadError
from seshat_intelligence.reading.quality import is_garbled_text

# A page below this many characters has no usable text layer (a scan, or an image-only page).
MIN_CHARS_PER_PAGE = 20
# Images covering less than this share of the page (a logo, an icon) do not make a page need OCR.
MIN_IMAGE_AREA_RATIO = 0.1


@dataclass(slots=True)
class PageAnalysis:
    page: int  # 1-indexed
    text: str
    has_image: bool
    # "image", "sparse" or "garbled" when the page cannot trust its own text layer; empty otherwise.
    reason: str

    @property
    def needs_engine(self) -> bool:
        return bool(self.reason)


def _open(data: bytes):
    import pypdfium2 as pdfium

    try:
        return pdfium.PdfDocument(data)
    except pdfium.PdfiumError as exc:
        if "password" in str(exc).lower():
            raise ReadError("the PDF is encrypted") from exc
        raise ReadError(f"could not open the PDF: {exc}") from exc


def analyze_pdf(data: bytes, min_chars: int = MIN_CHARS_PER_PAGE, min_image_ratio: float = MIN_IMAGE_AREA_RATIO) -> list[PageAnalysis]:
    """For each page: its native text, whether it carries a meaningful image, and why (if at all) it
    should leave the cheap path. Mirrors seshat/internal/pdfsmart's routing, with one deliberate
    change: an image only counts when it covers a real share of the page, so a logo repeated on every
    page does not send the whole document to a conversion engine."""
    import pypdfium2.raw as pdfium_c

    pdf = _open(data)
    analyses: list[PageAnalysis] = []
    try:
        for index, page in enumerate(pdf):
            try:
                width, height = page.get_size()
                page_area = max(width * height, 1.0)
                image_area = 0.0
                for obj in page.get_objects(filter=[pdfium_c.FPDF_PAGEOBJ_IMAGE]):
                    left, bottom, right, top = obj.get_bounds()
                    image_area += max(right - left, 0.0) * max(top - bottom, 0.0)
                has_image = image_area / page_area >= min_image_ratio

                text_page = page.get_textpage()
                try:
                    text = text_page.get_text_range()
                finally:
                    text_page.close()

                reason = ""
                if has_image:
                    reason = "image"
                elif len(text.strip()) < min_chars:
                    reason = "sparse"
                elif is_garbled_text(text):
                    reason = "garbled"
                analyses.append(PageAnalysis(page=index + 1, text=text, has_image=has_image, reason=reason))
            finally:
                page.close()
    finally:
        pdf.close()
    return analyses


def extract_pages(data: bytes, pages: list[int]) -> bytes:
    """A standalone PDF holding only the given 1-indexed pages, in order."""
    import pypdfium2 as pdfium

    source = _open(data)
    try:
        target = pdfium.PdfDocument.new()
        try:
            target.import_pages(source, [page - 1 for page in pages])
            out = io.BytesIO()
            target.save(out)
            return out.getvalue()
        finally:
            target.close()
    finally:
        source.close()
