from httpx import ASGITransport, AsyncClient

from seshat_intelligence.api.app import create_app
from seshat_intelligence.config import Settings

SAMPLE_MARKDOWN = b"# Hello\n\nThis is a small test document with a **bold** word.\n"


async def _client(tmp_path):
    app = create_app(Settings(storage_dir=tmp_path))
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_create_and_get_document(tmp_path):
    async with await _client(tmp_path) as client:
        response = await client.post(
            "/v1/documents",
            files={"file": ("hello.md", SAMPLE_MARKDOWN, "text/markdown")},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"
        assert "Hello" in body["markdown"]
        assert body["errors"] == []
        document_id = body["document_id"]

        # The provider's full raw structured result and the original bytes
        # were kept on disk, not just the markdown - see DocumentStore's own
        # doc comment for why that matters for later re-chunking/re-embedding.
        doc_dir = tmp_path / document_id
        assert (doc_dir / "raw.json").exists()
        assert (doc_dir / "original.md").read_bytes() == SAMPLE_MARKDOWN

        get_response = await client.get(f"/v1/documents/{document_id}")
        assert get_response.status_code == 200
        assert get_response.json()["markdown"] == body["markdown"]


async def test_get_missing_document_returns_404(tmp_path):
    async with await _client(tmp_path) as client:
        response = await client.get("/v1/documents/doc_does_not_exist")
        assert response.status_code == 404


async def test_create_document_rejects_empty_upload(tmp_path):
    async with await _client(tmp_path) as client:
        response = await client.post("/v1/documents", files={"file": ("empty.md", b"", "text/markdown")})
        assert response.status_code == 400


async def test_delete_document(tmp_path):
    async with await _client(tmp_path) as client:
        create_response = await client.post(
            "/v1/documents",
            files={"file": ("hello.md", SAMPLE_MARKDOWN, "text/markdown")},
        )
        document_id = create_response.json()["document_id"]

        delete_response = await client.delete(f"/v1/documents/{document_id}")
        assert delete_response.status_code == 204

        get_response = await client.get(f"/v1/documents/{document_id}")
        assert get_response.status_code == 404
