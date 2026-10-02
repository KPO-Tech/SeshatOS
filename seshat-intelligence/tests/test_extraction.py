import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from seshat_intelligence.api.app import create_app
from seshat_intelligence.config import Settings
from seshat_intelligence.connectors.extraction import ExtractionError, pool_extractor
from seshat_intelligence.connectors.gdrive import GDriveConnector
from seshat_intelligence.connectors.models import SyncRequest
from seshat_intelligence.providers.base import ConvertedDocument
from fake_drive import FakeDrive, collect, file


class FakePool:
    def __init__(self, converted):
        self.converted = converted
        self.calls = []

    async def convert(self, filename, data):
        self.calls.append((filename, data))
        if isinstance(self.converted, Exception):
            raise self.converted
        return self.converted


@pytest.mark.parametrize("status", ["success", "partial_success"])
async def test_pool_extractor_returns_markdown_for_usable_statuses(status):
    pool = FakePool(ConvertedDocument(status=status, markdown="# Title"))
    assert await pool_extractor(pool)(b"bytes", "application/pdf", "a.pdf") == "# Title"
    assert pool.calls == [("a.pdf", b"bytes")]


async def test_pool_extractor_raises_with_the_conversion_errors():
    pool = FakePool(ConvertedDocument(status="failure", markdown="", errors=["encrypted pdf"]))
    with pytest.raises(ExtractionError, match="encrypted pdf"):
        await pool_extractor(pool)(b"x", "application/pdf", "a.pdf")


def drive_with_pdf():
    drive = FakeDrive()
    drive.files = {"1": file("1", "r.pdf", "application/pdf")}
    drive.content = {"1": "raw"}
    drive.pages = [["1"]]
    drive.permissions = {"1": []}
    return drive


def request(checkpoint=None):
    return SyncRequest(credentials={"access_token": "t"}, checkpoint=checkpoint)


async def test_connector_reports_a_failed_conversion_without_retrying_it():
    drive = drive_with_pdf()
    pool = FakePool(ConvertedDocument(status="failure", markdown="", errors=["encrypted pdf"]))
    connector = GDriveConnector(extractor=pool_extractor(pool), transport=httpx.MockTransport(drive.handler))
    events = await collect(connector.sync(request()))
    failure = [e for e in events if e.type == "failure"][0].failure
    assert (failure.stage, failure.code, failure.retryable) == ("parse", "extraction_failed", False)
    assert events[-1].checkpoint.data["retry_ids"] == []


async def test_connector_retries_a_file_when_the_extractor_crashes():
    drive = drive_with_pdf()
    crashing = FakePool(RuntimeError("worker died"))
    connector = GDriveConnector(extractor=pool_extractor(crashing), transport=httpx.MockTransport(drive.handler))
    first = await collect(connector.sync(request()))
    failure = [e for e in first if e.type == "failure"][0].failure
    assert (failure.code, failure.retryable) == ("extractor_error", True)
    checkpoint = first[-1].checkpoint
    assert checkpoint.data["retry_ids"] == ["1"]

    drive.changes = [{"changes": [], "new_start": "start-2"}]
    healthy = FakePool(ConvertedDocument(status="success", markdown="recovered"))
    retry = GDriveConnector(extractor=pool_extractor(healthy), transport=httpx.MockTransport(drive.handler))
    second = await collect(retry.sync(request(checkpoint)))
    assert [e.document.sections[0].text for e in second if e.type == "document"] == ["recovered"]
    assert second[-1].checkpoint.data["retry_ids"] == []


async def test_app_registers_the_drive_connector(tmp_path):
    app = create_app(Settings(storage_dir=tmp_path))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        listing = (await client.get("/v1/connectors")).json()
    assert listing == [{"kind": "gdrive", "capabilities": ["sync", "slim", "permissions"]}]
