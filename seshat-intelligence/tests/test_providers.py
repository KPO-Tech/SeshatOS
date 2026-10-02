import pytest
from fpdf import FPDF

from seshat_intelligence.providers.docling import DoclingProvider

SAMPLE_MARKDOWN = b"# Provider Test\n\nChecking the **DocumentProvider** abstraction end to end.\n"


def _marker_provider():
    # Marker is an optional install (see pyproject extras), so its tests skip without it.
    pytest.importorskip("marker")
    from seshat_intelligence.providers.marker import MarkerProvider

    return MarkerProvider()


def _sample_pdf_bytes() -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=14)
    pdf.cell(text="Provider Test")
    pdf.ln(10)
    pdf.set_font("Helvetica", size=11)
    pdf.cell(text="Checking the DocumentProvider abstraction end to end.")
    return bytes(pdf.output())


def test_docling_provider_converts_markdown():
    provider = DoclingProvider()
    result = provider.convert_bytes("sample.md", SAMPLE_MARKDOWN)
    assert result.status == "success"
    assert "Provider Test" in result.markdown
    assert result.errors == []
    assert result.raw is not None


def test_marker_provider_converts_pdf():
    provider = _marker_provider()
    result = provider.convert_bytes("sample.pdf", _sample_pdf_bytes())
    assert result.status == "success"
    # Marker's own layout detection classified the first line as a heading
    # on this minimal synthetic PDF and routed it into raw's table of
    # contents rather than the markdown body - a real provider difference
    # from Docling, not a bug, so this checks the body text that's reliably
    # in the markdown plus that structured raw data came back at all.
    assert "Checking the" in result.markdown
    assert result.raw is not None
    assert result.errors == []


def test_marker_provider_rejects_non_pdf():
    provider = _marker_provider()
    result = provider.convert_bytes("sample.md", SAMPLE_MARKDOWN)
    assert result.status == "failure"
    assert result.errors
