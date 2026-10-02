from pathlib import Path

from reading_bench.cli import init_manifest, report, run
from reading_bench.metrics import (
    Expectation,
    heading_recall,
    normalize,
    page_accuracy,
    phrase_recall,
    reading_order,
    score,
    table_rows_intact,
    table_text_present,
)
from reading_bench.readers import Output, _from_chunks


def test_normalize_ignores_case_spacing_emphasis_and_ligatures():
    assert normalize("  The **Restocking**\n fee ﬁnal ") == "the restocking fee final"


def test_phrase_recall_counts_found_phrases_and_is_none_without_expectation():
    assert phrase_recall("Refund policy. Fee is 10%.", ["refund policy", "fee is 10%", "absent"]) == 2 / 3
    assert phrase_recall("anything", []) is None


def test_reading_order_drops_when_columns_are_interleaved():
    in_order = "alpha one. alpha two. beta one. beta two."
    interleaved = "alpha one. beta one. alpha two. beta two."
    phrases = ["alpha one", "alpha two", "beta one", "beta two"]
    assert reading_order(in_order, phrases) == 1.0
    assert reading_order(interleaved, phrases) == 0.75
    assert reading_order("alpha one only", phrases) is None  # one phrase cannot be out of order


def test_heading_recall_reads_markdown_headings_only():
    markdown = "# Terms\n\nSome text mentioning Warranty.\n\n## Refunds ##\n"
    assert heading_recall(markdown, ["Terms", "Refunds", "Warranty"]) == 2 / 3


def test_a_table_flattened_to_text_has_its_words_but_no_intact_rows():
    table = [[["Item", "Price"], ["Cable", "12"]]]
    markdown_table = "| Item | Price |\n|---|---|\n| Cable | 12 |\n"
    flat = "Item Price Cable 12"
    assert table_rows_intact(markdown_table, table) == 1.0
    assert table_rows_intact(flat, table) == 0.0
    assert table_text_present(flat, table) == 1.0


def test_page_accuracy_is_none_for_a_reader_without_pages():
    assert page_accuracy(None, {"fee": 1}) is None
    assert page_accuracy({1: "the fee", 2: "warranty"}, {"fee": 1, "warranty": 1}) == 0.5


def test_chunks_become_markdown_with_heading_lines_and_pages():
    chunks = [
        {"raw_text": "Intro text", "headings": ["Policy"], "page_numbers": [1]},
        {"raw_text": "More policy", "headings": ["Policy"], "page_numbers": [1, 2]},
        {"raw_text": "Warranty text", "headings": ["Policy", "Warranty"], "page_numbers": [2]},
    ]
    output = _from_chunks(chunks, 1.0)
    assert output.markdown.splitlines()[0] == "# Policy"
    assert "## Warranty" in output.markdown
    assert output.pages is not None and "Warranty text" in output.pages[2] and "Intro text" in output.pages[1]


def test_score_flags_garbled_text():
    scores = score("(cid:47)(cid:12) (cid:8)(cid:91)(cid:3) (cid:44)(cid:5)", None, Expectation())
    assert scores.garbled is True and scores.phrase_recall is None


class FakeReader:
    def __init__(self, name: str, outputs: dict[str, Output]) -> None:
        self.name = name
        self._outputs = outputs

    def read(self, path: Path) -> Output:
        return self._outputs[path.name]


def test_run_scores_each_reader_and_keeps_a_failure_in_the_report(tmp_path):
    (tmp_path / "a.pdf").write_bytes(b"x")
    (tmp_path / "b.docx").write_bytes(b"x")
    manifest = {"a.pdf": Expectation(phrases=["restocking fee"], headings=["Refunds"])}
    good = FakeReader("good", {"a.pdf": Output(markdown="# Refunds\n\nThe restocking fee is 10%.", seconds=0.5), "b.docx": Output(markdown="text")})
    bad = FakeReader("bad", {"a.pdf": Output(markdown="nothing here"), "b.docx": Output(error="boom")})
    dump = tmp_path / "dump"
    rows = run(tmp_path, manifest, [good, bad], dump)

    assert (dump / "good" / "a.pdf.md").read_text(encoding="utf-8").startswith("# Refunds")
    by_key = {(r["document"], r["reader"]): r for r in rows}
    assert by_key[("a.pdf", "good")]["scores"]["phrase_recall"] == 1.0
    assert by_key[("a.pdf", "bad")]["scores"]["phrase_recall"] == 0.0
    assert by_key[("b.docx", "bad")]["error"] == "boom"

    text = report(rows)
    assert "FAILED: boom" in text and "| good |" in text


def test_init_manifest_lists_documents_with_empty_expectations(tmp_path):
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "c.pdf").write_bytes(b"x")
    (tmp_path / "notes.txt").write_text("ignored")
    manifest = init_manifest(tmp_path)
    assert list(manifest["documents"]) == ["sub/c.pdf"]
    assert manifest["documents"]["sub/c.pdf"] == {"phrases": [], "headings": [], "tables": [], "pages": {}}
