import json
import os
import sys
import time
from io import BytesIO

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src"))

from docling.datamodel.base_models import ConversionStatus  # noqa: E402
from docling_core.types.io import DocumentStream  # noqa: E402

from seshat_intelligence.providers.chunker.docling import DoclingHybridChunker  # noqa: E402
from seshat_intelligence.providers.hygiene import clean_text  # noqa: E402

# CHUNK_BENCH_DIR/raw holds the original files (see README.md); the chunks go to CHUNK_BENCH_DIR/chunks_docling.jsonl.
SP = os.environ.get("CHUNK_BENCH_DIR", ".")
RAW = os.path.join(SP, "raw")
SIZES = {"docling_default": None, "docling512": 512, "docling1024": 1024}

chunker = DoclingHybridChunker()
out = open(os.path.join(SP, "chunks_docling.jsonl"), "w", encoding="utf-8")
for doc in sorted(os.listdir(RAW)):
    with open(os.path.join(RAW, doc), "rb") as f:
        data = f.read()
    start = time.time()
    result = chunker._converter.convert(DocumentStream(name=doc, stream=BytesIO(data)), raises_on_error=False)
    took = time.time() - start
    if result.status not in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
        print(doc, "FAILED", flush=True)
        continue
    for name, size in SIZES.items():
        c = chunker._chunker_for(size)
        n = 0
        for i, chunk in enumerate(c.chunk(result.document)):
            text = clean_text(c.contextualize(chunk))
            out.write(json.dumps({"strategy": name, "doc": doc, "index": i, "text": text}, ensure_ascii=False) + "\n")
            n += 1
        print(f"{doc} {name}: {n} chunks (conversion {took:.1f}s)", flush=True)
out.close()
