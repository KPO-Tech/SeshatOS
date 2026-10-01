from pydantic import BaseModel


class DocumentResponse(BaseModel):
    document_id: str
    filename: str
    status: str
    created_at: str
    markdown: str
    errors: list[str]


class DocumentChunk(BaseModel):
    """Mirrors providers.chunker.base.ChunkResult - see its own doc
    comment for why the field shape matches seshat's Go RAG pipeline."""

    index: int
    text: str
    raw_text: str | None = None
    num_tokens: int | None = None
    headings: list[str] = []
    captions: list[str] = []
    page_numbers: list[int] = []
    doc_items: list[str] = []


class ChunkDocumentResponse(BaseModel):
    filename: str
    chunks: list[DocumentChunk]
