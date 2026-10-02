"""Prepare the models Docling needs, so the service never downloads one in the middle of a request.

  uv run python scripts/prepare_models.py                      show the plan: hardware, profile, what is there, what is missing
  uv run python scripts/prepare_models.py --download           fetch what is missing
  uv run python scripts/prepare_models.py --download --verify  fetch, then check offline that everything loads and converts

Nothing is downloaded unless --download is given. The default plan is only a listing.

Profiles (see src/seshat_intelligence/providers/docling_setup.py):
  minimal   layout and tables, Docling's own default
  standard  adds the accurate table mode and the picture classifier
  full      adds formulas as LaTeX and code with its line breaks (slow without a GPU)
  auto      the one that suits this machine

Where models go:
  default            Docling's own cache (the Hugging Face cache). Shared, and what the service uses when
                     SESHAT_INTELLIGENCE_DOCLING_ARTIFACTS_PATH is not set.
  --artifacts-path   a directory of your choice, for a server image or a portable install. The service
                     then needs SESHAT_INTELLIGENCE_DOCLING_ARTIFACTS_PATH set to the same directory.

Local or server: use --profile auto on a laptop; on a server pick the profile you want and pass
--device cuda if it has a GPU, and --offline to make the service refuse to download at run time.
OCR (RapidOCR) ships inside the Python package and needs no download. --ocr easyocr adds EasyOCR's
models for the languages given with --ocr-languages (their size is not measured here).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from seshat_intelligence.config import Settings  # noqa: E402
from seshat_intelligence.providers.docling_setup import (  # noqa: E402
    MODELS,
    PROFILES,
    detect_hardware,
    profile_size_mb,
    recommend_profile,
)

MANIFEST_NAME = "seshat-models.json"


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


def is_present(key: str, artifacts: Path | None) -> bool:
    """Whether a model is already where Docling will look for it."""
    model = MODELS[key]
    if artifacts is not None:
        return (artifacts / model.folder).is_dir()
    try:
        from huggingface_hub import scan_cache_dir

        return any(repo.repo_id == model.repo_id for repo in scan_cache_dir().repos)
    except Exception:  # noqa: BLE001 - no cache yet
        return False


def settings_for(args: argparse.Namespace, profile: str) -> Settings:
    return Settings(
        docling_profile=profile,
        docling_device=args.device,
        docling_ocr=args.ocr,
        docling_ocr_languages=args.ocr_languages,
        docling_artifacts_path=args.artifacts_path,
        docling_offline=args.offline,
    )


def print_plan(args: argparse.Namespace, profile: str, hardware, recommended: str) -> list[str]:
    where = args.artifacts_path or "Docling's cache (Hugging Face)"
    print(f"Hardware : {hardware.device.upper()}  {hardware.name}")
    if hardware.vram_gb:
        print(f"           {hardware.vram_gb} GB of video memory")
    print(f"           {hardware.cpu_count} CPU threads, {hardware.ram_gb or '?'} GB of memory")
    print(f"Profile  : {profile} ({PROFILES[profile].description})   recommended here: {recommended}")
    print(f"Models in: {where}")
    print()
    missing = []
    total = 0
    for key in PROFILES[profile].models:
        model = MODELS[key]
        present = is_present(key, args.artifacts_path)
        total += 0 if present else model.size_mb
        if not present:
            missing.append(key)
        state = "present" if present else "MISSING"
        print(f"  {state:8} {model.size_mb:>4} MB  {model.key:<19} {model.purpose}")
    print(f"  {'':8} {'OCR':>7}  {'rapidocr':<19} ships with the Python package, nothing to download")
    if args.ocr == "easyocr":
        print(f"  {'':8} {'?':>7}  {'easyocr':<19} models for {', '.join(args.ocr_languages)}, fetched with --download")
    print()
    print(f"To download: {total} MB (the profile is {profile_size_mb(profile)} MB in all)")
    return missing


def download(args: argparse.Namespace, profile: str) -> None:
    settings = settings_for(args, profile)
    if args.artifacts_path is not None:
        from docling.utils.model_downloader import download_models

        spec = PROFILES[profile]
        flags = {model.download_flag: (key in spec.models) for key, model in MODELS.items()}
        print(f"Downloading into {args.artifacts_path} ...", flush=True)
        args.artifacts_path.mkdir(parents=True, exist_ok=True)
        download_models(
            output_dir=args.artifacts_path,
            progress=True,
            with_rapidocr=args.ocr in ("auto", "rapidocr"),
            with_easyocr=args.ocr == "easyocr",
            easyocr_languages=list(args.ocr_languages) if args.ocr == "easyocr" else None,
            **flags,
        )
    else:
        # Docling fetches what the options need, where it will look for it at run time: building the
        # pipeline is what triggers it, so the result is by construction what the service uses.
        from docling.datamodel.base_models import InputFormat

        from seshat_intelligence.providers.docling_setup import build_converter

        print("Downloading into Docling's cache ...", flush=True)
        build_converter(settings).initialize_pipeline(InputFormat.PDF)


def verify(args: argparse.Namespace, profile: str) -> bool:
    """Convert a tiny PDF in a fresh process that is not allowed to reach the network."""
    command = [sys.executable, str(Path(__file__).resolve()), "--verify-only", "--profile", profile, "--device", args.device, "--ocr", args.ocr]
    if args.artifacts_path is not None:
        command += ["--artifacts-path", str(args.artifacts_path)]
    env = {**os.environ, "HF_HUB_OFFLINE": "1"}
    started = time.time()
    done = subprocess.run(command, env=env, capture_output=True, text=True, encoding="utf-8", check=False)
    if done.returncode == 0:
        print(f"Verified offline in {time.time() - started:.0f}s: {done.stdout.strip()}")
        return True
    print("Verification FAILED while offline. A model is probably missing; run again with --download.")
    print((done.stderr or done.stdout)[-1500:])
    return False


def verify_only(args: argparse.Namespace, profile: str) -> int:
    from seshat_intelligence.providers.docling_setup import build_converter

    from docling.datamodel.base_models import ConversionStatus
    from docling_core.types.io import DocumentStream
    from io import BytesIO

    converter = build_converter(settings_for(args, profile))
    result = converter.convert(DocumentStream(name="check.pdf", stream=BytesIO(tiny_pdf())), raises_on_error=False)
    markdown = result.document.export_to_markdown() if result.status in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS) else ""
    if "Model check" not in markdown:
        print(f"status {result.status}, no expected text in: {markdown[:200]!r}", file=sys.stderr)
        return 1
    print(f"converted ({result.status.value}), {len(markdown)} characters")
    return 0


def write_manifest(args: argparse.Namespace, profile: str, hardware) -> Path:
    folder = args.artifacts_path or Path.home() / ".config" / "seshat" / "intelligence"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / MANIFEST_NAME
    path.write_text(
        json.dumps(
            {
                "profile": profile,
                "device": hardware.device,
                "models": {key: MODELS[key].repo_id for key in PROFILES[profile].models},
                "artifacts_path": str(args.artifacts_path) if args.artifacts_path else None,
                "prepared_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return path


def print_environment(args: argparse.Namespace, profile: str) -> None:
    print("\nTo use this setup, set for the service:")
    print(f"  SESHAT_INTELLIGENCE_DOCLING_PROFILE={profile}")
    print(f"  SESHAT_INTELLIGENCE_DOCLING_DEVICE={args.device}")
    if args.artifacts_path is not None:
        print(f"  SESHAT_INTELLIGENCE_DOCLING_ARTIFACTS_PATH={args.artifacts_path}")
    if args.ocr != "auto":
        print(f"  SESHAT_INTELLIGENCE_DOCLING_OCR={args.ocr}")
    print("  SESHAT_INTELLIGENCE_DOCLING_OFFLINE=true      (optional: never download at run time)")
    print("For docling-serve instead of this service:")
    if args.artifacts_path is not None:
        print(f"  DOCLING_SERVE_ARTIFACTS_PATH={args.artifacts_path}")
    print(f"  DOCLING_DEVICE={args.device}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--profile", choices=[*PROFILES, "auto"], default="auto")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda", "mps"], default="auto")
    parser.add_argument("--artifacts-path", type=Path, default=None)
    parser.add_argument("--ocr", choices=["auto", "rapidocr", "easyocr", "none"], default="auto")
    parser.add_argument("--ocr-languages", nargs="+", default=["fr", "en"])
    parser.add_argument("--offline", action="store_true", help="build the converter without any network access")
    parser.add_argument("--download", action="store_true", help="download what is missing (the default only lists it)")
    parser.add_argument("--verify", action="store_true", help="after that, convert a tiny PDF offline")
    parser.add_argument("--verify-only", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    hardware = detect_hardware()
    recommended = recommend_profile(hardware)
    profile = recommended if args.profile == "auto" else args.profile

    if args.verify_only:
        return verify_only(args, profile)

    missing = print_plan(args, profile, hardware, recommended)
    if profile == "full" and hardware.device == "cpu":
        print("Note: the full profile runs a 315M-parameter model per formula; on a CPU it is slow.")
    if not args.download and not args.verify:
        print("\nNothing was downloaded. Add --download to fetch what is missing, --verify to check it.")
        return 0
    if args.download and missing:
        download(args, profile)
    elif args.download:
        print("Nothing to download.")
    ok = verify(args, profile) if args.verify else True
    if ok and args.download:
        print(f"Wrote {write_manifest(args, profile, hardware)}")
        print_environment(args, profile)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
