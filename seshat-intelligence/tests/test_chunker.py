from seshat_intelligence.providers.chunker.docling import DoclingHybridChunker

SAMPLE_MARKDOWN = (
    b"# Report Title\n\n"
    b"## Section One\n\n"
    b"This is the first section with enough content to form its own chunk.\n\n"
    b"## Section Two\n\n"
    b"This is the second section, distinct from the first one above.\n"
)


def test_docling_hybrid_chunker_splits_markdown_into_chunks():
    chunker = DoclingHybridChunker()
    chunks = chunker.chunk_bytes("sample.md", SAMPLE_MARKDOWN)

    assert len(chunks) >= 2
    first = chunks[0]
    assert first.index == 0
    assert "Section One" in first.headings
    assert first.num_tokens is not None and first.num_tokens > 0
    assert first.doc_items
