from __future__ import annotations

from io import BytesIO

from docling.chunking import HybridChunker
from docling.datamodel.base_models import ConversionStatus
from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
from docling_core.types.io import DocumentStream

from seshat_intelligence.config import get_settings
from seshat_intelligence.providers.chunker.base import ChunkingFailed, ChunkResult
from seshat_intelligence.providers.docling_setup import build_converter
from seshat_intelligence.providers.hygiene import clean_text


class DoclingHybridChunker:
    """Wraps docling's own HybridChunker as a library call - the same
    document-aware chunking docling-serve exposes over HTTP at
    /v1/chunk/hybrid/file, run in-process instead.

    Always used regardless of whichever provider `document_provider`
    configures for plain conversion (`/v1/documents`) - Marker has no
    equivalent structural chunker, and callers that want chunks always want
    Docling's document model to derive them from.
    """

    def __init__(self) -> None:
        self._converter = build_converter(get_settings())
        self._chunker = HybridChunker()
        self._sized: dict[int, HybridChunker] = {}

    def _chunker_for(self, max_tokens: int | None) -> HybridChunker:
        """The chunker that cuts at max_tokens tokens of the same tokenizer. The default one cuts at the
        tokenizer's own limit (256 for the default model), which is smaller than a chunk worth indexing for
        most documents: the host says what size it wants, and it is honoured here. One chunker per size is kept."""
        if max_tokens is None:
            return self._chunker
        if max_tokens not in self._sized:
            tokenizer = HuggingFaceTokenizer(tokenizer=self._chunker.tokenizer.get_tokenizer(), max_tokens=max_tokens)
            self._sized[max_tokens] = HybridChunker(tokenizer=tokenizer)
        return self._sized[max_tokens]

    def chunk_bytes(self, filename: str, data: bytes, max_tokens: int | None = None) -> list[ChunkResult]:
        chunker = self._chunker_for(max_tokens)
        stream = DocumentStream(name=filename, stream=BytesIO(data))
        result = self._converter.convert(stream, raises_on_error=False)
        if result.status not in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
            raise ChunkingFailed([str(e.error_message) for e in result.errors])

        out: list[ChunkResult] = []
        for index, chunk in enumerate(chunker.chunk(result.document)):
            text = clean_text(chunker.contextualize(chunk))
            raw_text = clean_text(chunk.text) if clean_text(chunk.text) != text else None
            page_numbers = sorted(
                {
                    prov.page_no
                    for item in chunk.meta.doc_items
                    for prov in item.prov
                    if prov.page_no is not None
                }
            )
            out.append(
                ChunkResult(
                    index=index,
                    text=text,
                    raw_text=raw_text,
                    num_tokens=chunker.tokenizer.count_tokens(text),
                    headings=list(chunk.meta.headings or []),
                    captions=list(chunk.meta.captions or []),
                    page_numbers=page_numbers,
                    doc_items=[item.self_ref for item in chunk.meta.doc_items],
                )
            )
        return out
