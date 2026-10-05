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


def evidence_items(question):
    """The passages an answer needs, each as the alternative groups of strings that one chunk may hold to give it.

    A question with "answers" needs one passage: a chunk holding every string of any one of the groups. A question with
    "evidence" needs all of its items, each a list of strings that one chunk must hold together: an answer that is spread over
    several passages, which the chunks retrieved must cover between them."""
    if "evidence" in question:
        return [[item] for item in question["evidence"]]
    return [question["answers"]]


def covers(chunk, doc, groups):
    """A chunk gives a passage when it is from the right document and holds every string of one of the groups."""
    if chunk["doc"] != doc:
        return False
    text = norm(chunk["text"])
    return any(all(norm(a) in text for a in group) for group in groups)
