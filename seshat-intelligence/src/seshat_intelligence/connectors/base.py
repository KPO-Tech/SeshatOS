from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator

from seshat_intelligence.connectors.models import (
    ConnectorRequest,
    DocumentEvent,
    DeletedEvent,
    FailureEvent,
    CheckpointEvent,
    SlimEvent,
    PermissionEvent,
    PermissionsRequest,
    SyncRequest,
    ValidateResponse,
)

AnyEvent = DocumentEvent | DeletedEvent | FailureEvent | CheckpointEvent | SlimEvent | PermissionEvent


class Connector(ABC):
    """Every connector validates its credentials and configuration. The other capabilities are
    optional mixins, discovered by isinstance, so a connector declares only what it can do."""

    kind: str

    @abstractmethod
    async def validate(self, request: ConnectorRequest) -> ValidateResponse: ...


class SyncCapable(ABC):
    @abstractmethod
    def sync(self, request: SyncRequest) -> AsyncIterator[AnyEvent]:
        """Yield documents, deletions and failures, then exactly one checkpoint event last."""


class SlimCapable(ABC):
    @abstractmethod
    def slim(self, request: ConnectorRequest) -> AsyncIterator[AnyEvent]:
        """Yield one slim event per resource currently visible at the source."""


class PermissionsCapable(ABC):
    @abstractmethod
    def permissions(self, request: PermissionsRequest) -> AsyncIterator[AnyEvent]:
        """Yield a permission event per confirmed resource; omit those that could not be confirmed."""


def capabilities_of(connector: Connector) -> list[str]:
    found = []
    if isinstance(connector, SyncCapable):
        found.append("sync")
    if isinstance(connector, SlimCapable):
        found.append("slim")
    if isinstance(connector, PermissionsCapable):
        found.append("permissions")
    return found
