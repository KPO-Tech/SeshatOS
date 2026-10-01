from __future__ import annotations

from io import BytesIO

from marker.converters.pdf import PdfConverter
from marker.models import create_model_dict

from seshat_intelligence.providers.base import ConvertedDocument


class MarkerProvider:
    """Wraps Marker's own PdfConverter - the second provider behind
    DocumentProvider, picked specifically because independent benchmarks
    rate it comparably or above Docling on complex/scientific PDF layouts.

    PDF only - Marker has no other input format, unlike Docling. A non-PDF
    filename fails cleanly instead of being silently mis-parsed.
    """

    def __init__(self) -> None:
        self._converter = PdfConverter(artifact_dict=create_model_dict())

    def convert_bytes(self, filename: str, data: bytes) -> ConvertedDocument:
        if not filename.lower().endswith(".pdf"):
            return ConvertedDocument(status="failure", markdown="", errors=["marker only supports PDF input"])

        output = self._converter(BytesIO(data))
        return ConvertedDocument(status="success", markdown=output.markdown, raw=output.metadata)
