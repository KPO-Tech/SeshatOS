"""Repairs for the text an engine hands back, so a chunk is clean before it is embedded.

These fix defects that come from how PDFs encode text, not from the content: an accent drawn as its own
glyph and left standing apart from its letter, a ligature glyph, an invisible soft hyphen. Each is
something no document means to say, so repairing it cannot change meaning. Anything that might be on
purpose (spacing before French punctuation, a hyphen at a line end) is left alone.
"""

from __future__ import annotations

import re
import unicodedata

_COMBINING = "\u0300-\u036f"
# A combining accent standing apart from its letter, inside a word: "RE ́ GULARISATION". Not when the
# next character is a mathematical letter, where the accent belongs to that letter ("̂𝑥").
_SPLIT_ACCENT = re.compile(rf"(?<=[^\W\d_])[ ]?([{_COMBINING}]+)[ ]?(?=[^\W\d_])(?![\U0001D400-\U0001D7FF])")
_LIGATURES = {
    "\ufb00": "ff",
    "\ufb01": "fi",
    "\ufb02": "fl",
    "\ufb03": "ffi",
    "\ufb04": "ffl",
    "\ufb05": "st",
    "\ufb06": "st",
}
_INVISIBLE = re.compile("[\u00ad\u200b\u200c\u200d\u2060\ufeff]")


def clean_text(text: str) -> str:
    """The text with split accents joined, ligatures expanded, invisible characters removed, in NFC."""
    if not text:
        return text
    text = _INVISIBLE.sub("", text)
    for glyph, letters in _LIGATURES.items():
        text = text.replace(glyph, letters)
    text = _SPLIT_ACCENT.sub(lambda match: match.group(1), text)
    return unicodedata.normalize("NFC", text)


def replacement_characters(text: str) -> int:
    """How many U+FFFD the text holds: each one is a character the engine could not decode."""
    return text.count("\ufffd")
