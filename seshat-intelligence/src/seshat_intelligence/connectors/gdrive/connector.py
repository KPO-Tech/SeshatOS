"""Google Drive (read-only) connector.

A port of the Go connector in seshat/pkg/connectors/gdrive.go, with its known gaps closed:

- an item whose permissions cannot be read is not emitted (fail closed), instead of being treated as
  unrestricted, and is retried through the checkpoint;
- removals and trashed files become deleted events, and a slim listing exists for reconciliation;
- failures are reported per item and the checkpoint never moves past an item that failed;
- a link-only share is not mapped to public.

Group membership is not resolved here: group permissions are emitted as `group:<email>` and the
server resolves them.
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any, AsyncIterator

import httpx
from pydantic import BaseModel, Field

from seshat_intelligence.connectors.base import (
    AnyEvent,
    Connector,
    PermissionsCapable,
    SlimCapable,
    SyncCapable,
)
from seshat_intelligence.connectors.extraction import ExtractionError, Extractor
from seshat_intelligence.connectors.gdrive.acl import permissions_to_access
from seshat_intelligence.connectors.gdrive.client import DriveClient, DriveError, RateLimited
from seshat_intelligence.connectors.gdrive.filters import (
    EXPORT_MIME_TYPES,
    MAX_FILE_BYTES,
    is_allowed_file,
    is_text_file,
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
    Section,
    SlimDocument,
    SlimEvent,
    SyncRequest,
    ValidateResponse,
)

FILE_FIELDS = "id,name,mimeType,modifiedTime,trashed,size,webViewLink"
DEFAULT_PAGE_BUDGET = 10
PAGE_SIZE = 100
MAX_RETRY_IDS = 200
_SHARED = {"supportsAllDrives": "true", "includeItemsFromAllDrives": "true"}


class GDriveCheckpoint(BaseModel):
    phase: str = "bootstrap"  # "bootstrap" lists every file; "incremental" follows the change feed
    list_token: str | None = None
    changes_token: str | None = None
    retry_ids: list[str] = Field(default_factory=list)
    more: bool = False  # pages remain: the caller should come back for another pass


class GDriveConnector(Connector, SyncCapable, SlimCapable, PermissionsCapable):
    kind = "gdrive"

    def __init__(self, extractor: Extractor | None = None, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._extractor = extractor
        self._transport = transport

    def _client(self, request: ConnectorRequest) -> DriveClient:
        return DriveClient(request.credentials, request.config, transport=self._transport)

    def _list_params(self, request: ConnectorRequest) -> dict[str, str]:
        params = {"q": "trashed = false", "fields": f"nextPageToken, files({FILE_FIELDS})", "pageSize": str(PAGE_SIZE)}
        if request.config.get("include_shared_drives", True):
            params.update(_SHARED)
            params["corpora"] = "allDrives"
        return params

    # -- validate ----------------------------------------------------------------------------

    async def validate(self, request: ConnectorRequest) -> ValidateResponse:
        client = self._client(request)
        try:
            about = await client.get_json("/drive/v3/about", {"fields": "user(emailAddress)"})
            return ValidateResponse(ok=True, message=about.get("user", {}).get("emailAddress", ""))
        except (DriveError, RateLimited) as exc:
            return ValidateResponse(ok=False, message=str(exc))
        finally:
            await client.aclose()

    # -- sync --------------------------------------------------------------------------------

    async def sync(self, request: SyncRequest) -> AsyncIterator[AnyEvent]:
        client = self._client(request)
        budget = int(request.config.get("page_budget", DEFAULT_PAGE_BUDGET))
        state = _decode_checkpoint(request.checkpoint)
        retry: list[str] = []
        try:
            if state is None:
                start = await client.get_json("/drive/v3/changes/startPageToken", dict(_SHARED))
                state = GDriveCheckpoint(changes_token=start["startPageToken"])

            for file_id in state.retry_ids:
                async for event in self._retry_one(client, request, file_id, retry):
                    yield event

            state.more = False
            if state.phase == "bootstrap":
                async for event in self._bootstrap(client, request, state, budget, retry):
                    yield event
                state.more = state.phase == "bootstrap"
            else:
                async for event in self._incremental(client, request, state, budget, retry):
                    yield event
        except RateLimited as exc:
            # No checkpoint is emitted: the caller keeps its previous one and retries after the delay.
            yield FailureEvent(
                failure=Failure(stage="fetch", code="rate_limited", message=str(exc), retryable=True, retry_after_seconds=exc.retry_after)
            )
            return
        except DriveError as exc:
            yield FailureEvent(failure=Failure(stage="fetch", code=f"drive_{exc.status}", message=str(exc), retryable=exc.status >= 500))
            return
        finally:
            await client.aclose()

        state.retry_ids = list(dict.fromkeys(retry))[:MAX_RETRY_IDS]
        yield CheckpointEvent(checkpoint=Checkpoint(version=1, data=state.model_dump()), has_more=state.more)

    async def _bootstrap(self, client: DriveClient, request: SyncRequest, state: GDriveCheckpoint, budget: int, retry: list[str]) -> AsyncIterator[AnyEvent]:
        params = self._list_params(request)
        for _ in range(budget):
            page = dict(params)
            if state.list_token:
                page["pageToken"] = state.list_token
            listing = await client.get_json("/drive/v3/files", page)
            for file in listing.get("files", []):
                if not is_allowed_file(file.get("name", ""), file.get("mimeType", "")):
                    continue
                async for event in self._process_file(client, request, file, retry):
                    yield event
            state.list_token = listing.get("nextPageToken")
            if not state.list_token:
                state.phase = "incremental"
                return

    async def _incremental(self, client: DriveClient, request: SyncRequest, state: GDriveCheckpoint, budget: int, retry: list[str]) -> AsyncIterator[AnyEvent]:
        token = state.changes_token
        for _ in range(budget):
            page = {
                "pageToken": token,
                "pageSize": str(PAGE_SIZE),
                "fields": f"nextPageToken, newStartPageToken, changes(fileId, removed, file({FILE_FIELDS}))",
                **_SHARED,
            }
            changes = await client.get_json("/drive/v3/changes", page)
            removed: list[str] = []
            for change in changes.get("changes", []):
                file = change.get("file")
                if change.get("removed") or not file or file.get("trashed") or not is_allowed_file(file.get("name", ""), file.get("mimeType", "")):
                    # A file that left the allowed set is no longer wanted, so it is removed too.
                    if change.get("fileId"):
                        removed.append(change["fileId"])
                    continue
                async for event in self._process_file(client, request, file, retry):
                    yield event
            if removed:
                yield DeletedEvent(ids=removed)
            if changes.get("newStartPageToken"):
                state.changes_token = changes["newStartPageToken"]
                return
            token = changes.get("nextPageToken")
            state.changes_token = token
            if not token:
                return
        # Budget used up with pages remaining: ask the caller to come back.
        state.more = True

    async def _retry_one(self, client: DriveClient, request: SyncRequest, file_id: str, retry: list[str]) -> AsyncIterator[AnyEvent]:
        try:
            file = (await client.request("GET", f"/drive/v3/files/{file_id}", params={"fields": FILE_FIELDS, **_SHARED})).json()
        except DriveError as exc:
            if exc.status == 404:
                yield DeletedEvent(ids=[file_id])
                return
            retry.append(file_id)
            yield FailureEvent(failure=Failure(id=file_id, stage="fetch", code=f"drive_{exc.status}", message=str(exc), retryable=True))
            return
        if file.get("trashed") or not is_allowed_file(file.get("name", ""), file.get("mimeType", "")):
            yield DeletedEvent(ids=[file_id])
            return
        async for event in self._process_file(client, request, file, retry):
            yield event

    async def _process_file(self, client: DriveClient, request: SyncRequest, file: dict[str, Any], retry: list[str]) -> AsyncIterator[AnyEvent]:
        file_id, name, mime = file["id"], file.get("name", ""), file.get("mimeType", "")
        size = int(file["size"]) if str(file.get("size", "")).isdigit() else None
        if size is not None and size > MAX_FILE_BYTES:
            yield FailureEvent(failure=Failure(id=file_id, stage="fetch", code="too_large", message=f"{name} is {size} bytes", retryable=False))
            return

        # Permissions first, and the document is withheld if they cannot be read: emitting it with
        # no ACL would open it to the whole corpus.
        try:
            access = await self._fetch_access(client, file_id)
        except DriveError as exc:
            retry.append(file_id)
            yield FailureEvent(failure=Failure(id=file_id, stage="permissions", code=f"drive_{exc.status}", message=str(exc), retryable=True))
            return

        try:
            text, content_type = await self._read_text(client, file_id, name, mime)
        except DriveError as exc:
            retry.append(file_id)
            yield FailureEvent(failure=Failure(id=file_id, stage="fetch", code=f"drive_{exc.status}", message=str(exc), retryable=exc.status >= 500))
            return
        except ExtractionError as exc:
            yield FailureEvent(failure=Failure(id=file_id, stage="parse", code="extraction_failed", message=str(exc), retryable=False))
            return
        except RateLimited:
            raise
        except Exception as exc:  # noqa: BLE001 - an extractor crash must not end the whole sync
            retry.append(file_id)
            yield FailureEvent(failure=Failure(id=file_id, stage="parse", code="extractor_error", message=str(exc), retryable=True))
            return
        if text is None:
            yield FailureEvent(failure=Failure(id=file_id, stage="parse", code="unsupported_format", message=f"no extractor for {name}", retryable=False))
            return
        if not text.strip():
            yield FailureEvent(failure=Failure(id=file_id, stage="parse", code="empty_content", message=f"{name} has no extractable text", retryable=False))
            return

        yield DocumentEvent(
            document=Document(
                id=file_id,
                source=self.kind,
                name=name,
                url=file.get("webViewLink"),
                content_type=content_type,
                updated_at=_parse_time(file.get("modifiedTime")),
                content_hash=hashlib.sha256(text.encode()).hexdigest(),
                sections=[Section(kind="text", text=text, link=file.get("webViewLink"))],
                metadata={"mime_type": mime},
                access=access,
            )
        )

    async def _read_text(self, client: DriveClient, file_id: str, name: str, mime: str) -> tuple[str | None, str]:
        export_mime = EXPORT_MIME_TYPES.get(mime)
        if export_mime:
            response = await client.request("GET", f"/drive/v3/files/{file_id}/export", params={"mimeType": export_mime})
            return response.text, export_mime
        response = await client.request("GET", f"/drive/v3/files/{file_id}", params={"alt": "media", **_SHARED})
        data = response.content[:MAX_FILE_BYTES]
        if is_text_file(name):
            return data.decode("utf-8", errors="replace"), mime
        if self._extractor is None:
            return None, mime
        return await self._extractor(data, mime, name), mime

    async def _fetch_access(self, client: DriveClient, file_id: str) -> list[str]:
        permissions: list[dict[str, Any]] = []
        token: str | None = None
        while True:
            params = {"fields": "nextPageToken, permissions(type, emailAddress, domain, role, allowFileDiscovery)", "pageSize": "100", **_SHARED}
            if token:
                params["pageToken"] = token
            page = await client.get_json(f"/drive/v3/files/{file_id}/permissions", params)
            permissions.extend(page.get("permissions", []))
            token = page.get("nextPageToken")
            if not token:
                return permissions_to_access(permissions)

    # -- slim --------------------------------------------------------------------------------

    async def slim(self, request: ConnectorRequest) -> AsyncIterator[AnyEvent]:
        client = self._client(request)
        with_permissions = bool(request.config.get("with_permissions", False))
        try:
            token: str | None = None
            while True:
                params = self._list_params(request)
                if token:
                    params["pageToken"] = token
                listing = await client.get_json("/drive/v3/files", params)
                for file in listing.get("files", []):
                    if not is_allowed_file(file.get("name", ""), file.get("mimeType", "")):
                        continue
                    access = None
                    if with_permissions:
                        try:
                            access = await self._fetch_access(client, file["id"])
                        except DriveError:
                            access = None  # unconfirmed, so unknown rather than empty
                    yield SlimEvent(slim=SlimDocument(id=file["id"], access=access))
                token = listing.get("nextPageToken")
                if not token:
                    return
        except RateLimited as exc:
            yield FailureEvent(
                failure=Failure(stage="fetch", code="rate_limited", message=str(exc), retryable=True, retry_after_seconds=exc.retry_after)
            )
        except DriveError as exc:
            yield FailureEvent(failure=Failure(stage="fetch", code=f"drive_{exc.status}", message=str(exc), retryable=exc.status >= 500))
        finally:
            await client.aclose()

    # -- permissions -------------------------------------------------------------------------

    async def permissions(self, request: PermissionsRequest) -> AsyncIterator[AnyEvent]:
        client = self._client(request)
        try:
            for file_id in request.resource_ids:
                try:
                    access = await self._fetch_access(client, file_id)
                except DriveError:
                    continue  # not confirmed this pass: omitted, never reported as unrestricted
                yield PermissionEvent(id=file_id, access=access)
        except RateLimited as exc:
            yield FailureEvent(
                failure=Failure(stage="permissions", code="rate_limited", message=str(exc), retryable=True, retry_after_seconds=exc.retry_after)
            )
        finally:
            await client.aclose()


def _decode_checkpoint(checkpoint: Checkpoint | None) -> GDriveCheckpoint | None:
    if checkpoint is None:
        return None
    if checkpoint.version != 1:
        raise ValueError(f"unsupported gdrive checkpoint version {checkpoint.version}")
    return GDriveCheckpoint.model_validate(checkpoint.data)


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
