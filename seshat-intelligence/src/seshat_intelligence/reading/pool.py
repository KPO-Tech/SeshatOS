"""A small process pool with a deadline, for work that can hang or crash on hostile input."""

from __future__ import annotations

import asyncio
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from typing import Any, Callable

from seshat_intelligence.reading.models import ReadError

DEFAULT_TIMEOUT_SECONDS = 60.0


class LightPool:
    """PDFium can hang or abort on a malformed PDF, which cannot be caught in process. Work runs in
    a worker process under a deadline, and a worker that times out or crashes is discarded with its
    pool: the next call gets a fresh one."""

    def __init__(self, max_workers: int = 2, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> None:
        self._max_workers = max_workers
        self._timeout = timeout
        self._executor = ProcessPoolExecutor(max_workers=max_workers)

    def _replace(self) -> None:
        # The worker handles must be read before shutdown clears them. A worker stuck in a native
        # call ignores shutdown, so it is terminated outright.
        processes = list((getattr(self._executor, "_processes", None) or {}).values())
        self._executor.shutdown(wait=False, cancel_futures=True)
        for process in processes:
            try:
                process.terminate()
            except Exception:  # noqa: BLE001 - already gone
                pass
        self._executor = ProcessPoolExecutor(max_workers=self._max_workers)

    async def run(self, fn: Callable[..., Any], *args: Any, timeout: float | None = None) -> Any:
        loop = asyncio.get_running_loop()
        try:
            return await asyncio.wait_for(loop.run_in_executor(self._executor, fn, *args), timeout or self._timeout)
        except asyncio.TimeoutError as exc:
            self._replace()
            raise ReadError("reading took too long") from exc
        except BrokenProcessPool as exc:
            self._replace()
            raise ReadError("the reading worker crashed") from exc

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)


def sleep_then_return(seconds: float) -> str:
    """Used by tests to exercise the deadline."""
    import time

    time.sleep(seconds)
    return "late"
