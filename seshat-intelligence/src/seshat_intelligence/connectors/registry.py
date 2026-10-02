from __future__ import annotations

from seshat_intelligence.connectors.base import Connector


class ConnectorRegistry:
    def __init__(self) -> None:
        self._connectors: dict[str, Connector] = {}

    def register(self, connector: Connector) -> None:
        if connector.kind in self._connectors:
            raise ValueError(f"connector {connector.kind!r} is already registered")
        self._connectors[connector.kind] = connector

    def get(self, kind: str) -> Connector | None:
        return self._connectors.get(kind)

    def kinds(self) -> list[str]:
        return sorted(self._connectors)
