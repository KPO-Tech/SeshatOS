from __future__ import annotations

from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from seshat_intelligence.connectors.base import (
    AnyEvent,
    Connector,
    PermissionsCapable,
    SlimCapable,
    SyncCapable,
    capabilities_of,
)
from seshat_intelligence.connectors.models import (
    ConnectorInfo,
    ConnectorRequest,
    Failure,
    FailureEvent,
    PermissionsRequest,
    SyncRequest,
    ValidateResponse,
)
from seshat_intelligence.connectors.registry import ConnectorRegistry

router = APIRouter(prefix="/v1/connectors", tags=["connectors"])

NDJSON = "application/x-ndjson"


def _connector(request: Request, kind: str) -> Connector:
    registry: ConnectorRegistry = request.app.state.connector_registry
    connector = registry.get(kind)
    if connector is None:
        raise HTTPException(status_code=404, detail=f"unknown connector {kind!r}")
    return connector


def _require(connector: Connector, capability: type, name: str) -> None:
    if not isinstance(connector, capability):
        raise HTTPException(status_code=501, detail=f"connector {connector.kind!r} does not support {name}")


def _line(event: BaseModel) -> bytes:
    return event.model_dump_json(exclude_none=True).encode() + b"\n"


async def _ndjson(events: AsyncIterator[AnyEvent], stage: str) -> AsyncIterator[bytes]:
    """One JSON object per line. An unexpected exception inside a stream can no longer change the
    HTTP status, so it is reported as a final failure event instead of a silently truncated body."""
    try:
        async for event in events:
            yield _line(event)
    except Exception as exc:  # noqa: BLE001 - reported to the caller as an event
        yield _line(FailureEvent(failure=Failure(stage=stage, code="worker_error", message=str(exc), retryable=True)))


@router.get("", response_model=list[ConnectorInfo])
async def list_connectors(request: Request) -> list[ConnectorInfo]:
    registry: ConnectorRegistry = request.app.state.connector_registry
    return [ConnectorInfo(kind=kind, capabilities=capabilities_of(registry.get(kind))) for kind in registry.kinds()]


@router.post("/{kind}/validate", response_model=ValidateResponse)
async def validate(kind: str, body: ConnectorRequest, request: Request) -> ValidateResponse:
    return await _connector(request, kind).validate(body)


@router.post("/{kind}/sync")
async def sync(kind: str, body: SyncRequest, request: Request) -> StreamingResponse:
    connector = _connector(request, kind)
    _require(connector, SyncCapable, "sync")
    return StreamingResponse(_ndjson(connector.sync(body), "fetch"), media_type=NDJSON)


@router.post("/{kind}/slim")
async def slim(kind: str, body: ConnectorRequest, request: Request) -> StreamingResponse:
    connector = _connector(request, kind)
    _require(connector, SlimCapable, "slim listing")
    return StreamingResponse(_ndjson(connector.slim(body), "fetch"), media_type=NDJSON)


@router.post("/{kind}/permissions")
async def permissions(kind: str, body: PermissionsRequest, request: Request) -> StreamingResponse:
    connector = _connector(request, kind)
    _require(connector, PermissionsCapable, "permission refresh")
    return StreamingResponse(_ndjson(connector.permissions(body), "permissions"), media_type=NDJSON)
