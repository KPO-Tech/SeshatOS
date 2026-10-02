from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator

from seshat_intelligence.connectors.models import (
    CheckpointEvent,
    ConnectorRequest,
    DeletedEvent,
    DocumentEvent,
    FailureEvent,
    FilterOptionsRequest,
    FilterOptionsResponse,
    GroupEvent,
    PermissionEvent,
    PermissionModel,
    PermissionsRequest,
    PreviewRequest,
    PreviewResponse,
    SlimEvent,
    SyncRequest,
    UserEvent,
    ValidateResponse,
    WebhookRequest,
    WebhookResponse,
)

AnyEvent = (
    DocumentEvent | DeletedEvent | FailureEvent | CheckpointEvent | SlimEvent | PermissionEvent | UserEvent | GroupEvent
)


class UpstreamError(Exception):
    """A request-style call (preview, filter options) the source refused or could not serve. The routes
    turn it into an HTTP error carrying the status, and Retry-After when the source asked us to back off."""

    def __init__(self, status: int, message: str, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after


class Connector(ABC):
    """Every connector validates its credentials and configuration. The other capabilities are
    optional mixins, discovered by isinstance, so a connector declares only what it can do."""

    kind: str
    # How the server decides access to this source's records; see models.PermissionModel.
    permission_model: PermissionModel = "record"

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


class IdentitiesCapable(ABC):
    @abstractmethod
    def identities(self, request: ConnectorRequest) -> AsyncIterator[AnyEvent]:
        """Yield user and group events (with members) so the server can resolve group access entries."""


class PreviewCapable(ABC):
    @abstractmethod
    async def preview(self, request: PreviewRequest) -> PreviewResponse:
        """Where to open the original of one resource."""


class WebhookCapable(ABC):
    @abstractmethod
    async def handle_webhook(self, request: WebhookRequest) -> WebhookResponse:
        """Verify a push notification from the source and say what the server should do about it."""


class FiltersCapable(ABC):
    @abstractmethod
    async def filter_options(self, request: FilterOptionsRequest) -> FilterOptionsResponse:
        """The folders, drives or spaces under a parent that a source can be scoped to."""


def capabilities_of(connector: Connector) -> list[str]:
    found = []
    if isinstance(connector, SyncCapable):
        found.append("sync")
    if isinstance(connector, SlimCapable):
        found.append("slim")
    if isinstance(connector, PermissionsCapable):
        found.append("permissions")
    if isinstance(connector, IdentitiesCapable):
        found.append("identities")
    if isinstance(connector, PreviewCapable):
        found.append("preview")
    if isinstance(connector, WebhookCapable):
        found.append("webhook")
    if isinstance(connector, FiltersCapable):
        found.append("filters")
    return found
