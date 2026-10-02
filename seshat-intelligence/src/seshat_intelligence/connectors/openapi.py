"""OpenAPI support for the NDJSON endpoints.

FastAPI cannot describe a stream of objects, so those endpoints would show no schema and a generated
client would have nothing to decode lines into. This registers the `Event` union as a component named
`ConnectorEvent` and points each streaming endpoint's `application/x-ndjson` response at it: one JSON
object per line, each a `ConnectorEvent`.
"""

from __future__ import annotations

from typing import Any

from pydantic import TypeAdapter

from seshat_intelligence.connectors.models import Event

STREAMING_PATHS = ("sync", "slim", "permissions", "identities")


def add_event_schemas(schema: dict[str, Any]) -> dict[str, Any]:
    event_schema = TypeAdapter(Event).json_schema(ref_template="#/components/schemas/{model}")
    components = schema.setdefault("components", {}).setdefault("schemas", {})
    for name, definition in event_schema.pop("$defs", {}).items():
        components.setdefault(name, definition)
    components["ConnectorEvent"] = event_schema
    for path, operations in schema.get("paths", {}).items():
        if not path.startswith("/v1/connectors/{kind}/") or path.rsplit("/", 1)[-1] not in STREAMING_PATHS:
            continue
        for operation in operations.values():
            ok = operation.setdefault("responses", {}).setdefault("200", {"description": "Successful Response"})
            ok["description"] = "One JSON object per line, each a ConnectorEvent."
            ok["content"] = {"application/x-ndjson": {"schema": {"$ref": "#/components/schemas/ConnectorEvent"}}}
    return schema
