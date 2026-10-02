"""Writes the service's OpenAPI schema to openapi.json. The Go client for seshat-server is generated
from this file, and tests/test_openapi.py fails when it is out of date.

    python scripts/export_openapi.py
"""

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from seshat_intelligence.api.app import create_app  # noqa: E402
from seshat_intelligence.config import Settings  # noqa: E402


def schema_text() -> str:
    with tempfile.TemporaryDirectory() as storage:
        app = create_app(Settings(storage_dir=Path(storage)))
        return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    (ROOT / "openapi.json").write_text(schema_text(), encoding="utf-8", newline="\n")
    print("wrote openapi.json")
