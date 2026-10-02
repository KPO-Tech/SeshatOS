"""Wire contract between seshat-server (Go, owns state) and the connector workers (Python, stateless).

See docs/decisions/0001-go-python-boundary.md. A worker call carries a connector kind, its
configuration, credentials and a checkpoint, and answers with a stream of events. Nothing here
persists anything: the caller stores documents, access entries and the returned checkpoint.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, Union

from pydantic import AfterValidator, BaseModel, Field

_IDENTITY_PREFIXES = ("user:", "group:", "domain:")


def _validate_access_entry(value: str) -> str:
    """Access entries are prefixed identities. An unknown prefix is rejected instead of passed
    through, so a connector bug cannot widen access by emitting something the server would ignore."""
    value = value.strip()
    if value == "public":
        return value
    for prefix in _IDENTITY_PREFIXES:
        if value.startswith(prefix) and len(value) > len(prefix):
            return value
    raise ValueError(f"unknown access entry {value!r}: expected 'public' or one of {_IDENTITY_PREFIXES}")


AccessEntry = Annotated[str, AfterValidator(_validate_access_entry)]


class Section(BaseModel):
    kind: Literal["text", "table", "image"] = "text"
    text: str | None = None
    link: str | None = None
    image_ref: str | None = None


class Document(BaseModel):
    id: str
    source: str
    name: str
    url: str | None = None
    content_type: str | None = None
    updated_at: datetime | None = None
    content_hash: str | None = None
    sections: list[Section] = Field(default_factory=list)
    metadata: dict[str, str | list[str]] = Field(default_factory=dict)
    # None means the source does not report ACLs: the server keeps its default (corpus-level
    # access). A list is authoritative, and an empty list means nobody but the corpus owners.
    access: list[AccessEntry] | None = None


class Failure(BaseModel):
    id: str | None = None
    stage: Literal["fetch", "parse", "permissions", "checkpoint"]
    code: str
    message: str
    retryable: bool = False
    # Set when the source asked us to back off (for example an HTTP Retry-After).
    retry_after_seconds: float | None = None


class Checkpoint(BaseModel):
    """Opaque to the server: it stores it and returns it on the next call. `version` lets a connector
    reject a checkpoint written by an older shape instead of misreading it."""

    version: int = 1
    data: dict[str, Any] = Field(default_factory=dict)


class ConnectorRequest(BaseModel):
    config: dict[str, Any] = Field(default_factory=dict)
    # Resolved by the server from its encrypted store for this single call.
    credentials: dict[str, str] = Field(default_factory=dict)


class SyncRequest(ConnectorRequest):
    checkpoint: Checkpoint | None = None


class PermissionsRequest(ConnectorRequest):
    resource_ids: list[str]


class ValidateResponse(BaseModel):
    ok: bool
    message: str = ""


class SlimDocument(BaseModel):
    """An id and its current ACL, without content. Used to detect deletions and refresh permissions."""

    id: str
    access: list[AccessEntry] | None = None


class DocumentEvent(BaseModel):
    type: Literal["document"] = "document"
    document: Document


class DeletedEvent(BaseModel):
    """The source says these resources no longer exist (for sources with a change feed)."""

    type: Literal["deleted"] = "deleted"
    ids: list[str]


class FailureEvent(BaseModel):
    type: Literal["failure"] = "failure"
    failure: Failure


class CheckpointEvent(BaseModel):
    """Always the last event of a successful sync. It must only move past items that succeeded."""

    type: Literal["checkpoint"] = "checkpoint"
    checkpoint: Checkpoint
    has_more: bool = False


class SlimEvent(BaseModel):
    type: Literal["slim"] = "slim"
    slim: SlimDocument


class PermissionEvent(BaseModel):
    """A resource whose ACL was confirmed this pass. Resources missing from the stream were not
    confirmed, and the server must leave their last known ACL untouched."""

    type: Literal["permission"] = "permission"
    id: str
    access: list[AccessEntry]


class IdentityUser(BaseModel):
    email: str
    name: str | None = None


class IdentityGroup(BaseModel):
    """A group at the source and its members. Members are emails; a member that is itself a group
    appears by its group email, so the server can resolve nesting."""

    id: str
    email: str | None = None
    name: str | None = None
    members: list[str] = Field(default_factory=list)


class UserEvent(BaseModel):
    type: Literal["user"] = "user"
    user: IdentityUser


class GroupEvent(BaseModel):
    type: Literal["group"] = "group"
    group: IdentityGroup


Event = Annotated[
    Union[
        DocumentEvent,
        DeletedEvent,
        FailureEvent,
        CheckpointEvent,
        SlimEvent,
        PermissionEvent,
        UserEvent,
        GroupEvent,
    ],
    Field(discriminator="type"),
]


class PreviewRequest(ConnectorRequest):
    resource_id: str


class PreviewResponse(BaseModel):
    """Where to open the original: a link at the source, or a short-lived download link."""

    url: str | None = None
    content_type: str | None = None


class WebhookRequest(ConnectorRequest):
    headers: dict[str, str] = Field(default_factory=dict)
    body: str = ""


class WebhookResponse(BaseModel):
    """What the server should do about a push notification from the source."""

    verified: bool
    sync: bool = False  # the server should run an incremental sync
    resource_ids: list[str] = Field(default_factory=list)  # the resources reported as changed, when known


class FilterOptionsRequest(ConnectorRequest):
    parent_id: str | None = None  # None lists the top level


class FilterOption(BaseModel):
    id: str
    name: str
    kind: Literal["folder", "drive", "space", "channel", "other"] = "folder"
    has_children: bool = False


class FilterOptionsResponse(BaseModel):
    """What the Sources page offers to scope a source (folders, shared drives, spaces)."""

    options: list[FilterOption] = Field(default_factory=list)


# How access to a source's records is decided. "app": reaching the source grants every record in it, so
# the server can skip a per-record check. "record": each record carries its own ACL and needs a check.
# A connector that does not say is treated as "record", the safe default.
PermissionModel = Literal["app", "record"]

Capability = Literal["sync", "slim", "permissions", "identities", "preview", "webhook", "filters"]


class ConnectorInfo(BaseModel):
    kind: str
    capabilities: list[Capability]
    permission_model: PermissionModel = "record"
