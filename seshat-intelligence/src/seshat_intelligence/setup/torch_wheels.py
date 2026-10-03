"""Choose and install the PyTorch build that fits the machine.

Docling runs on PyTorch, and which build you get is decided by where it is installed from: on Windows PyPI has
only the CPU build, on Linux it has a CUDA build whatever the machine. A CUDA build is what makes the layout
and formula models fast on an NVIDIA card, and the right one depends on the driver: the newest CUDA the driver
supports, among the builds PyTorch publishes for the installed torch version.

Nothing here is installed unless `apply` is called; `plan` only reads the PyTorch package index.
"""

from __future__ import annotations

import platform
import re
import shutil
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from importlib import metadata
from pathlib import Path
from urllib.parse import unquote

from seshat_intelligence.setup.downloads import download_resumable

INDEX_URL = "https://download.pytorch.org/whl"
PACKAGES = ("torch", "torchvision")

_ANCHOR = re.compile(r'<a href="(?P<url>[^"#]+)#sha256=(?P<sha>[0-9a-f]{64})"[^>]*>(?P<name>[^<]+)</a>')
_WHEEL = re.compile(r"^(?P<dist>[^-]+)-(?P<version>[^-]+?)(?:\+(?P<local>[^-]+))?-(?P<python>[^-]+)-(?P<abi>[^-]+)-(?P<platform>[^-]+)\.whl$")
_TAG_LINK = re.compile(r'href="(?P<tag>cu\d+|cpu)/"')


@dataclass(frozen=True)
class Wheel:
    package: str
    version: str
    local: str  # "cu130", "cpu"
    filename: str
    url: str
    sha256: str


@dataclass(frozen=True)
class Installed:
    """What is installed now: version without its local part, and the local part ("cu126", "cpu", "")."""

    version: str
    local: str


@dataclass(frozen=True)
class TorchPlan:
    target: str  # "cuda" or "cpu"
    tag: str  # the PyTorch index it comes from: "cu130", "cpu"
    wheels: tuple[Wheel, ...]


def parse_index(html: str) -> list[Wheel]:
    """The wheels listed on one package page of the PyTorch index."""
    wheels = []
    for anchor in _ANCHOR.finditer(html):
        name = unquote(anchor.group("name")).strip()
        match = _WHEEL.match(name)
        if match is None:
            continue
        wheels.append(
            Wheel(match.group("dist").replace("_", "-"), match.group("version"), match.group("local") or "", name, anchor.group("url"), anchor.group("sha"))
        )
    return wheels


def python_tag() -> str:
    return f"cp{sys.version_info.major}{sys.version_info.minor}"


def _wheel_matches_machine(filename: str, python: str, system: str, machine: str) -> bool:
    match = _WHEEL.match(filename)
    if match is None or match.group("python") != python or match.group("abi") != python:
        return False
    tag = match.group("platform")
    if system == "Windows":
        return tag == "win_amd64"
    if system == "Linux":
        return tag.startswith("manylinux") and tag.endswith(machine) or tag == f"linux_{machine}"
    return False


def cuda_version_of(tag: str) -> tuple[int, int] | None:
    """cu126 is CUDA 12.6, cu118 is 11.8, cu130 is 13.0."""
    match = re.fullmatch(r"cu(\d+)", tag)
    if match is None:
        return None
    digits = match.group(1)
    return int(digits[:-1]), int(digits[-1])


def driver_cuda_version(run: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run) -> tuple[int, int] | None:
    """The newest CUDA the NVIDIA driver supports, from `nvidia-smi`; None when there is no NVIDIA driver."""
    if shutil.which("nvidia-smi") is None and run is subprocess.run:
        return None
    try:
        done = run(["nvidia-smi"], capture_output=True, text=True, timeout=20, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    match = re.search(r"CUDA Version:\s*(\d+)\.(\d+)", done.stdout or "")
    return (int(match.group(1)), int(match.group(2))) if match else None


def installed_version(package: str) -> Installed | None:
    try:
        raw = metadata.version(package)
    except metadata.PackageNotFoundError:
        return None
    base, _, local = raw.partition("+")
    return Installed(base, local)


def torch_build() -> str:
    """"cuda", "cpu" or "none" for the torch that is installed."""
    current = installed_version("torch")
    if current is None:
        return "none"
    return "cuda" if current.local.startswith("cu") else "cpu"


def candidate_tags(target: str, root_html: str, driver: tuple[int, int] | None) -> list[str]:
    """The PyTorch indexes to try, best first: for CUDA the builds the driver can run, newest first."""
    if target == "cpu":
        return ["cpu"]
    tags = []
    for match in _TAG_LINK.finditer(root_html):
        version = cuda_version_of(match.group("tag"))
        if version is not None and (driver is None or version <= driver):
            tags.append((version, match.group("tag")))
    return [tag for _, tag in sorted(tags, reverse=True)]


def plan(
    target: str,
    fetch: Callable[[str], str],
    *,
    driver: tuple[int, int] | None,
    installed: dict[str, Installed],
    python: str | None = None,
    system: str | None = None,
    machine: str | None = None,
) -> TorchPlan | None:
    """The wheels that give the installed torch version the requested build, or None when the index has none.

    `fetch(url)` returns the text at a URL (the index pages), so this can be tested without a network.
    """
    python = python or python_tag()
    system = system or platform.system()
    machine = machine or platform.machine().lower().replace("amd64", "x86_64").replace("arm64", "aarch64")
    wanted = {name: installed[name] for name in PACKAGES if name in installed}
    if "torch" not in wanted:
        return None

    for tag in candidate_tags(target, fetch(f"{INDEX_URL}/"), driver):
        found: list[Wheel] = []
        for package, version in wanted.items():
            listing = parse_index(fetch(f"{INDEX_URL}/{tag}/{package}/"))
            match = [
                w
                for w in listing
                if w.package == package and w.version == version.version and w.local == tag and _wheel_matches_machine(w.filename, python, system, machine)
            ]
            if not match:
                break
            found.append(match[0])
        else:
            return TorchPlan(target, tag, tuple(found))
    return None


def apply(plan_: TorchPlan, cache_dir: Path, *, uv: str | None = None, progress: Callable[[str, int, int | None], None] | None = None) -> None:
    """Download the wheels (resumable) and install them over the current torch, in one command so torch and
    torchvision stay a matching pair."""
    uv = uv or shutil.which("uv")
    if uv is None:
        raise RuntimeError("uv is needed to install the PyTorch build; install it from https://docs.astral.sh/uv/")
    paths = []
    for wheel in plan_.wheels:
        report = (lambda done, total, name=wheel.filename: progress(name, done, total)) if progress else None
        paths.append(download_resumable(wheel.url, cache_dir / wheel.filename, sha256=wheel.sha256, progress=report))
    command = [uv, "pip", "install", "--python", sys.executable]
    for wheel in plan_.wheels:
        command += ["--reinstall-package", wheel.package]
    command += [str(path) for path in paths]
    done = subprocess.run(command, capture_output=True, text=True, check=False)
    if done.returncode != 0:
        raise RuntimeError(f"uv could not install the PyTorch build:\n{(done.stderr or done.stdout)[-1500:]}")
