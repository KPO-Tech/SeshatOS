"""The Docling models a profile needs: what is there, what is missing, fetching it, and checking offline that
it works. the `seshat-intelligence` command uses this, so what is prepared is exactly what the service uses (see providers/docling_setup.py).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Any

from seshat_intelligence.config import Settings
from seshat_intelligence.providers.docling_setup import MODELS, PROFILES, profile_size_mb

MANIFEST_NAME = "seshat-models.json"
DEFAULT_FOLDER = Path.home() / ".config" / "seshat" / "intelligence"


@dataclass(frozen=True)
class ModelSetup:
    profile: str
    device: str = "auto"
    artifacts_path: Path | None = None
    ocr: str = "auto"
    ocr_languages: tuple[str, ...] = ("fr", "en")
    offline: bool = False

    def settings(self) -> Settings:
        return Settings(
            docling_profile=self.profile,
            docling_device=self.device,
            docling_ocr=self.ocr,
            docling_ocr_languages=list(self.ocr_languages),
            docling_artifacts_path=self.artifacts_path,
            docling_offline=self.offline,
        )


@dataclass
class ModelStatus:
    key: str
    repo_id: str
    size_mb: int
    purpose: str
    present: bool


@dataclass
class ModelsPlan:
    profile: str
    location: str
    models: list[ModelStatus] = field(default_factory=list)

    @property
    def missing(self) -> list[ModelStatus]:
        return [model for model in self.models if not model.present]

    @property
    def missing_mb(self) -> int:
        return sum(model.size_mb for model in self.missing)

    @property
    def ready(self) -> bool:
        return not self.missing

    def as_dict(self) -> dict[str, Any]:
        return {
            "profile": self.profile,
            "location": self.location,
            "profile_size_mb": profile_size_mb(self.profile),
            "missing_mb": self.missing_mb,
            "ready": self.ready,
            "models": [vars(model) for model in self.models],
        }


def is_present(key: str, artifacts: Path | None) -> bool:
    """Whether a model is already where Docling will look for it."""
    model = MODELS[key]
    if artifacts is not None:
        return (Path(artifacts) / model.folder).is_dir()
    try:
        from huggingface_hub import scan_cache_dir

        return any(repo.repo_id == model.repo_id for repo in scan_cache_dir().repos)
    except Exception:  # noqa: BLE001 - no cache yet
        return False


def plan_models(setup: ModelSetup) -> ModelsPlan:
    plan = ModelsPlan(setup.profile, str(setup.artifacts_path) if setup.artifacts_path else "Docling's cache (Hugging Face)")
    for key in PROFILES[setup.profile].models:
        model = MODELS[key]
        plan.models.append(ModelStatus(key, model.repo_id, model.size_mb, model.purpose, is_present(key, setup.artifacts_path)))
    return plan


def download_models(setup: ModelSetup) -> None:
    if setup.artifacts_path is not None:
        from docling.utils.model_downloader import download_models as fetch

        spec = PROFILES[setup.profile]
        flags = {model.download_flag: (key in spec.models) for key, model in MODELS.items()}
        Path(setup.artifacts_path).mkdir(parents=True, exist_ok=True)
        fetch(
            output_dir=Path(setup.artifacts_path),
            progress=True,
            with_rapidocr=setup.ocr in ("auto", "rapidocr"),
            with_easyocr=setup.ocr == "easyocr",
            easyocr_languages=list(setup.ocr_languages) if setup.ocr == "easyocr" else None,
            **flags,
        )
        return
    # Docling fetches what the options need, where it will look for it at run time: building the pipeline is
    # what triggers it, so the result is by construction what the service uses.
    from docling.datamodel.base_models import InputFormat

    from seshat_intelligence.providers.docling_setup import build_converter

    build_converter(setup.settings()).initialize_pipeline(InputFormat.PDF)


def tiny_pdf() -> bytes:
    """A one-page text PDF built by hand, enough to run a conversion end to end."""
    lines = ["Model check", "This page checks that the document models load and convert text."]
    stream = "".join(f"BT /F1 {18 if i == 0 else 11} Tf 60 {740 - 30 * i} Td ({t}) Tj ET\n" for i, t in enumerate(lines))
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}endstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n{body}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def verify_models(setup: ModelSetup) -> tuple[bool, str]:
    """Convert a tiny PDF in a fresh process that may not reach the network. Returns (ok, detail)."""
    command = [sys.executable, "-m", "seshat_intelligence.setup.models", setup.profile, setup.device, setup.ocr, str(setup.artifacts_path or "")]
    started = time.time()
    done = subprocess.run(command, env={**os.environ, "HF_HUB_OFFLINE": "1"}, capture_output=True, text=True, encoding="utf-8", check=False)
    if done.returncode == 0:
        return True, f"converted offline in {time.time() - started:.0f}s: {done.stdout.strip()}"
    return False, (done.stderr or done.stdout)[-1500:]


def _verify_here(setup: ModelSetup) -> int:
    from docling.datamodel.base_models import ConversionStatus
    from docling_core.types.io import DocumentStream

    from seshat_intelligence.providers.docling_setup import build_converter

    converter = build_converter(setup.settings())
    result = converter.convert(DocumentStream(name="check.pdf", stream=BytesIO(tiny_pdf())), raises_on_error=False)
    ok = result.status in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS)
    markdown = result.document.export_to_markdown() if ok else ""
    if "Model check" not in markdown:
        print(f"status {result.status}, no expected text in: {markdown[:200]!r}", file=sys.stderr)
        return 1
    print(f"{result.status.value}, {len(markdown)} characters")
    return 0


def write_manifest(setup: ModelSetup, device: str) -> Path:
    folder = Path(setup.artifacts_path) if setup.artifacts_path else DEFAULT_FOLDER
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / MANIFEST_NAME
    path.write_text(
        json.dumps(
            {
                "profile": setup.profile,
                "device": device,
                "models": {key: MODELS[key].repo_id for key in PROFILES[setup.profile].models},
                "artifacts_path": str(setup.artifacts_path) if setup.artifacts_path else None,
                "prepared_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return path


if __name__ == "__main__":  # the offline check runs in a fresh process: python -m ...models PROFILE DEVICE OCR ARTIFACTS
    profile, device, ocr, artifacts = sys.argv[1:5]
    raise SystemExit(_verify_here(ModelSetup(profile, device, Path(artifacts) if artifacts else None, ocr, offline=True)))
