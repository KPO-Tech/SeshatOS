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
import re
from datetime import datetime
from typing import Any, AsyncIterator

import httpx
from pydantic import BaseModel, Field

from seshat_intelligence.connectors.base import (
    AnyEvent,
    Connector,
    FiltersCapable,
    IdentitiesCapable,
    PermissionsCapable,
    PreviewCapable,
    SlimCapable,
    SyncCapable,
    UpstreamError,
)
from seshat_intelligence.connectors.extraction import ExtractionError, Extractor
from seshat_intelligence.connectors.gdrive.acl import permissions_to_access
from seshat_intelligence.connectors.gdrive.client import DriveClient, DriveError, RateLimited
from seshat_intelligence.connectors.gdrive.filters import (
    EXPORT_MIME_TYPES,
    FOLDER_MIME,
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
    FilterOption,
    FilterOptionsRequest,
    FilterOptionsResponse,
    GroupEvent,
    IdentityGroup,
    IdentityUser,
    PermissionEvent,
    PermissionsRequest,
    PreviewRequest,
    PreviewResponse,
    Section,
    SlimDocument,
    SlimEvent,
    SyncRequest,
    UserEvent,
    ValidateResponse,
)

FILE_FIELDS = "id,name,mimeType,modifiedTime,trashed,size,webViewLink"
DEFAULT_PAGE_BUDGET = 10
PAGE_SIZE = 100
MAX_RETRY_IDS = 200
_SHARED = {"supportsAllDrives": "true", "includeItemsFromAllDrives": "true"}
ADMIN_API_BASE = "https://admin.googleapis.com"
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")


class GDriveCheckpoint(BaseModel):
    phase: str = "bootstrap"  # "bootstrap" lists every file; "incremental" follows the change feed
    list_token: str | None = None
    changes_token: str | None = None
    retry_ids: list[str] = Field(default_factory=list)
    more: bool = False  # pages remain: the caller should come back for another pass


class GDriveConnector(Connector, SyncCapable, SlimCapable, PermissionsCapable, IdentitiesCapable, PreviewCapable, FiltersCapable):
    kind = "gdrive"
    # Each file carries its own sharing, so access is checked per record.
    permission_model = "record"

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

    # -- identities --------------------------------------------------------------------------

    async def identities(self, request: ConnectorRequest) -> AsyncIterator[AnyEvent]:
        """Users, groups and group members from the Admin SDK Directory API, so the server can resolve
        `group:` access entries. Needs a Google Workspace admin credential."""
        config = {**request.config, "api_base": request.config.get("admin_api_base", ADMIN_API_BASE)}
        client = DriveClient(request.credentials, config, transport=self._transport)
        customer = str(request.config.get("customer_id", "my_customer"))
        try:
            async for users in self._pages(client, "/admin/directory/v1/users", {"customer": customer, "maxResults": "500", "fields": "nextPageToken,users(primaryEmail,name(fullName),suspended)"}, "users"):
                for user in users:
                    if user.get("suspended") or not user.get("primaryEmail"):
                        continue
                    yield UserEvent(user=IdentityUser(email=user["primaryEmail"], name=(user.get("name") or {}).get("fullName")))
            groups = []
            async for page in self._pages(client, "/admin/directory/v1/groups", {"customer": customer, "maxResults": "200", "fields": "nextPageToken,groups(id,email,name)"}, "groups"):
                groups.extend(page)
            for group in groups:
                try:
                    members: list[str] = []
                    async for page in self._pages(client, f"/admin/directory/v1/groups/{group['id']}/members", {"maxResults": "200", "fields": "nextPageToken,members(email,type,status)"}, "members"):
                        members.extend(m["email"] for m in page if m.get("email") and m.get("type") in ("USER", "GROUP") and m.get("status", "ACTIVE") == "ACTIVE")
                except DriveError as exc:
                    # Unknown members must not be reported as an empty group: that would mean nobody.
                    yield FailureEvent(failure=Failure(id=group["id"], stage="permissions", code=f"drive_{exc.status}", message=f"could not list the members of {group.get('email', group['id'])}: {exc}", retryable=exc.status >= 500))
                    continue
                yield GroupEvent(group=IdentityGroup(id=group["id"], email=group.get("email"), name=group.get("name"), members=members))
        except RateLimited as exc:
            yield FailureEvent(failure=Failure(stage="permissions", code="rate_limited", message=str(exc), retryable=True, retry_after_seconds=exc.retry_after))
        except DriveError as exc:
            hint = " (a Google Workspace admin credential is required)" if exc.status in (401, 403) else ""
            yield FailureEvent(failure=Failure(stage="permissions", code=f"drive_{exc.status}", message=f"{exc}{hint}", retryable=exc.status >= 500))
        finally:
            await client.aclose()

    @staticmethod
    async def _pages(client: DriveClient, path: str, params: dict[str, str], key: str) -> AsyncIterator[list[dict[str, Any]]]:
        token: str | None = None
        while True:
            page_params = dict(params)
            if token:
                page_params["pageToken"] = token
            body = await client.get_json(path, page_params)
            yield body.get(key, [])
            token = body.get("nextPageToken")
            if not token:
                return

    # -- preview and filters -----------------------------------------------------------------

    async def preview(self, request: PreviewRequest) -> PreviewResponse:
        if not _SAFE_ID.match(request.resource_id):
            raise UpstreamError(400, "invalid resource id")
        client = self._client(request)
        try:
            file = await client.get_json(f"/drive/v3/files/{request.resource_id}", {"fields": "webViewLink,mimeType", **_SHARED})
            return PreviewResponse(url=file.get("webViewLink"), content_type=file.get("mimeType"))
        except RateLimited as exc:
            raise UpstreamError(429, str(exc), exc.retry_after) from exc
        except DriveError as exc:
            raise UpstreamError(404 if exc.status == 404 else 502, str(exc)) from exc
        finally:
            await client.aclose()

    async def filter_options(self, request: FilterOptionsRequest) -> FilterOptionsResponse:
        """Shared drives and the folders under a parent, to scope a source to part of a drive."""
        if request.parent_id is not None and not _SAFE_ID.match(request.parent_id):
            raise UpstreamError(400, "invalid parent id")
        client = self._client(request)
        options: list[FilterOption] = []
        try:
            if request.parent_id is None and request.config.get("include_shared_drives", True):
                async for page in self._pages(client, "/drive/v3/drives", {"pageSize": "100", "fields": "nextPageToken,drives(id,name)"}, "drives"):
                    options.extend(FilterOption(id=d["id"], name=d["name"], kind="drive", has_children=True) for d in page)
            parent = request.parent_id or "root"
            query = f"'{parent}' in parents and mimeType = '{FOLDER_MIME}' and trashed = false"
            params = {"q": query, "pageSize": "100", "fields": "nextPageToken,files(id,name)", **_SHARED}
            async for page in self._pages(client, "/drive/v3/files", params, "files"):
                options.extend(FilterOption(id=f["id"], name=f["name"], kind="folder", has_children=True) for f in page)
        except RateLimited as exc:
            raise UpstreamError(429, str(exc), exc.retry_after) from exc
        except DriveError as exc:
            raise UpstreamError(502, str(exc)) from exc
        finally:
            await client.aclose()
        return FilterOptionsResponse(options=options)


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
