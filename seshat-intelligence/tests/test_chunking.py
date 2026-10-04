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


LONG_MARKDOWN = ("# Report\n\n" + "\n\n".join(f"Paragraph {i} " + "word " * 40 for i in range(30))).encode()


async def _chunk(client, **data):
    return await client.post(
        "/v1/documents/chunks",
        files={"file": ("long.md", LONG_MARKDOWN, "text/markdown")},
        data=data,
    )


async def test_chunk_document_honours_the_size_the_host_asks_for(tmp_path):
    async with await _client(tmp_path) as client:
        small = await _chunk(client, max_tokens="64")
        large = await _chunk(client, max_tokens="512")
        assert small.status_code == 200 and large.status_code == 200
        small_chunks = small.json()["chunks"]
        large_chunks = large.json()["chunks"]
        assert all(c["num_tokens"] <= 64 for c in small_chunks), [c["num_tokens"] for c in small_chunks]
        assert all(c["num_tokens"] <= 512 for c in large_chunks)
        # A bigger limit means fewer, bigger chunks, and the bigger ones go past the tokenizer's own limit.
        assert len(small_chunks) > len(large_chunks)
        assert max(c["num_tokens"] for c in large_chunks) > 256


async def test_chunk_document_rejects_a_size_that_makes_no_sense(tmp_path):
    async with await _client(tmp_path) as client:
        assert (await _chunk(client, max_tokens="1")).status_code == 422
        assert (await _chunk(client, max_tokens="100000")).status_code == 422
