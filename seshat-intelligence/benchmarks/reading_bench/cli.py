"""Compare document readers on your own documents.

  python -m reading_bench init DIR                 write a manifest to fill in
  python -m reading_bench run DIR --manifest M     run the readers and write the report

Every reader's output is also written to --dump-dir so the text can be read, which no score replaces.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from dataclasses import asdict
from pathlib import Path

from reading_bench.metrics import Expectation, Scores, score
from reading_bench.readers import Output, build

DOCUMENT_SUFFIXES = {".pdf", ".docx", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".html", ".htm"}
CHECKS = ["phrase_recall", "reading_order", "heading_recall", "table_rows_intact", "table_text_present", "page_accuracy"]


def documents(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in DOCUMENT_SUFFIXES)


def load_manifest(path: Path | None) -> dict[str, Expectation]:
    if path is None:
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {name: Expectation.from_dict(spec) for name, spec in raw.get("documents", {}).items()}


def init_manifest(root: Path) -> dict:
    template = {"phrases": [], "headings": [], "tables": [], "pages": {}}
    return {
        "_help": "phrases: text in reading order. headings: section titles. tables: a list of tables, each a list of rows of cells. pages: phrase -> page number.",
        "documents": {p.relative_to(root).as_posix(): dict(template) for p in documents(root)},
    }


def run(root: Path, manifest: dict[str, Expectation], readers: list, dump_dir: Path | None) -> list[dict]:
    rows: list[dict] = []
    for path in documents(root):
        key = path.relative_to(root).as_posix()
        expectation = manifest.get(key, Expectation())
        for reader in readers:
            output: Output = reader.read(path)
            scores: Scores | None = score(output.markdown, output.pages, expectation) if output.error is None else None
            rows.append({"document": key, "reader": reader.name, "seconds": round(output.seconds, 2), "engines": output.engines, "error": output.error, "scores": asdict(scores) if scores else None})
            if dump_dir is not None and output.error is None:
                target = dump_dir / reader.name / f"{key}.md"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(output.markdown, encoding="utf-8")
            print(f"{key} [{reader.name}] {'FAILED: ' + output.error if output.error else f'{output.seconds:.1f}s'}", file=sys.stderr)
    return rows


def _cell(values: list[float]) -> str:
    return f"{statistics.mean(values):.2f}" if values else "-"


def report(rows: list[dict]) -> str:
    names = sorted({r["reader"] for r in rows})
    lines = ["# Reading benchmark", "", "Scores are 0 to 1; `-` means no expectation was given or the reader cannot answer (for example page accuracy for a reader with no per-page text).", ""]
    lines += ["## By reader", "", "| reader | read | failed | garbled | s/doc | " + " | ".join(c.replace("_", " ") for c in CHECKS) + " |", "|" + "---|" * (5 + len(CHECKS))]
    for name in names:
        mine = [r for r in rows if r["reader"] == name]
        done = [r for r in mine if r["scores"]]
        cells = [_cell([r["scores"][c] for r in done if r["scores"][c] is not None]) for c in CHECKS]
        garbled = sum(1 for r in done if r["scores"]["garbled"])
        lines.append(f"| {name} | {len(done)} | {len(mine) - len(done)} | {garbled} | {_cell([r['seconds'] for r in mine])} | " + " | ".join(cells) + " |")
    lines += ["", "## By document", "", "| document | reader | s | chars | headings | " + " | ".join(c.replace("_", " ") for c in CHECKS) + " |", "|" + "---|" * (5 + len(CHECKS))]
    for r in rows:
        if r["error"]:
            lines.append(f"| {r['document']} | {r['reader']} | {r['seconds']} | FAILED: {r['error'][:80]} |" + " |" * (len(CHECKS) + 1))
            continue
        s = r["scores"]
        cells = ["-" if s[c] is None else f"{s[c]:.2f}" for c in CHECKS]
        lines.append(f"| {r['document']} | {r['reader']} | {r['seconds']} | {s['chars']} | {s['heading_count']} | " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="reading_bench", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init", help="write a manifest template for the documents in DIR")
    init.add_argument("directory", type=Path)
    run_cmd = sub.add_parser("run", help="run the readers on DIR")
    run_cmd.add_argument("directory", type=Path)
    run_cmd.add_argument("--manifest", type=Path)
    run_cmd.add_argument("--readers", default="go,service-custom,service-docling", help="comma separated: go, service-custom, service-docling, service-marker, docling-chunks")
    run_cmd.add_argument("--service-url", default="http://localhost:5100", help="seshat-intelligence")
    run_cmd.add_argument("--docling-url", default="http://localhost:5001", help="docling-serve, for docling-chunks")
    run_cmd.add_argument("--go-binary", default="readdoc", help="the benchmarks/readdoc tool")
    run_cmd.add_argument("--dump-dir", type=Path, help="write each reader's markdown here to read it")
    run_cmd.add_argument("--out", type=Path, default=Path("report.md"))
    args = parser.parse_args(argv)

    if args.command == "init":
        print(json.dumps(init_manifest(args.directory), indent=2, ensure_ascii=False))
        return 0
    readers = build([n.strip() for n in args.readers.split(",") if n.strip()], args.service_url, args.docling_url, args.go_binary)
    rows = run(args.directory, load_manifest(args.manifest), readers, args.dump_dir)
    args.out.write_text(report(rows), encoding="utf-8")
    args.out.with_suffix(".json").write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
