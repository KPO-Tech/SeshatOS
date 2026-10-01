from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

DocumentProviderName = Literal["docling", "marker"]


class Settings(BaseSettings):
    """Runtime configuration, all overridable via SESHAT_INTELLIGENCE_* env vars.

    storage_dir mirrors docling-serve's own managed-venv convention (a
    directory under the Seshat runtime root) rather than inventing a new
    location - see seshat/internal/python/docling.go for the Go-side
    counterpart this service is meant to sit alongside.
    """

    model_config = SettingsConfigDict(env_prefix="SESHAT_INTELLIGENCE_")

    host: str = "127.0.0.1"
    port: int = 5100
    storage_dir: Path = Path.home() / ".config" / "seshat" / "intelligence" / "documents"
    # Which providers/*.py implementation handles document conversion -
    # docling.py by default, marker.py as the second option this settled on
    # to prove the DocumentProvider abstraction with two real
    # implementations. Per-request/per-document-type provider routing is
    # deliberately not built yet - one process-wide choice for now.
    document_provider: DocumentProviderName = "docling"
    # Hard ceilings on concurrent work (see documents/conversion_pool.py and
    # documents/chunking_pool.py) - each in-flight conversion or chunking
    # job holds a full model's worth of memory, so these bound worst-case
    # memory use under load rather than letting concurrency grow unbounded.
    # Separate settings because they're separate pools with separate models
    # loaded (chunking always loads Docling, conversion loads whichever
    # document_provider is configured).
    conversion_max_workers: int = 2
    chunking_max_workers: int = 2


def get_settings() -> Settings:
    return Settings()
