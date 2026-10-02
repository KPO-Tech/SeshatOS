"""Drive permissions to the contract's prefixed access entries."""

from __future__ import annotations

from typing import Any


def permissions_to_access(permissions: list[dict[str, Any]]) -> list[str]:
    """Map Drive permission objects to access entries.

    Malformed entries (no email or domain) are skipped rather than turned into a bare prefix, and
    unknown types are ignored rather than guessed at. A link-only share (`anyone` with
    `allowFileDiscovery` false) is not public: it is visible to whoever holds the link, not to the
    whole organisation, so it adds no entry. Only a discoverable `anyone` permission maps to public.
    """
    access: list[str] = []
    for permission in permissions:
        kind = permission.get("type")
        if kind in ("user", "group"):
            email = (permission.get("emailAddress") or "").strip()
            if email:
                access.append(f"{kind}:{email}")
        elif kind == "domain":
            domain = (permission.get("domain") or "").strip()
            if domain:
                access.append(f"domain:{domain}")
        elif kind == "anyone":
            if permission.get("allowFileDiscovery") is True:
                access.append("public")
    # Stable, de-duplicated order so the same ACL always compares equal.
    return list(dict.fromkeys(access))
