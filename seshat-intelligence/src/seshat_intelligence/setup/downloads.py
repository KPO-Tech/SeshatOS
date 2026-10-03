"""Download a large file in a way that survives a dropped connection: the part already on disk is kept and the
next attempt asks the server for the rest. A PyTorch wheel with CUDA is over 2 GB, and starting over each time
a connection drops is how an install never ends.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from pathlib import Path

import httpx

CHUNK = 1 << 20
PART_SUFFIX = ".part"


class DownloadError(RuntimeError):
    pass


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


def download_resumable(
    url: str,
    destination: Path,
    *,
    sha256: str | None = None,
    attempts: int = 8,
    progress: Callable[[int, int | None], None] | None = None,
    client: httpx.Client | None = None,
) -> Path:
    """Fetch `url` to `destination`, resuming a previous partial download and retrying a dropped connection.

    The file only gets its final name once it is complete and, when `sha256` is given, correct. A file that
    is already there and correct is not fetched again.
    """
    destination = Path(destination)
    if destination.exists() and (sha256 is None or sha256_of(destination) == sha256):
        return destination
    destination.parent.mkdir(parents=True, exist_ok=True)
    part = destination.with_name(destination.name + PART_SUFFIX)

    owns_client = client is None
    client = client or httpx.Client(follow_redirects=True, timeout=httpx.Timeout(30.0, read=60.0))
    try:
        last_error: Exception | None = None
        for _ in range(attempts):
            try:
                if _fetch_into(client, url, part, progress):
                    break
            except (httpx.TransportError, httpx.HTTPStatusError) as error:
                last_error = error
        else:
            raise DownloadError(f"could not finish downloading {url} after {attempts} attempts: {last_error}")
    finally:
        if owns_client:
            client.close()

    if sha256 is not None and sha256_of(part) != sha256:
        part.unlink(missing_ok=True)
        raise DownloadError(f"{destination.name} does not match its published checksum; it was removed, run again")
    part.replace(destination)
    return destination


def _fetch_into(client: httpx.Client, url: str, part: Path, progress: Callable[[int, int | None], None] | None) -> bool:
    """One attempt. True when the file is complete, False when the connection ended early."""
    have = part.stat().st_size if part.exists() else 0
    headers = {"Range": f"bytes={have}-"} if have else {}
    with client.stream("GET", url, headers=headers) as response:
        if response.status_code == 416:  # asked for bytes past the end: what is on disk is everything
            return True
        response.raise_for_status()
        resumed = response.status_code == 206
        if have and not resumed:  # the server ignored the range: start over rather than append to a whole file
            have = 0
        total = _total_size(response, have)
        mode = "ab" if have else "wb"
        written = have
        with part.open(mode) as handle:
            for block in response.iter_bytes(CHUNK):
                handle.write(block)
                written += len(block)
                if progress is not None:
                    progress(written, total)
    return total is None or written >= total


def _total_size(response: httpx.Response, have: int) -> int | None:
    content_range = response.headers.get("content-range")
    if content_range and "/" in content_range:
        tail = content_range.rsplit("/", 1)[1]
        if tail.isdigit():
            return int(tail)
    length = response.headers.get("content-length")
    if length and length.isdigit():
        return int(length) + (have if response.status_code == 206 else 0)
    return None
