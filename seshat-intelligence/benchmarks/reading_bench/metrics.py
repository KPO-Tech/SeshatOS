"""Scores a reader's output against what a person knows the document contains.

There is no single "quality" number for reading a document, so each check is separate and answers
one question a Knowledge deployment cares about: is the text there, in reading order, with its
headings, with tables kept as tables, and on the right page. A check with no expectation, or that the
reader cannot answer (no page information), is None, never 0, so a reader is not penalised for what
it does not claim to do.
"""

from __future__ import annotations

import bisect
import re
import unicodedata
from dataclasses import dataclass, field

from seshat_intelligence.reading.quality import is_garbled_text

_HEADING = re.compile(r"^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$")


def normalize(text: str) -> str:
    """Case, spacing, markdown emphasis and ligatures must not decide a match."""
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"[*_`]", "", text)
    return re.sub(r"\s+", " ", text).strip()


@dataclass(slots=True)
class Expectation:
    phrases: list[str] = field(default_factory=list)  # text that must be present, listed in reading order
    headings: list[str] = field(default_factory=list)
    tables: list[list[list[str]]] = field(default_factory=list)  # each table is a list of rows of cells
    pages: dict[str, int] = field(default_factory=dict)  # phrase -> the page it is on

    @classmethod
    def from_dict(cls, raw: dict) -> "Expectation":
        return cls(
            phrases=list(raw.get("phrases", [])),
            headings=list(raw.get("headings", [])),
            tables=[[list(row) for row in table] for table in raw.get("tables", [])],
            pages={str(k): int(v) for k, v in raw.get("pages", {}).items()},
        )


def phrase_recall(markdown: str, phrases: list[str]) -> float | None:
    if not phrases:
        return None
    text = normalize(markdown)
    return sum(1 for phrase in phrases if normalize(phrase) in text) / len(phrases)


def reading_order(markdown: str, phrases: list[str]) -> float | None:
    """Of the phrases that were found, the share that appear in the order they were listed
    (the longest increasing run of positions). Interleaved columns score low."""
    text = normalize(markdown)
    positions = [text.find(normalize(phrase)) for phrase in phrases]
    found = [p for p in positions if p >= 0]
    if len(found) < 2:
        return None
    tails: list[int] = []
    for position in found:
        index = bisect.bisect_left(tails, position)
        if index == len(tails):
            tails.append(position)
        else:
            tails[index] = position
    return len(tails) / len(found)


def heading_lines(markdown: str) -> list[str]:
    return [normalize(match.group(1)) for line in markdown.splitlines() if (match := _HEADING.match(line))]


def heading_recall(markdown: str, headings: list[str]) -> float | None:
    if not headings:
        return None
    found = heading_lines(markdown)
    return sum(1 for heading in headings if any(normalize(heading) in line for line in found)) / len(headings)


def table_rows_intact(markdown: str, tables: list[list[list[str]]]) -> float | None:
    """A row counts only when all its cells sit on one markdown table line, in order. Text that
    has the right words but lost the table structure scores zero here (see table_text_present)."""
    rows = [row for table in tables for row in table]
    if not rows:
        return None
    lines = [normalize(line) for line in markdown.splitlines() if line.lstrip().startswith("|")]
    return sum(1 for row in rows if any(_cells_in_order(line, row) for line in lines)) / len(rows)


def table_text_present(markdown: str, tables: list[list[list[str]]]) -> float | None:
    cells = [cell for table in tables for row in table for cell in row]
    if not cells:
        return None
    text = normalize(markdown)
    return sum(1 for cell in cells if normalize(cell) in text) / len(cells)


def _cells_in_order(line: str, row: list[str]) -> bool:
    start = 0
    for cell in row:
        found = line.find(normalize(cell), start)
        if found < 0:
            return False
        start = found + len(normalize(cell))
    return True


def page_accuracy(pages: dict[int, str] | None, expected: dict[str, int]) -> float | None:
    """None when the reader gives no per-page text: that is a missing capability, not an error."""
    if not expected or pages is None:
        return None
    correct = sum(1 for phrase, page in expected.items() if normalize(phrase) in normalize(pages.get(page, "")))
    return correct / len(expected)


@dataclass(slots=True)
class Scores:
    phrase_recall: float | None
    reading_order: float | None
    heading_recall: float | None
    table_rows_intact: float | None
    table_text_present: float | None
    page_accuracy: float | None
    heading_count: int
    chars: int
    garbled: bool


def score(markdown: str, pages: dict[int, str] | None, expectation: Expectation) -> Scores:
    return Scores(
        phrase_recall=phrase_recall(markdown, expectation.phrases),
        reading_order=reading_order(markdown, expectation.phrases),
        heading_recall=heading_recall(markdown, expectation.headings),
        table_rows_intact=table_rows_intact(markdown, expectation.tables),
        table_text_present=table_text_present(markdown, expectation.tables),
        page_accuracy=page_accuracy(pages, expectation.pages),
        heading_count=len(heading_lines(markdown)),
        chars=len(markdown),
        garbled=bool(markdown.strip()) and is_garbled_text(markdown),
    )
