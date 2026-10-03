import json

import httpx
import pytest
from fake_drive import DOC, FOLDER, FakeDrive, collect, file
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from seshat_intelligence.connectors.base import UpstreamError
from seshat_intelligence.connectors.gdrive import GDriveConnector
from seshat_intelligence.connectors.gdrive.acl import permissions_to_access
from seshat_intelligence.connectors.gdrive.filters import is_allowed_file
from seshat_intelligence.connectors.models import (
    Checkpoint,
    ConnectorRequest,
    FilterOptionsRequest,
    PermissionsRequest,
    PreviewRequest,
    SyncRequest,
)
from seshat_intelligence.connectors.registry import ConnectorRegistry
from seshat_intelligence.connectors.routes import router


@pytest.fixture
def drive():
    return FakeDrive()


def connector(drive, extractor=None):
    return GDriveConnector(extractor=extractor, transport=httpx.MockTransport(drive.handler))


def sync_request(checkpoint=None, **config):
    return SyncRequest(config=config, credentials={"access_token": "tok"}, checkpoint=checkpoint)


def by_type(events, kind):
    return [e for e in events if e.type == kind]


# -- pure mapping, mirroring the Go tests ----------------------------------------------------


def test_permissions_to_access_matches_the_go_behaviour():
    permissions = [
        {"type": "user", "emailAddress": "alice@example.com"},
        {"type": "group", "emailAddress": "eng-team@example.com"},
        {"type": "domain", "domain": "example.com"},
        {"type": "anyone", "allowFileDiscovery": True},
        {"type": "user", "emailAddress": ""},
        {"type": "group", "emailAddress": ""},
        {"type": "domain", "domain": ""},
        {"type": "owner", "emailAddress": "bob@example.com"},
    ]
    assert permissions_to_access(permissions) == ["user:alice@example.com", "group:eng-team@example.com", "domain:example.com", "public"]
    assert permissions_to_access([]) == []


def test_link_only_share_is_not_public():
    assert permissions_to_access([{"type": "anyone", "allowFileDiscovery": False}, {"type": "anyone"}]) == []


@pytest.mark.parametrize(
    ("name", "mime", "want"),
    [
        ("report.pdf", "application/pdf", True),
        ("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", True),
        ("readme.txt", "text/plain", True),
        ("notes.md", "text/markdown", True),
        ("Untitled document", DOC, True),
        ("script.py", "text/plain", False),
        ("analysis.ipynb", "application/json", False),
        ("config.yaml", "text/plain", False),
        ("noextension", "application/octet-stream", False),
        ("sheet.xlsx", "application/vnd.ms-excel", False),
        ("folder.pdf", FOLDER, False),
    ],
)
def test_allowed_files_match_the_go_allowlist(name, mime, want):
    assert is_allowed_file(name, mime) is want


# -- sync ------------------------------------------------------------------------------------


async def test_bootstrap_emits_allowed_files_with_access_and_a_final_checkpoint(drive):
    drive.files = {"1": file("1", "a.txt"), "2": file("2", "Plan", DOC), "3": file("3", "x.py"), "4": file("4", "Dir", FOLDER), "5": file("5", "r.pdf", "application/pdf")}
    drive.content = {"1": "hello", "2": "exported plan", "5": "pdf bytes"}
    drive.pages = [["1", "2", "3", "4", "5"]]
    drive.permissions = {"1": [{"type": "user", "emailAddress": "a@example.com"}], "2": [{"type": "domain", "domain": "example.com"}], "5": []}

    events = await collect(connector(drive).sync(sync_request()))

    documents = {e.document.id: e.document for e in by_type(events, "document")}
    assert sorted(documents) == ["1", "2"]
    assert documents["1"].access == ["user:a@example.com"]
    assert documents["2"].access == ["domain:example.com"]
    assert documents["2"].sections[0].text == "exported plan"
    # No extractor for a PDF: reported, not silently dropped.
    failures = by_type(events, "failure")
    assert [(f.failure.id, f.failure.code) for f in failures] == [("5", "unsupported_format")]
    last = events[-1]
    assert last.type == "checkpoint" and last.has_more is False
    assert last.checkpoint.data["phase"] == "incremental"
    assert last.checkpoint.data["changes_token"] == "start-1"


async def test_extractor_handles_binary_formats(drive):
    drive.files = {"5": file("5", "r.pdf", "application/pdf")}
    drive.content = {"5": "raw"}
    drive.pages = [["5"]]

    async def extractor(data, mime, name):
        return f"text from {name}"

    events = await collect(connector(drive, extractor).sync(sync_request()))
    assert by_type(events, "document")[0].document.sections[0].text == "text from r.pdf"


async def test_unreadable_permissions_withhold_the_document_and_it_is_retried(drive):
    drive.files = {"1": file("1", "a.txt"), "2": file("2", "b.txt")}
    drive.content = {"1": "one", "2": "two"}
    drive.pages = [["1", "2"]]
    drive.permissions = {"1": [], "2": [{"type": "user", "emailAddress": "b@example.com"}]}
    drive.permission_errors = {"1": 500}

    first = await collect(connector(drive).sync(sync_request()))

    assert [e.document.id for e in by_type(first, "document")] == ["2"]
    failure = by_type(first, "failure")[0].failure
    assert (failure.id, failure.stage, failure.retryable) == ("1", "permissions", True)
    checkpoint = first[-1].checkpoint
    assert checkpoint.data["retry_ids"] == ["1"]

    drive.permission_errors = {}
    drive.changes = [{"changes": [], "new_start": "start-2"}]
    second = await collect(connector(drive).sync(sync_request(checkpoint=checkpoint)))
    assert [e.document.id for e in by_type(second, "document")] == ["1"]
    assert second[-1].checkpoint.data["retry_ids"] == []


async def test_incremental_sync_emits_changes_and_deletions(drive):
    drive.files = {"1": file("1", "a.txt")}
    drive.content = {"1": "updated"}
    drive.permissions = {"1": [{"type": "user", "emailAddress": "a@example.com"}]}
    drive.changes = [
        {
            "changes": [
                {"fileId": "1", "file": file("1", "a.txt")},
                {"fileId": "2", "removed": True},
                {"fileId": "3", "file": file("3", "old.txt", trashed=True)},
                {"fileId": "4", "file": file("4", "gone.py")},
            ],
            "new_start": "start-2",
        }
    ]
    checkpoint = Checkpoint(data={"phase": "incremental", "changes_token": "c0"})

    events = await collect(connector(drive).sync(sync_request(checkpoint=checkpoint)))

    assert [e.document.id for e in by_type(events, "document")] == ["1"]
    assert by_type(events, "deleted")[0].ids == ["2", "3", "4"]
    assert events[-1].checkpoint.data["changes_token"] == "start-2"
    assert events[-1].has_more is False


async def test_page_budget_splits_a_bootstrap_across_calls(drive):
    drive.files = {"1": file("1", "a.txt"), "2": file("2", "b.txt")}
    drive.content = {"1": "one", "2": "two"}
    drive.pages = [["1"], ["2"]]
    drive.permissions = {"1": [], "2": []}

    first = await collect(connector(drive).sync(sync_request(page_budget=1)))
    assert [e.document.id for e in by_type(first, "document")] == ["1"]
    assert first[-1].has_more is True
    assert first[-1].checkpoint.data["list_token"] == "p1"

    second = await collect(connector(drive).sync(sync_request(checkpoint=first[-1].checkpoint, page_budget=1)))
    assert [e.document.id for e in by_type(second, "document")] == ["2"]
    assert second[-1].has_more is False
    assert second[-1].checkpoint.data["phase"] == "incremental"


async def test_rate_limit_reports_a_failure_and_no_checkpoint(drive):
    drive.rate_limit = True
    events = await collect(connector(drive).sync(sync_request()))
    assert [e.type for e in events] == ["failure"]
    assert events[0].failure.code == "rate_limited"
    assert events[0].failure.retry_after_seconds == 7.0
    assert events[0].failure.retryable is True


async def test_expired_token_is_refreshed_once(drive):
    drive.files = {"1": file("1", "a.txt")}
    drive.content = {"1": "one"}
    drive.pages = [["1"]]
    drive.permissions = {"1": []}
    request = SyncRequest(
        config={"token_url": "https://oauth2.googleapis.com/token", "api_base": "https://www.googleapis.com"},
        credentials={"access_token": "expired", "refresh_token": "r", "client_id": "c", "client_secret": "s"},
    )
    events = await collect(connector(drive).sync(request))
    assert [e.document.id for e in by_type(events, "document")] == ["1"]


async def test_too_large_file_is_reported_not_downloaded(drive):
    drive.files = {"1": file("1", "big.txt", size=50 * 1024 * 1024)}
    drive.pages = [["1"]]
    events = await collect(connector(drive).sync(sync_request()))
    assert by_type(events, "failure")[0].failure.code == "too_large"
    assert not [c for c in drive.calls if c[1].get("alt") == "media"]


# -- slim, permissions, validate ---------------------------------------------------------------


async def test_slim_lists_ids_and_optionally_access(drive):
    drive.files = {"1": file("1", "a.txt"), "2": file("2", "x.py")}
    drive.pages = [["1", "2"]]
    drive.permissions = {"1": [{"type": "group", "emailAddress": "eng@example.com"}]}
    plain = await collect(connector(drive).slim(ConnectorRequest(credentials={"access_token": "t"})))
    assert [(e.slim.id, e.slim.access) for e in plain] == [("1", None)]
    detailed = await collect(connector(drive).slim(ConnectorRequest(config={"with_permissions": True}, credentials={"access_token": "t"})))
    assert detailed[0].slim.access == ["group:eng@example.com"]


async def test_permissions_omit_resources_that_cannot_be_confirmed(drive):
    drive.permissions = {"1": [{"type": "user", "emailAddress": "a@example.com"}]}
    drive.permission_errors = {"2": 404}
    request = PermissionsRequest(credentials={"access_token": "t"}, resource_ids=["1", "2"])
    events = await collect(connector(drive).permissions(request))
    assert [(e.id, e.access) for e in events] == [("1", ["user:a@example.com"])]


async def test_validate(drive):
    ok = await connector(drive).validate(ConnectorRequest(credentials={"access_token": "t"}))
    assert (ok.ok, ok.message) == (True, "me@example.com")
    bad = await connector(drive).validate(ConnectorRequest(credentials={"access_token": "expired"}))
    assert bad.ok is False


async def test_routes_stream_a_gdrive_sync_as_ndjson(drive):
    drive.files = {"1": file("1", "a.txt")}
    drive.content = {"1": "one"}
    drive.pages = [["1"]]
    drive.permissions = {"1": [{"type": "user", "emailAddress": "a@example.com"}]}
    app = FastAPI()
    registry = ConnectorRegistry()
    registry.register(connector(drive))
    app.state.connector_registry = registry
    app.include_router(router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        listing = (await client.get("/v1/connectors")).json()
        response = await client.post("/v1/connectors/gdrive/sync", json={"credentials": {"access_token": "t"}})
    assert listing == [{"kind": "gdrive", "capabilities": ["sync", "slim", "permissions", "identities", "preview", "filters"], "permission_model": "record"}]
    events = [json.loads(line) for line in response.text.splitlines()]
    assert [e["type"] for e in events] == ["document", "checkpoint"]
    assert events[0]["document"]["access"] == ["user:a@example.com"]


# -- identities, filters, preview ------------------------------------------------------------------


def identities_request(**config):
    return ConnectorRequest(config=config, credentials={"access_token": "admin"})


async def test_identities_lists_users_groups_and_members(drive):
    drive.users = [
        {"primaryEmail": "alice@example.com", "name": {"fullName": "Alice A"}},
        {"primaryEmail": "gone@example.com", "suspended": True},
    ]
    drive.groups = [{"id": "g1", "email": "eng@example.com", "name": "Engineering"}]
    drive.members = {
        "g1": [
            {"email": "alice@example.com", "type": "USER", "status": "ACTIVE"},
            {"email": "platform@example.com", "type": "GROUP", "status": "ACTIVE"},
            {"email": "everyone@example.com", "type": "CUSTOMER"},
            {"email": "left@example.com", "type": "USER", "status": "SUSPENDED"},
        ]
    }
    events = await collect(connector(drive).identities(identities_request()))
    assert [e.type for e in events] == ["user", "group"]  # the suspended user is not listed
    assert (events[0].user.email, events[0].user.name) == ("alice@example.com", "Alice A")
    group = events[1].group
    assert (group.id, group.email) == ("g1", "eng@example.com")
    assert group.members == ["alice@example.com", "platform@example.com"]  # a nested group appears by email


async def test_a_group_whose_members_cannot_be_listed_is_reported_not_emitted_empty(drive):
    drive.groups = [{"id": "g1", "email": "a@example.com"}, {"id": "g2", "email": "b@example.com"}]
    drive.members = {"g1": 500, "g2": [{"email": "bob@example.com", "type": "USER"}]}
    events = await collect(connector(drive).identities(identities_request()))
    assert [e.type for e in events] == ["failure", "group"]
    assert (events[0].failure.id, events[0].failure.retryable) == ("g1", True)
    assert events[1].group.members == ["bob@example.com"]


async def test_identities_without_admin_access_is_one_clear_failure(drive):
    drive.admin_status = 403
    events = await collect(connector(drive).identities(identities_request()))
    assert [e.type for e in events] == ["failure"]
    assert events[0].failure.retryable is False and "admin credential" in events[0].failure.message


async def test_filter_options_lists_shared_drives_and_folders(drive):
    drive.drives = [{"id": "d1", "name": "Company"}]
    drive.folders = {"root": [{"id": "f1", "name": "Policies"}], "d1": [{"id": "f2", "name": "Legal"}]}
    top = await connector(drive).filter_options(FilterOptionsRequest(credentials={"access_token": "t"}))
    assert [(o.id, o.kind) for o in top.options] == [("d1", "drive"), ("f1", "folder")]
    inside = await connector(drive).filter_options(FilterOptionsRequest(credentials={"access_token": "t"}, parent_id="d1"))
    assert [(o.id, o.name) for o in inside.options] == [("f2", "Legal")]


@pytest.mark.parametrize("parent", ["x' or '1'='1", "a b", "../x"])
async def test_filter_options_rejects_ids_that_could_alter_the_query(drive, parent):
    with pytest.raises(UpstreamError) as caught:
        await connector(drive).filter_options(FilterOptionsRequest(credentials={"access_token": "t"}, parent_id=parent))
    assert caught.value.status == 400
    assert not drive.calls


async def test_preview_returns_the_link_to_the_original(drive):
    drive.files = {"1": file("1", "a.txt")}
    result = await connector(drive).preview(PreviewRequest(credentials={"access_token": "t"}, resource_id="1"))
    assert result.url == "https://drive/1"
    with pytest.raises(UpstreamError) as missing:
        await connector(drive).preview(PreviewRequest(credentials={"access_token": "t"}, resource_id="nope"))
    assert missing.value.status == 404
