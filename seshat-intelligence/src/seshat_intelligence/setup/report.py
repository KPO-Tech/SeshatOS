"""What `seshat-intelligence check` reports: whether this machine is ready to read documents, and if not, what
is wrong and the command that fixes it. Plain data, so a host (the backend, an installer, a CI step) can read
it as JSON instead of parsing text.
"""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from dataclasses import dataclass
from importlib import metadata
from typing import Any

from seshat_intelligence.providers.docling_setup import detect_hardware, recommend_profile
from seshat_intelligence.setup import torch_wheels
from seshat_intelligence.setup.models import ModelSetup, plan_models

MIN_PYTHON = (3, 11)


@dataclass(frozen=True)
class Problem:
    code: str
    severity: str  # "error" stops the service from working well; "warning" is worth knowing
    message: str
    fix: str


def _uv() -> dict[str, Any]:
    path = shutil.which("uv")
    if path is None:
        return {"found": False, "version": None}
    try:
        done = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=20, check=False)
        return {"found": True, "version": done.stdout.strip().removeprefix("uv ").split(" ")[0] or None}
    except (OSError, subprocess.SubprocessError):
        return {"found": True, "version": None}


def _version(package: str) -> str | None:
    try:
        return metadata.version(package)
    except metadata.PackageNotFoundError:
        return None


def build_report(setup: ModelSetup) -> dict[str, Any]:
    """Look at this machine and say whether it can read documents with the given setup. Changes nothing."""
    hardware = detect_hardware()
    driver = torch_wheels.driver_cuda_version()
    torch_version = _version("torch")
    build = torch_wheels.torch_build()
    problems: list[Problem] = []

    if sys.version_info[:2] < MIN_PYTHON:
        problems.append(
            Problem("python_too_old", "error", f"Python {platform.python_version()} is older than {MIN_PYTHON[0]}.{MIN_PYTHON[1]}", "uv python install 3.11")
        )
    docling = _version("docling")
    if docling is None:
        problems.append(Problem("docling_missing", "error", "Docling is not installed in this environment", "uv sync"))
    if driver is not None and hardware.device != "cuda":
        reason = "this torch is a CPU build" if build == "cpu" else "torch cannot use it"
        problems.append(
            Problem("gpu_not_used", "warning", f"an NVIDIA GPU is there (driver supports CUDA {driver[0]}.{driver[1]}) but {reason}", "seshat-intelligence install")
        )

    models = plan_models(setup)
    if docling is not None and not models.ready:
        problems.append(
            Problem(
                "models_missing",
                "error",
                f"{len(models.missing)} model(s) of the {setup.profile} profile are not there ({models.missing_mb} MB to download)",
                "seshat-intelligence install",
            )
        )

    return {
        "ok": not any(problem.severity == "error" for problem in problems),
        "python": {"version": platform.python_version(), "ok": sys.version_info[:2] >= MIN_PYTHON},
        "platform": f"{platform.system()} {platform.machine()}",
        "uv": _uv(),
        "hardware": {
            "device": hardware.device,
            "name": hardware.name,
            "vram_gb": hardware.vram_gb,
            "cpu_count": hardware.cpu_count,
            "ram_gb": hardware.ram_gb,
            "nvidia_driver_cuda": f"{driver[0]}.{driver[1]}" if driver else None,
        },
        "torch": {"version": torch_version, "build": build, "cuda_available": hardware.device == "cuda"},
        "docling": {"version": docling},
        "profile": {"selected": setup.profile, "recommended": recommend_profile(hardware)},
        "models": models.as_dict(),
        "problems": [vars(problem) for problem in problems],
    }
