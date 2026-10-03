import hashlib

import httpx
import pytest

from seshat_intelligence.setup.downloads import DownloadError, download_resumable, sha256_of

PAYLOAD = bytes(range(256)) * 4000  # about 1 MB


def server(payload: bytes, *, drop_after: int | None = None, ignore_range: bool = False, requests: list | None = None):
    """A file server that can cut the first response short, as a dropped connection does."""
    state = {"cut": drop_after}

    def handler(request: httpx.Request) -> httpx.Response:
        start = 0
        header = request.headers.get("range")
        if requests is not None:
            requests.append(header)
        if header and not ignore_range:
            start = int(header.removeprefix("bytes=").split("-")[0])
            if start >= len(payload):
                return httpx.Response(416)
        body = payload[start:]
        headers = {"content-length": str(len(body))}
        if header and not ignore_range:
            headers["content-range"] = f"bytes {start}-{len(payload) - 1}/{len(payload)}"
        if state["cut"] is not None:
            cut, state["cut"] = state["cut"], None
            return httpx.Response(206 if header else 200, content=body[:cut], headers=headers)  # shorter than it promised
        return httpx.Response(206 if header and not ignore_range else 200, content=body, headers=headers)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_a_complete_download_is_checked_and_named(tmp_path):
    target = tmp_path / "wheel.whl"
    path = download_resumable("https://x/wheel.whl", target, sha256=hashlib.sha256(PAYLOAD).hexdigest(), client=server(PAYLOAD))
    assert path == target and target.read_bytes() == PAYLOAD
    assert not (tmp_path / "wheel.whl.part").exists()


def test_a_cut_connection_resumes_from_what_is_on_disk(tmp_path):
    requests: list = []
    target = tmp_path / "wheel.whl"
    download_resumable("https://x/wheel.whl", target, client=server(PAYLOAD, drop_after=300_000, requests=requests))
    assert target.read_bytes() == PAYLOAD
    assert requests[0] is None and requests[1] == "bytes=300000-"


def test_a_partial_file_from_an_earlier_run_is_continued(tmp_path):
    part = tmp_path / "wheel.whl.part"
    part.write_bytes(PAYLOAD[:1000])
    requests: list = []
    download_resumable("https://x/wheel.whl", tmp_path / "wheel.whl", client=server(PAYLOAD, requests=requests))
    assert (tmp_path / "wheel.whl").read_bytes() == PAYLOAD
    assert requests == ["bytes=1000-"]


def test_a_server_that_ignores_ranges_does_not_corrupt_the_file(tmp_path):
    (tmp_path / "wheel.whl.part").write_bytes(PAYLOAD[:1000])
    download_resumable("https://x/wheel.whl", tmp_path / "wheel.whl", client=server(PAYLOAD, ignore_range=True))
    assert (tmp_path / "wheel.whl").read_bytes() == PAYLOAD


def test_a_wrong_checksum_removes_the_file_and_fails(tmp_path):
    with pytest.raises(DownloadError, match="checksum"):
        download_resumable("https://x/wheel.whl", tmp_path / "wheel.whl", sha256="0" * 64, client=server(PAYLOAD))
    assert not (tmp_path / "wheel.whl").exists() and not (tmp_path / "wheel.whl.part").exists()


def test_a_file_that_is_already_there_and_correct_is_not_fetched(tmp_path):
    target = tmp_path / "wheel.whl"
    target.write_bytes(PAYLOAD)
    requests: list = []
    download_resumable("https://x/wheel.whl", target, sha256=sha256_of(target), client=server(PAYLOAD, requests=requests))
    assert requests == []


def test_a_server_that_keeps_failing_gives_up_with_a_clear_error(tmp_path):
    def always_down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route")

    client = httpx.Client(transport=httpx.MockTransport(always_down))
    with pytest.raises(DownloadError, match="after 3 attempts"):
        download_resumable("https://x/wheel.whl", tmp_path / "wheel.whl", attempts=3, client=client)
