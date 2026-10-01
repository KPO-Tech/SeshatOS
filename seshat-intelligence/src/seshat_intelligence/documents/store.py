from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


@dataclass(slots=True)
class StoredDocument:
    document_id: str
    filename: str
    status: str
    created_at: str
    markdown: str
    errors: list[str] = field(default_factory=list)


class DocumentStore:
    """Keeps the full provider result on disk, not just the final markdown -
    see the architecture discussion this service came out of: re-chunking or
    re-embedding later shouldn't require re-converting the original.

    Layout per document, under storage_dir/<document_id>/:
      original.<ext>   the uploaded bytes, untouched
      raw.json           the provider's own full structured result
                          (a DoclingDocument's export_to_dict(), Marker's
                          metadata, or whatever the next provider returns -
                          see providers/base.py's ConvertedDocument)
      content.md         the exported markdown
      meta.json           status/filename/timestamp/errors

    A local filesystem, one directory per document - deliberately not a
    database or object store yet. This service runs alongside
    seshat-backend on the same machine (same pattern as docling-serve's own
    managed venv), so there's nothing this needs to be network-reachable
    for right now.
    """

    def __init__(self, root: Path) -> None:
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)

    def save(
        self,
        *,
        filename: str,
        original_bytes: bytes,
        status: str,
        raw: dict[str, Any] | None,
        markdown: str,
        errors: list[str],
    ) -> StoredDocument:
        document_id = f"doc_{uuid4().hex[:12]}"
        doc_dir = self._root / document_id
        doc_dir.mkdir(parents=True, exist_ok=True)

        suffix = Path(filename).suffix or ".bin"
        (doc_dir / f"original{suffix}").write_bytes(original_bytes)
        (doc_dir / "content.md").write_text(markdown, encoding="utf-8")
        if raw is not None:
            (doc_dir / "raw.json").write_text(json.dumps(raw, indent=2), encoding="utf-8")

        stored = StoredDocument(
            document_id=document_id,
            filename=filename,
            status=status,
            created_at=datetime.now(timezone.utc).isoformat(),
            markdown=markdown,
            errors=errors,
        )
        (doc_dir / "meta.json").write_text(
            json.dumps(
                {
                    "document_id": stored.document_id,
                    "filename": stored.filename,
                    "status": stored.status,
                    "created_at": stored.created_at,
                    "errors": stored.errors,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return stored

    def get(self, document_id: str) -> StoredDocument | None:
        doc_dir = self._root / document_id
        meta_path = doc_dir / "meta.json"
        if not meta_path.exists():
            return None
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        markdown_path = doc_dir / "content.md"
        markdown = markdown_path.read_text(encoding="utf-8") if markdown_path.exists() else ""
        return StoredDocument(
            document_id=meta["document_id"],
            filename=meta["filename"],
            status=meta["status"],
            created_at=meta["created_at"],
            markdown=markdown,
            errors=meta.get("errors", []),
        )

    def delete(self, document_id: str) -> bool:
        doc_dir = self._root / document_id
        if not doc_dir.exists():
            return False
        for child in doc_dir.iterdir():
            child.unlink()
        doc_dir.rmdir()
        return True
