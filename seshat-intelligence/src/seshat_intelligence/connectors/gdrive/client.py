"""A small Drive v3 client over httpx: OAuth refresh, retry on transient errors, rate-limit detection."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

DEFAULT_API_BASE = "https://www.googleapis.com"
DEFAULT_TOKEN_URL = "https://oauth2.googleapis.com/token"
# Drive's quota errors often carry no Retry-After header, so back off conservatively.
DEFAULT_RATE_LIMIT_BACKOFF = 30.0
_TRANSIENT = {500, 502, 503, 504}
_QUOTA_REASONS = {"rateLimitExceeded", "userRateLimitExceeded"}


class RateLimited(Exception):
    def __init__(self, retry_after: float, message: str = "rate limited") -> None:
        super().__init__(message)
        self.retry_after = retry_after


class DriveError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"drive api {status}: {message}")
        self.status = status


class DriveClient:
    def __init__(
        self,
        credentials: dict[str, str],
        config: dict[str, Any],
        transport: httpx.AsyncBaseTransport | None = None,
        sleep=asyncio.sleep,
    ) -> None:
        self._credentials = credentials
        self._access_token = credentials.get("access_token", "")
        self._api_base = str(config.get("api_base", DEFAULT_API_BASE)).rstrip("/")
        self._token_url = str(config.get("token_url", DEFAULT_TOKEN_URL))
        self._http = httpx.AsyncClient(transport=transport, timeout=60.0)
        self._sleep = sleep
        self._refreshed_at = 0.0

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _refresh(self) -> None:
        refresh_token = self._credentials.get("refresh_token")
        if not refresh_token:
            raise DriveError(401, "access token rejected and no refresh token is available")
        response = await self._http.post(
            self._token_url,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": self._credentials.get("client_id", ""),
                "client_secret": self._credentials.get("client_secret", ""),
            },
        )
        if response.status_code != 200:
            raise DriveError(response.status_code, "token refresh failed")
        self._access_token = response.json()["access_token"]
        self._refreshed_at = time.monotonic()

    @staticmethod
    def _rate_limit_delay(response: httpx.Response) -> float | None:
        if response.status_code == 429:
            return _retry_after(response)
        if response.status_code == 403:
            try:
                errors = response.json().get("error", {}).get("errors", [])
            except ValueError:
                return None
            if any(item.get("reason") in _QUOTA_REASONS for item in errors):
                return _retry_after(response)
        return None

    async def request(self, method: str, path: str, *, params: dict[str, Any] | None = None, stream_limit: int | None = None) -> httpx.Response:
        url = f"{self._api_base}{path}"
        refreshed = False
        for attempt in range(3):
            headers = {"Authorization": f"Bearer {self._access_token}"}
            response = await self._http.request(method, url, params=params, headers=headers)
            if response.status_code == 401 and not refreshed:
                await self._refresh()
                refreshed = True
                continue
            delay = self._rate_limit_delay(response)
            if delay is not None:
                raise RateLimited(delay)
            if response.status_code in _TRANSIENT and attempt < 2:
                await self._sleep(2**attempt)
                continue
            if response.status_code >= 400:
                raise DriveError(response.status_code, response.text[:200])
            return response
        raise DriveError(503, "retries exhausted")

    async def get_json(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return (await self.request("GET", path, params=params)).json()


def _retry_after(response: httpx.Response) -> float:
    raw = response.headers.get("Retry-After")
    try:
        return float(raw) if raw is not None else DEFAULT_RATE_LIMIT_BACKOFF
    except ValueError:
        return DEFAULT_RATE_LIMIT_BACKOFF
