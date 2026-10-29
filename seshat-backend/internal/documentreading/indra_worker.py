"""Reads pages for SeshatOS with Indra OCR.

One JSON request per line on stdin ({"id": 1, "path": "..."}), one JSON answer per line on stdout ({"id": 1, "pages": ["..."]}, or
{"id": 1, "error": "..."}). The first line printed is {"ready": true}, once the models are loaded. Anything the libraries print
goes to stderr so that it cannot break the protocol. The process ends when stdin closes.
"""
import json
import sys


def main() -> None:
    reply = open(sys.stdout.fileno(), "w", encoding="utf-8", newline="\n", closefd=False)
    sys.stdout = sys.stderr
    sys.stdin.reconfigure(encoding="utf-8")

    import indra_ocr

    converter = indra_ocr.load()
    if "--check" in sys.argv:
        print(json.dumps({"ready": True, "version": getattr(indra_ocr, "__version__", "")}), file=reply, flush=True)
        return
    print(json.dumps({"ready": True}), file=reply, flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            pages = [page.markdown for _, page in converter.convert(request["path"])]
            answer = {"id": request_id, "pages": pages}
        except Exception as error:  # a page that cannot be read must not stop the worker
            answer = {"id": request_id, "error": f"{type(error).__name__}: {error}"}
        print(json.dumps(answer, ensure_ascii=False), file=reply, flush=True)


main()
