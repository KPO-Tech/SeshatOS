"""The readers under comparison, each behind the same one-call interface.

A reader that fails on a document returns an Output with `error` set instead of raising, so one bad
file does not end a run and the failure shows up in the report.
"""

from __future__ import annotations

import json
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import httpx


@dataclass(slots=True)
class Output:
    markdown: str = ""
    pages: dict[int, str] | None = None  # None: this reader does not say which text is on which page
    seconds: float = 0.0
    engines: list[str] = field(default_factory=list)
    error: str | None = None


class Reader(Protocol):
    name: str

    def read(self, path: Path) -> Output: ...


class ServiceReader:
    """seshat-intelligence's /v1/documents/read in one of its modes (custom, docling, marker).
    The service returns one markdown, so there is no per-page text."""

    def __init__(self, url: str, mode: str, timeout: float = 1800) -> None:
        self.name = f"service-{mode}"
        self._url, self._mode, self._timeout = url.rstrip("/"), mode, timeout

    def read(self, path: Path) -> Output:
        started = time.perf_counter()
        try:
            with path.open("rb") as handle:
                response = httpx.post(
                    f"{self._url}/v1/documents/read",
                    files={"file": (path.name, handle)},
                    data={"mode": self._mode},
                    timeout=self._timeout,
                )
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            return Output(seconds=time.perf_counter() - started, error=str(exc))
        seconds = time.perf_counter() - started
        if not body.get("ok"):
            return Output(seconds=seconds, error=body.get("reason") or "not readable")
        return Output(markdown=body.get("markdown", ""), seconds=seconds, engines=body.get("engines_used", []))


class DoclingChunksReader:
    """docling-serve's hybrid chunk endpoint: what Knowledge indexes today. Chunks carry the page
    and heading path Docling read from its structured document, which the plain markdown export drops.
    The markdown is rebuilt from the chunks, with a heading line wherever the heading path changes."""

    name = "docling-chunks"

    def __init__(self, url: str, timeout: float = 1800) -> None:
        self._url, self._timeout = url.rstrip("/"), timeout

    def read(self, path: Path) -> Output:
        started = time.perf_counter()
        try:
            with path.open("rb") as handle:
                response = httpx.post(f"{self._url}/v1/chunk/hybrid/file", files={"files": (path.name, handle)}, timeout=self._timeout)
            response.raise_for_status()
            chunks = response.json().get("chunks", [])
        except (httpx.HTTPError, ValueError) as exc:
            return Output(seconds=time.perf_counter() - started, error=str(exc))
        return _from_chunks(chunks, time.perf_counter() - started)


def _from_chunks(chunks: list[dict], seconds: float) -> Output:
    parts: list[str] = []
    pages: dict[int, str] = {}
    last_heading: str | None = None
    for chunk in chunks:
        text = (chunk.get("raw_text") or chunk.get("text") or "").strip()
        if not text:
            continue
        headings = chunk.get("headings") or []
        heading = headings[-1] if headings else None
        if heading and heading != last_heading:
            parts.append(f"{'#' * min(len(headings), 6)} {heading}")
            last_heading = heading
        parts.append(text)
        for page in chunk.get("page_numbers") or []:
            pages[page] = f"{pages[page]}\n{text}" if page in pages else text
    return Output(markdown="\n\n".join(parts), pages=pages or None, seconds=seconds, engines=["docling"])


class GoReader:
    """The Go reader, through the readdoc tool in benchmarks/readdoc (native only, no engine)."""

    name = "go"

    def __init__(self, binary: str, timeout: float = 600) -> None:
        self._binary, self._timeout = binary, timeout

    def read(self, path: Path) -> Output:
        started = time.perf_counter()
        try:
            completed = subprocess.run([self._binary, str(path)], capture_output=True, text=True, encoding="utf-8", timeout=self._timeout, check=False)
            body = json.loads(completed.stdout)
        except (OSError, subprocess.SubprocessError, ValueError) as exc:
            return Output(seconds=time.perf_counter() - started, error=str(exc))
        seconds = time.perf_counter() - started
        if body.get("error"):
            return Output(seconds=seconds, error=body["error"])
        pages = {p["page"]: p["text"] for p in body["pages"]} if body.get("pages") else None
        return Output(markdown=body.get("markdown", ""), pages=pages, seconds=seconds, engines=[body.get("source", "native")])


def build(names: list[str], service_url: str, docling_url: str, go_binary: str) -> list[Reader]:
    readers: list[Reader] = []
    for name in names:
        if name.startswith("service-"):
            readers.append(ServiceReader(service_url, name.removeprefix("service-")))
        elif name == "docling-chunks":
            readers.append(DoclingChunksReader(docling_url))
        elif name == "go":
            readers.append(GoReader(go_binary))
        else:
            raise ValueError(f"unknown reader {name!r} (use service-custom, service-docling, service-marker, docling-chunks, go)")
    return readers
