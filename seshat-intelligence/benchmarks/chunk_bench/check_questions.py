"""Checks questions.json against the documents it asks about, before any chunk is made.

For every question: the document exists in CHUNK_BENCH_DIR/md, an id is used once, and each answer string is found in the
text of the document (compared as evaluate.py does). A string found nowhere can never be a hit, whatever the chunker; a
string found many times makes a question that several passages answer, which is allowed but worth a look (--verbose counts them
for every question). Exits with 1 when a question is broken."""

import argparse
import json
import os
import sys
from collections import Counter

from matching import norm

HERE = os.path.dirname(os.path.abspath(__file__))
SP = os.environ.get("CHUNK_BENCH_DIR", ".")


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # the questions hold euro signs and Cyrillic; a Windows console is not UTF-8
    parser = argparse.ArgumentParser()
    parser.add_argument("--verbose", action="store_true", help="print, for every question, how many times each answer group is found")
    parser.add_argument("--max-occurrences", type=int, default=3, help="warn when an answer group is found more often than this")
    args = parser.parse_args()

    questions = json.load(open(os.path.join(HERE, "questions.json"), encoding="utf-8"))
    texts, broken, per_doc = {}, 0, Counter()
    ids = Counter(q["id"] for q in questions)
    for q in questions:
        per_doc[q["doc"]] += 1
        if ids[q["id"]] > 1:
            print(f"{q['id']}: id used {ids[q['id']]} times")
            broken += 1
        path = os.path.join(SP, "md", q["doc"] + ".md")
        if q["doc"] not in texts:
            texts[q["doc"]] = norm(open(path, encoding="utf-8").read()) if os.path.exists(path) else None
        text = texts[q["doc"]]
        if text is None:
            print(f"{q['id']}: no text for {q['doc']}")
            broken += 1
            continue
        group_counts = []
        for group in q["answers"]:
            # Occurrences of the rarest string of the group bound how many places can hold the whole group.
            group_counts.append(min(text.count(norm(a)) for a in group))
        if not any(group_counts):
            print(f"{q['id']} ({q['doc']}): answer not in the text: {q['answers']}")
            broken += 1
        elif max(group_counts) > args.max_occurrences:
            print(f"{q['id']} ({q['doc']}): answer found {max(group_counts)} times, several passages answer: {q['answers']}")
        if args.verbose:
            print(f"{q['id']}: {q['q']}  ->  {group_counts}")
    print(f"{len(questions)} questions on {len(per_doc)} documents, {broken} broken")
    for doc, n in sorted(per_doc.items()):
        print(f"  {n:3d}  {doc}")
    sys.exit(1 if broken else 0)


if __name__ == "__main__":
    main()
