"""Which Drive files are synced, and how Google-native documents are turned into text."""

from __future__ import annotations

import os

FOLDER_MIME = "application/vnd.google-apps.folder"

# Google-native documents are exported to plain text. Sheets are deliberately absent: tabular data
# is answered precisely by a database or BI tool, and fuzzy semantic search is the wrong tool for it.
EXPORT_MIME_TYPES = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.presentation": "text/plain",
}

# A business-document allowlist, not a code denylist. Checked by extension because Drive reports
# arbitrary code and text files as generic text/plain, so the MIME type alone cannot tell a script
# from a real document.
ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".txt", ".md"}

# Bounds a single file's exported or downloaded content.
MAX_FILE_BYTES = 20 * 1024 * 1024

TEXT_EXTENSIONS = {".txt", ".md"}


def is_allowed_file(name: str, mime_type: str) -> bool:
    if mime_type == FOLDER_MIME:
        return False
    if mime_type in EXPORT_MIME_TYPES:
        return True
    return os.path.splitext(name)[1].lower() in ALLOWED_EXTENSIONS


def is_text_file(name: str) -> bool:
    return os.path.splitext(name)[1].lower() in TEXT_EXTENSIONS
