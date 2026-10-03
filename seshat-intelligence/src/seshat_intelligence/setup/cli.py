"""The `seshat-intelligence` command: check this machine, install what is missing, run the service.

  seshat-intelligence check [--json]      is this machine ready, and if not what is wrong and how to fix it
  seshat-intelligence install [--json]    the PyTorch build for the GPU, then the models of the profile, then a check
  seshat-intelligence serve               run the service

`install` is safe to run again: what is there is kept, and a download that stopped resumes. With --json the
only thing written to stdout is one JSON document, so a host can run it and read the result; progress goes
to stderr.

After a PyTorch build has been installed over a `uv sync` environment, run the service with `uv run --no-sync`
(or the environment's own python): a plain `uv run` would sync the environment back to the lock file.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from seshat_intelligence.providers.docling_setup import PROFILES, detect_hardware, recommend_profile
from seshat_intelligence.setup import torch_wheels
from seshat_intelligence.setup.downloads import DownloadError
from seshat_intelligence.setup.models import ModelSetup, download_models, plan_models, verify_models, write_manifest
from seshat_intelligence.setup.report import build_report

WHEEL_CACHE = Path.home() / ".cache" / "seshat" / "wheels"


def _log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def _fetch(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310 - fixed https index URLs
        return response.read().decode("utf-8", "replace")


def _model_setup(args: argparse.Namespace) -> ModelSetup:
    profile = args.profile
    if profile == "auto":
        profile = recommend_profile(detect_hardware())
    return ModelSetup(
        profile=profile,
        device=args.device,
        artifacts_path=args.artifacts_path,
        ocr=args.ocr,
        ocr_languages=tuple(args.ocr_languages),
    )


def _print_report(report: dict[str, Any]) -> None:
    hardware, torch, models = report["hardware"], report["torch"], report["models"]
    print(f"Python    {report['python']['version']}   {report['platform']}   uv {report['uv']['version'] or 'not found'}")
    gpu = f"   NVIDIA driver supports CUDA {hardware['nvidia_driver_cuda']}" if hardware["nvidia_driver_cuda"] else ""
    print(f"Hardware  {hardware['device'].upper()}  {hardware['name']}{gpu}")
    print(f"Torch     {torch['version'] or 'not installed'}  ({torch['build']} build, CUDA {'available' if torch['cuda_available'] else 'not available'})")
    print(f"Docling   {report['docling']['version'] or 'not installed'}")
    print(f"Profile   {report['profile']['selected']}  (recommended here: {report['profile']['recommended']})   models in {models['location']}")
    for model in models["models"]:
        print(f"  {'present' if model['present'] else 'MISSING':8} {model['size_mb']:>4} MB  {model['key']}")
    print()
    if not report["problems"]:
        print("Ready.")
    for problem in report["problems"]:
        print(f"{problem['severity'].upper():8} {problem['message']}\n         fix: {problem['fix']}")


def command_check(args: argparse.Namespace) -> int:
    report = build_report(_model_setup(args))
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        _print_report(report)
    return 0 if report["ok"] else 1


def _install_torch(args: argparse.Namespace, steps: list[dict[str, Any]]) -> bool:
    """The PyTorch build step. Returns True when a build was installed (the rest then runs in a fresh process)."""
    if args.no_gpu or args.device in ("cpu", "mps"):
        steps.append({"name": "torch", "status": "skipped", "detail": "GPU build not requested"})
        return False
    driver = torch_wheels.driver_cuda_version()
    if driver is None:
        steps.append({"name": "torch", "status": "skipped", "detail": "no NVIDIA driver found"})
        return False
    if torch_wheels.torch_build() == "cuda":
        steps.append({"name": "torch", "status": "ok", "detail": "a CUDA build is already installed"})
        return False
    installed = {name: v for name in torch_wheels.PACKAGES if (v := torch_wheels.installed_version(name)) is not None}
    try:
        chosen = torch_wheels.plan("cuda", _fetch, driver=driver, installed=installed)
    except OSError as error:
        steps.append({"name": "torch", "status": "failed", "detail": f"could not read the PyTorch index: {error}"})
        return False
    if chosen is None:
        steps.append({"name": "torch", "status": "skipped", "detail": "PyTorch publishes no CUDA build of the installed version for this driver"})
        return False
    _log(f"Installing PyTorch {chosen.wheels[0].version} for CUDA ({chosen.tag}); the download resumes if it stops ...")
    if args.dry_run:
        steps.append({"name": "torch", "status": "planned", "detail": ", ".join(wheel.filename for wheel in chosen.wheels)})
        return False
    last = {"name": "", "percent": -10}

    def progress(name: str, done: int, total: int | None) -> None:
        percent = int(done * 100 / total) if total else 0
        if name != last["name"] or percent >= last["percent"] + 10:
            last.update(name=name, percent=percent)
            _log(f"  {name}: {percent}%")

    try:
        torch_wheels.apply(chosen, WHEEL_CACHE, progress=progress)
    except (DownloadError, RuntimeError) as error:
        steps.append({"name": "torch", "status": "failed", "detail": str(error)})
        return False
    steps.append({"name": "torch", "status": "installed", "detail": f"{chosen.wheels[0].package} {chosen.wheels[0].version}+{chosen.tag}"})
    return True


def command_install(args: argparse.Namespace) -> int:
    steps: list[dict[str, Any]] = []
    if not args.skip_torch and _install_torch(args, steps):
        # torch changed under this process: do the rest in a fresh one so it sees the new build.
        import subprocess

        rest = [sys.executable, "-m", "seshat_intelligence.setup.cli", "install", "--skip-torch", *_forward(args)]
        done = subprocess.run(rest, capture_output=args.json, text=True, check=False)
        if args.json:
            inner = json.loads(done.stdout or "{}")
            inner["steps"] = steps + inner.get("steps", [])
            print(json.dumps(inner, indent=2))
        return done.returncode

    setup = _model_setup(args)
    models = plan_models(setup)
    if not args.skip_models and not models.ready:
        _log(f"Downloading {models.missing_mb} MB of models for the {setup.profile} profile ...")
        if args.dry_run:
            steps.append({"name": "models", "status": "planned", "detail": ", ".join(m.key for m in models.missing)})
        else:
            try:
                download_models(setup)
                steps.append({"name": "models", "status": "installed", "detail": ", ".join(m.key for m in models.missing)})
            except Exception as error:  # noqa: BLE001 - report it, do not crash a host reading JSON
                steps.append({"name": "models", "status": "failed", "detail": str(error)})
    elif models.ready:
        steps.append({"name": "models", "status": "ok", "detail": f"the {setup.profile} profile is complete"})

    if args.verify and not args.dry_run and all(step["status"] != "failed" for step in steps):
        ok, detail = verify_models(setup)
        steps.append({"name": "verify", "status": "ok" if ok else "failed", "detail": detail})
    if not args.dry_run and all(step["status"] != "failed" for step in steps):
        write_manifest(setup, detect_hardware().device)

    report = build_report(setup)
    failed = any(step["status"] == "failed" for step in steps)
    if args.json:
        print(json.dumps({"ok": report["ok"] and not failed, "steps": steps, "report": report}, indent=2))
    else:
        for step in steps:
            print(f"{step['status']:9} {step['name']:7} {step['detail']}")
        print()
        _print_report(report)
    return 0 if report["ok"] and not failed else 1


def _forward(args: argparse.Namespace) -> list[str]:
    forwarded = ["--profile", args.profile, "--device", args.device, "--ocr", args.ocr, "--ocr-languages", *args.ocr_languages]
    if args.artifacts_path:
        forwarded += ["--artifacts-path", str(args.artifacts_path)]
    for flag, value in (("--json", args.json), ("--verify", args.verify), ("--dry-run", args.dry_run), ("--skip-models", args.skip_models)):
        if value:
            forwarded.append(flag)
    return forwarded


def command_serve(_: argparse.Namespace) -> int:
    import uvicorn

    from seshat_intelligence.config import get_settings

    settings = get_settings()
    uvicorn.run("seshat_intelligence.api.app:create_app", factory=True, host=settings.host, port=settings.port)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="seshat-intelligence", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    def common(sub: argparse.ArgumentParser) -> None:
        sub.add_argument("--profile", choices=[*PROFILES, "auto"], default="auto", help="which models (auto: the one that suits this machine)")
        sub.add_argument("--device", choices=["auto", "cpu", "cuda", "mps"], default="auto")
        sub.add_argument("--artifacts-path", type=Path, default=None, help="keep the models in this directory (a server image, a portable install)")
        sub.add_argument("--ocr", choices=["auto", "rapidocr", "easyocr", "none"], default="auto")
        sub.add_argument("--ocr-languages", nargs="+", default=["fr", "en"])
        sub.add_argument("--json", action="store_true", help="write one JSON document to stdout instead of text")

    check = commands.add_parser("check", help="is this machine ready to read documents")
    common(check)
    check.set_defaults(run=command_check)

    install = commands.add_parser("install", help="install the GPU build of PyTorch and the models, then check")
    common(install)
    install.add_argument("--no-gpu", action="store_true", help="keep the PyTorch build that is installed")
    install.add_argument("--skip-models", action="store_true")
    install.add_argument("--verify", action="store_true", help="convert a tiny PDF offline once the models are there")
    install.add_argument("--dry-run", action="store_true", help="say what would be installed, install nothing")
    install.add_argument("--skip-torch", action="store_true", help=argparse.SUPPRESS)
    install.set_defaults(run=command_install)

    serve = commands.add_parser("serve", help="run the service")
    serve.set_defaults(run=command_serve)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.run(args)


if __name__ == "__main__":
    raise SystemExit(main())
