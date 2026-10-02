from __future__ import annotations

from io import BytesIO

from docling.datamodel.base_models import ConversionStatus
from docling_core.types.io import DocumentStream

from seshat_intelligence.config import get_settings
from seshat_intelligence.providers.base import ConvertedDocument
from seshat_intelligence.providers.docling_setup import build_converter
from seshat_intelligence.providers.hygiene import clean_text


class DoclingProvider:
    """Wraps docling's own DocumentConverter as a library call, not an HTTP
    dependency - this is the whole point of this service existing instead of
    calling docling-serve: no network hop, no separate process to keep
    healthy, full access to DoclingDocument instead of whatever subset a
    generic server's API happens to expose.

    Handles most document formats (PDF, DOCX, HTML, MD, images, ...) - see
    docling's own InputFormat enum. One converter instance is reused across
    requests - DocumentConverter owns model-loading and pipeline setup,
    which is expensive to redo per call.
    """

    def __init__(self) -> None:
        self._converter = build_converter(get_settings())

    def convert_bytes(self, filename: str, data: bytes) -> ConvertedDocument:
        stream = DocumentStream(name=filename, stream=BytesIO(data))
        result = self._converter.convert(stream, raises_on_error=False)
        errors = [str(e.error_message) for e in result.errors]

        if result.status not in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
            return ConvertedDocument(status=result.status.value, markdown="", errors=errors)

        return ConvertedDocument(
            status=result.status.value,
            markdown=clean_text(result.document.export_to_markdown()),
            raw=result.document.export_to_dict(),
            errors=errors,
        )
