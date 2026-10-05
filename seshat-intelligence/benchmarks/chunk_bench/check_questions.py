"""Checks a file of questions against the documents it asks about, before any chunk is made.

For every question: the document exists in CHUNK_BENCH_DIR/md, an id is used once, and each answer string is found in the text of
the document (compared as evaluate.py does). A string found nowhere can never be a hit, whatever the chunker; a string found many
times makes a question that several passages answer, which is allowed but worth a look (--verbose counts them).

A question with "evidence" needs several passages. For those, the distance between the passages is reported, in tokens (a token
is about four characters of the text as it is written): passages less than 256 tokens apart can share a chunk of any size,
passages between 256 and 512 tokens apart only from 512 up, and farther ones need two chunks up to 512 tokens (a chunk of 1024
can hold passages up to about 700 tokens apart), which is what makes such a question say something about the size of chunks. Exits with 1 when a question is broken."""

import argparse
import json
import os
import sys
from collections import Counter

from matching import evidence_items, norm

HERE = os.path.dirname(os.path.abspath(__file__))
SP = os.environ.get("CHUNK_BENCH_DIR", ".")


def first_offset(raw, groups):
    """Where, in the raw text, a passage is first found (the smallest start of a group), or None."""
    best = None
    for group in groups:
        # The strings are compared without spaces or punctuation, so they are looked for in the text read the same way.
        text = norm(raw)
        position = text.find(norm(group[0]))
        if position >= 0 and all(norm(a) in text for a in group):
            best = position if best is None else min(best, position)
    return best


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # the questions hold euro signs and Cyrillic; a Windows console is not UTF-8
    parser = argparse.ArgumentParser()
    parser.add_argument("questions", nargs="?", default="questions.json", help="the file of questions, in this directory")
    parser.add_argument("--verbose", action="store_true", help="print, for every question, how many times each passage is found")
    parser.add_argument("--max-occurrences", type=int, default=3, help="warn when a passage is found more often than this")
    args = parser.parse_args()

    questions = json.load(open(os.path.join(HERE, args.questions), encoding="utf-8"))
    raws, broken, per_doc, distances = {}, 0, Counter(), []
    ids = Counter(q["id"] for q in questions)
    for q in questions:
        per_doc[q["doc"]] += 1
        if ids[q["id"]] > 1:
            print(f"{q['id']}: id used {ids[q['id']]} times")
            broken += 1
        path = os.path.join(SP, "md", q["doc"] + ".md")
        if q["doc"] not in raws:
            raws[q["doc"]] = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        raw = raws[q["doc"]]
        if raw is None:
            print(f"{q['id']}: no text for {q['doc']}")
            broken += 1
            continue
        text = norm(raw)
        counts, offsets = [], []
        for groups in evidence_items(q):
            counts.append(max(min(text.count(norm(a)) for a in group) for group in groups))
            offsets.append(first_offset(raw, groups))
        if not all(counts):
            print(f"{q['id']} ({q['doc']}): a passage is not in the text: {q.get('evidence') or q['answers']}")
            broken += 1
            continue
        if max(counts) > args.max_occurrences:
            print(f"{q['id']} ({q['doc']}): a passage is found {max(counts)} times, several places give it: {q.get('evidence') or q['answers']}")
        if len(offsets) > 1:
            # The offsets count characters of the normalised text; scaled back to the text as written, four characters are a token.
            spread = (max(offsets) - min(offsets)) * len(raw) / len(text) / 4
            distances.append(spread)
            if args.verbose:
                print(f"{q['id']}: {len(offsets)} passages, {spread:.0f} tokens apart")
        elif args.verbose:
            print(f"{q['id']}: {q['q']}  ->  {counts}")
    print(f"{len(questions)} questions on {len(per_doc)} documents, {broken} broken")
    if distances:
        near = sum(d < 256 for d in distances)
        middle = sum(256 <= d < 512 for d in distances)
        far = sum(d >= 512 for d in distances)
        print(f"{len(distances)} need several passages: {near} less than 256 tokens apart, {middle} between 256 and 512, {far} farther")
    for doc, n in sorted(per_doc.items()):
        print(f"  {n:3d}  {doc}")
    sys.exit(1 if broken else 0)


if __name__ == "__main__":
    main()
