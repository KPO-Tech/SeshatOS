from httpx import ASGITransport, AsyncClient

from seshat_intelligence.api.app import create_app
from seshat_intelligence.config import Settings

SAMPLE_MARKDOWN = (
    b"# Report Title\n\n"
    b"## Section One\n\n"
    b"This is the first section with enough content to form its own chunk.\n\n"
    b"## Section Two\n\n"
    b"This is the second section, distinct from the first one above.\n"
)


async def _client(tmp_path):
    app = create_app(Settings(storage_dir=tmp_path))
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_chunk_document_returns_hybrid_chunks(tmp_path):
    async with await _client(tmp_path) as client:
        response = await client.post(
            "/v1/documents/chunks",
            files={"file": ("report.md", SAMPLE_MARKDOWN, "text/markdown")},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["filename"] == "report.md"
        assert len(body["chunks"]) >= 2
        assert body["chunks"][0]["index"] == 0
        assert "Section One" in body["chunks"][0]["headings"]


async def test_chunk_document_rejects_empty_upload(tmp_path):
    async with await _client(tmp_path) as client:
        response = await client.post("/v1/documents/chunks", files={"file": ("empty.md", b"", "text/markdown")})
        assert response.status_code == 400
