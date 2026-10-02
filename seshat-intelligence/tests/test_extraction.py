import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from fake_drive import FakeDrive, collect, file
from seshat_intelligence.api.app import create_app
from seshat_intelligence.config import Settings
from seshat_intelligence.connectors.extraction import ExtractionError, router_extractor
from seshat_intelligence.connectors.gdrive import GDriveConnector
from seshat_intelligence.connectors.models import SyncRequest
from seshat_intelligence.reading.models import ReadResult


class FakeRouter:
    def __init__(self, result):
        self.result = result
        self.calls = []

    async def read(self, filename, data, pdf_mode=None):
        self.calls.append((filename, data))
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


async def test_router_extractor_returns_the_markdown_of_a_readable_file():
    router = FakeRouter(ReadResult(ok=True, markdown="# Title"))
    assert await router_extractor(router)(b"bytes", "application/pdf", "a.pdf") == "# Title"
    assert router.calls == [("a.pdf", b"bytes")]


async def test_router_extractor_raises_with_the_routers_reason():
    router = FakeRouter(ReadResult(ok=False, reason="the PDF is encrypted"))
    with pytest.raises(ExtractionError, match="the PDF is encrypted"):
        await router_extractor(router)(b"x", "application/pdf", "a.pdf")


def drive_with_pdf():
    drive = FakeDrive()
    drive.files = {"1": file("1", "r.pdf", "application/pdf")}
    drive.content = {"1": "raw"}
    drive.pages = [["1"]]
    drive.permissions = {"1": []}
    return drive


def request(checkpoint=None):
    return SyncRequest(credentials={"access_token": "t"}, checkpoint=checkpoint)


async def test_connector_reports_an_unreadable_file_without_retrying_it():
    drive = drive_with_pdf()
    router = FakeRouter(ReadResult(ok=False, reason="the PDF is encrypted"))
    connector = GDriveConnector(extractor=router_extractor(router), transport=httpx.MockTransport(drive.handler))
    events = await collect(connector.sync(request()))
    failure = [e for e in events if e.type == "failure"][0].failure
    assert (failure.stage, failure.code, failure.retryable) == ("parse", "extraction_failed", False)
    assert events[-1].checkpoint.data["retry_ids"] == []


async def test_connector_retries_a_file_when_the_extractor_crashes():
    drive = drive_with_pdf()
    connector = GDriveConnector(extractor=router_extractor(FakeRouter(RuntimeError("worker died"))), transport=httpx.MockTransport(drive.handler))
    first = await collect(connector.sync(request()))
    failure = [e for e in first if e.type == "failure"][0].failure
    assert (failure.code, failure.retryable) == ("extractor_error", True)
    checkpoint = first[-1].checkpoint
    assert checkpoint.data["retry_ids"] == ["1"]

    drive.changes = [{"changes": [], "new_start": "start-2"}]
    healthy = router_extractor(FakeRouter(ReadResult(ok=True, markdown="recovered")))
    retry = GDriveConnector(extractor=healthy, transport=httpx.MockTransport(drive.handler))
    second = await collect(retry.sync(request(checkpoint)))
    assert [e.document.sections[0].text for e in second if e.type == "document"] == ["recovered"]
    assert second[-1].checkpoint.data["retry_ids"] == []


async def test_app_registers_the_drive_connector_and_the_read_endpoint(tmp_path):
    app = create_app(Settings(storage_dir=tmp_path))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        listing = (await client.get("/v1/connectors")).json()
        schema = (await client.get("/openapi.json")).json()
    assert listing == [{"kind": "gdrive", "capabilities": ["sync", "slim", "permissions", "identities", "preview", "filters"], "permission_model": "record"}]
    assert "/v1/documents/read" in schema["paths"]
