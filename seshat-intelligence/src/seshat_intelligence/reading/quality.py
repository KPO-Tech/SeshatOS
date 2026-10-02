"""Detects text that was technically extracted but is not usable.

This is the classic broken-font-encoding failure of naive PDF text extraction, distinct from "there is
not much text". It mirrors seshat/internal/textquality in the Go engine so both sides judge text the
same way.
"""

from __future__ import annotations

import re
import unicodedata

# PDF extractors emit "(cid:123)" literally when a font glyph has no mapping back to Unicode. Seeing
# even one is an unambiguous sign of broken extraction.
_CID_PLACEHOLDER = re.compile(r"\(cid:\d+\)")

# Real text has about 0% private-use code points. A subsetted font whose glyph ids are misread as
# Unicode lands many of them in the private-use ranges, so more than 5% is a strong signal.
PRIVATE_USE_RATIO_THRESHOLD = 0.05


def is_garbled_text(text: str) -> bool:
    if not text.strip():
        return False  # empty is a separate case (sparse), not garbled
    if _CID_PLACEHOLDER.search(text):
        return True
    private_use = sum(1 for char in text if unicodedata.category(char) == "Co")
    return private_use / len(text) > PRIVATE_USE_RATIO_THRESHOLD
