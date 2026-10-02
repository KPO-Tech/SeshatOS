import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from export_openapi import schema_text  # noqa: E402


def test_the_checked_in_openapi_schema_is_current():
    checked_in = (ROOT / "openapi.json").read_text(encoding="utf-8").replace("\r\n", "\n")
    assert checked_in == schema_text(), "run `python scripts/export_openapi.py` and commit the result"


def test_streaming_endpoints_are_described_for_generated_clients():
    import json

    schema = json.loads(schema_text())
    assert "ConnectorEvent" in schema["components"]["schemas"]
    for name in ("sync", "slim", "permissions", "identities"):
        content = schema["paths"][f"/v1/connectors/{{kind}}/{name}"]["post"]["responses"]["200"]["content"]
        assert content["application/x-ndjson"]["schema"] == {"$ref": "#/components/schemas/ConnectorEvent"}
