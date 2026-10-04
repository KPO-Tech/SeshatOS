"""What makes a chunk an answer to a question, shared by evaluate.py and check_questions.py (no heavy imports)."""

import re

LIGATURES = {
    "ﬁ": "fi",
    "ﬂ": "fl",
    "ﬀ": "ff",
    "ﬃ": "ffi",
    "ﬄ": "ffl",
    "’": "'",
    "‘": "'",
    "“": '"',
    "”": '"',
    "–": "-",
    "—": "-",
    " ": " ",
}


def norm(text):
    """The text without spaces or punctuation, lower case. A reader that writes "non - GAAP" or "TensorRTTLLM" has not lost
    the answer, and a hyphen cut across two lines of a column does not hide it."""
    for ligature, plain in LIGATURES.items():
        text = text.replace(ligature, plain)
    return re.sub(r"[\W_]+", "", text.lower())


def tokens(text):
    """The words BM25 indexes. Ligatures are written out so that "ﬁne-tuned" is found by "fine"."""
    for ligature, plain in LIGATURES.items():
        text = text.replace(ligature, plain)
    return re.findall(r"\w+", text.lower())


def is_answer(chunk, question):
    """A chunk answers a question when it is from the right document and holds every string of one answer group."""
    if chunk["doc"] != question["doc"]:
        return False
    text = norm(chunk["text"])
    return any(all(norm(a) in text for a in group) for group in question["answers"])
