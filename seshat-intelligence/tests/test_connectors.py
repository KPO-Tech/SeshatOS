import json
from typing import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from seshat_intelligence.connectors.base import (
    AnyEvent,
    Connector,
    PermissionsCapable,
    SlimCapable,
    SyncCapable,
)
from seshat_intelligence.connectors.models import (
    Checkpoint,
    CheckpointEvent,
    ConnectorRequest,
    DeletedEvent,
    Document,
    DocumentEvent,
    Failure,
    FailureEvent,
    PermissionEvent,
    PermissionsRequest,
    SlimDocument,
    SlimEvent,
    SyncRequest,
    ValidateResponse,
)
from seshat_intelligence.connectors.registry import ConnectorRegistry
from seshat_intelligence.connectors.routes import router


class FakeConnector(Connector, SyncCapable, SlimCapable, PermissionsCapable):
    kind = "fake"

    async def validate(self, request: ConnectorRequest) -> ValidateResponse:
        ok = request.credentials.get("token") == "good"
        return ValidateResponse(ok=ok, message="" if ok else "bad token")

    async def sync(self, request: SyncRequest) -> AsyncIterator[AnyEvent]:
        yield DocumentEvent(document=Document(id="a", source="fake", name="A", access=["user:a@example.com"]))
        yield FailureEvent(failure=Failure(id="b", stage="parse", code="unreadable", message="cannot read b"))
        yield DeletedEvent(ids=["c"])
        yield CheckpointEvent(checkpoint=Checkpoint(data={"cursor": "1"}))

    async def slim(self, request: ConnectorRequest) -> AsyncIterator[AnyEvent]:
        yield SlimEvent(slim=SlimDocument(id="a", access=["group:eng"]))

    async def permissions(self, request: PermissionsRequest) -> AsyncIterator[AnyEvent]:
        for resource_id in request.resource_ids:
            if resource_id != "unknown":
                yield PermissionEvent(id=resource_id, access=["public"])


class ValidateOnly(Connector):
    kind = "bare"

    async def validate(self, request: ConnectorRequest) -> ValidateResponse:
        return ValidateResponse(ok=True)


class Exploding(Connector, SyncCapable):
    kind = "exploding"

    async def validate(self, request: ConnectorRequest) -> ValidateResponse:
        return ValidateResponse(ok=True)

    async def sync(self, request: SyncRequest) -> AsyncIterator[AnyEvent]:
        yield DocumentEvent(document=Document(id="a", source="exploding", name="A"))
        raise RuntimeError("boom")


@pytest.fixture
def client() -> AsyncClient:
    app = FastAPI()
    registry = ConnectorRegistry()
    for connector in (FakeConnector(), ValidateOnly(), Exploding()):
        registry.register(connector)
    app.state.connector_registry = registry
    app.include_router(router)
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def lines(body: str) -> list[dict]:
    return [json.loads(line) for line in body.splitlines() if line]


@pytest.mark.parametrize("entry", ["user:a@example.com", "group:eng", "domain:example.com", "public"])
def test_access_entry_accepts_known_identities(entry):
    assert Document(id="1", source="s", name="n", access=[entry]).access == [entry]


@pytest.mark.parametrize("entry", ["", "user:", "team:x", "everyone", "USER:a"])
def test_access_entry_rejects_unknown_identities(entry):
    with pytest.raises(ValidationError):
        Document(id="1", source="s", name="n", access=[entry])


def test_unknown_access_is_distinct_from_empty_access():
    assert Document(id="1", source="s", name="n").access is None
    assert Document(id="1", source="s", name="n", access=[]).access == []


async def test_lists_connectors_with_capabilities(client):
    async with client:
        data = (await client.get("/v1/connectors")).json()
    assert data == [
        {"kind": "bare", "capabilities": []},
        {"kind": "exploding", "capabilities": ["sync"]},
        {"kind": "fake", "capabilities": ["sync", "slim", "permissions"]},
    ]


async def test_validate(client):
    async with client:
        ok = await client.post("/v1/connectors/fake/validate", json={"credentials": {"token": "good"}})
        bad = await client.post("/v1/connectors/fake/validate", json={"credentials": {"token": "nope"}})
    assert ok.json() == {"ok": True, "message": ""}
    assert bad.json() == {"ok": False, "message": "bad token"}


async def test_sync_streams_events_and_ends_with_checkpoint(client):
    async with client:
        response = await client.post("/v1/connectors/fake/sync", json={})
    assert response.headers["content-type"].startswith("application/x-ndjson")
    events = lines(response.text)
    assert [e["type"] for e in events] == ["document", "failure", "deleted", "checkpoint"]
    assert events[0]["document"]["access"] == ["user:a@example.com"]
    assert events[1]["failure"]["code"] == "unreadable"
    assert events[3]["checkpoint"] == {"version": 1, "data": {"cursor": "1"}}


async def test_slim_and_permissions(client):
    async with client:
        slim = await client.post("/v1/connectors/fake/slim", json={})
        perms = await client.post("/v1/connectors/fake/permissions", json={"resource_ids": ["a", "unknown"]})
    assert lines(slim.text) == [{"type": "slim", "slim": {"id": "a", "access": ["group:eng"]}}]
    # A resource that could not be confirmed is simply absent from the stream.
    assert lines(perms.text) == [{"type": "permission", "id": "a", "access": ["public"]}]


async def test_unknown_connector_is_404_and_missing_capability_is_501(client):
    async with client:
        missing = await client.post("/v1/connectors/nope/sync", json={})
        unsupported = await client.post("/v1/connectors/bare/sync", json={})
    assert missing.status_code == 404
    assert unsupported.status_code == 501


async def test_error_inside_stream_becomes_a_failure_event(client):
    async with client:
        response = await client.post("/v1/connectors/exploding/sync", json={})
    events = lines(response.text)
    assert [e["type"] for e in events] == ["document", "failure"]
    assert events[1]["failure"] == {"stage": "fetch", "code": "worker_error", "message": "boom", "retryable": True}


def test_duplicate_registration_is_refused():
    registry = ConnectorRegistry()
    registry.register(FakeConnector())
    with pytest.raises(ValueError):
        registry.register(FakeConnector())
