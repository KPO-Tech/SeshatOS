"""Reads every file of CHUNK_BENCH_DIR/raw with the Go reader and writes CHUNK_BENCH_DIR/md/<file name>.md.

The Go reader is `benchmarks/readdoc` (native only, no external engine: a PDF page with a picture keeps its text and ends
with a marker such as "[Image 1 on page 3]"), built once into CHUNK_BENCH_DIR/readdoc[.exe]:

    cd benchmarks/readdoc && go build -o $CHUNK_BENCH_DIR/readdoc .

It prints the list of documents on the last line (the value to give to DOCS when dumping the chunks)."""

import json
import os
import subprocess
import sys

SP = os.environ.get("CHUNK_BENCH_DIR", ".")
RAW = os.path.join(SP, "raw")
MD = os.path.join(SP, "md")
READDOC = os.path.join(SP, "readdoc.exe" if os.name == "nt" else "readdoc")


def main():
    os.makedirs(MD, exist_ok=True)
    names, failed = [], []
    for name in sorted(os.listdir(RAW)):
        proc = subprocess.run([READDOC, os.path.join(RAW, name)], capture_output=True, check=False)
        out = json.loads(proc.stdout.decode("utf-8")) if proc.stdout else {"error": proc.stderr.decode("utf-8", "replace")}
        if out.get("error") or not out.get("markdown"):
            failed.append(name)
            print(f"{name}: {out.get('error') or 'empty'}", file=sys.stderr)
            continue
        with open(os.path.join(MD, name + ".md"), "w", encoding="utf-8", newline="\n") as f:
            f.write(out["markdown"])
        names.append(name)
        print(f"{name}: {len(out['markdown'])} characters ({out.get('source')})")
    print("DOCS=" + ",".join(names))
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
