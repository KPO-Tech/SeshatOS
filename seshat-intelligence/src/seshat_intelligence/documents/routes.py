from fastapi import APIRouter, HTTPException, Request, UploadFile

from seshat_intelligence.documents.schemas import ChunkDocumentResponse, DocumentChunk, DocumentResponse
from seshat_intelligence.documents.store import StoredDocument
from seshat_intelligence.providers.chunker.base import ChunkingFailed, ChunkResult

router = APIRouter(prefix="/v1/documents", tags=["documents"])


def _to_response(stored: StoredDocument) -> DocumentResponse:
    return DocumentResponse(
        document_id=stored.document_id,
        filename=stored.filename,
        status=stored.status,
        created_at=stored.created_at,
        markdown=stored.markdown,
        errors=stored.errors,
    )


def _to_chunk(result: ChunkResult) -> DocumentChunk:
    return DocumentChunk(
        index=result.index,
        text=result.text,
        raw_text=result.raw_text,
        num_tokens=result.num_tokens,
        headings=result.headings,
        captions=result.captions,
        page_numbers=result.page_numbers,
        doc_items=result.doc_items,
    )


@router.post("", response_model=DocumentResponse)
async def create_document(request: Request, file: UploadFile) -> DocumentResponse:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="uploaded file is empty")
    stored = await request.app.state.convert_document.execute(file.filename or "upload.bin", data)
    return _to_response(stored)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: str, request: Request) -> DocumentResponse:
    stored = request.app.state.document_store.get(document_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="document not found")
    return _to_response(stored)


@router.delete("/{document_id}", status_code=204)
async def delete_document(document_id: str, request: Request) -> None:
    if not request.app.state.document_store.delete(document_id):
        raise HTTPException(status_code=404, detail="document not found")


@router.post("/chunks", response_model=ChunkDocumentResponse)
async def chunk_document(request: Request, file: UploadFile) -> ChunkDocumentResponse:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="uploaded file is empty")
    filename = file.filename or "upload.bin"
    try:
        results = await request.app.state.chunk_document.execute(filename, data)
    except ChunkingFailed as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return ChunkDocumentResponse(filename=filename, chunks=[_to_chunk(r) for r in results])
