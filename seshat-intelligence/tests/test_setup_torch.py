import subprocess

import pytest

from seshat_intelligence.setup import torch_wheels as tw

SHA = "a" * 64


def anchor(package: str, version: str, tag: str, python: str, platform: str) -> str:
    name = f"{package}-{version}+{tag}-{python}-{python}-{platform}.whl"
    url = f"https://download-r2.pytorch.org/whl/{tag}/{package}-{version}%2B{tag}-{python}-{python}-{platform}.whl"
    return f'<a href="{url}#sha256={SHA}" data-core-metadata="sha256={SHA}">{name}</a><br/>'


ROOT = '<a href="cpu/">cpu</a><br/><a href="cu118/">cu118</a><br/><a href="cu126/">cu126</a><br/><a href="cu130/">cu130</a><br/><a href="cu132/">cu132</a><br/>'


def index(entries: dict[str, str]):
    def fetch(url: str) -> str:
        return entries.get(url, "")

    return fetch


def listing(package: str, tag: str, version: str, python: str = "cp311", platforms=("win_amd64", "manylinux_2_28_x86_64")) -> str:
    return "".join(anchor(package, version, tag, python, p) for p in platforms)


INSTALLED = {"torch": tw.Installed("2.14.1", "cpu"), "torchvision": tw.Installed("0.29.1", "cpu")}


def pages(*tags: str, torch_version="2.14.1", vision_version="0.29.1") -> dict[str, str]:
    entries = {f"{tw.INDEX_URL}/": ROOT}
    for tag in tags:
        entries[f"{tw.INDEX_URL}/{tag}/torch/"] = listing("torch", tag, torch_version)
        entries[f"{tw.INDEX_URL}/{tag}/torchvision/"] = listing("torchvision", tag, vision_version)
    return entries


def test_the_index_is_parsed_into_wheels_with_their_checksums():
    wheels = tw.parse_index(listing("torch", "cu130", "2.14.1"))
    assert [w.filename for w in wheels] == [
        "torch-2.14.1+cu130-cp311-cp311-win_amd64.whl",
        "torch-2.14.1+cu130-cp311-cp311-manylinux_2_28_x86_64.whl",
    ]
    assert wheels[0].package == "torch" and wheels[0].local == "cu130" and wheels[0].sha256 == SHA


@pytest.mark.parametrize(("tag", "version"), [("cu126", (12, 6)), ("cu118", (11, 8)), ("cu130", (13, 0)), ("cpu", None), ("rocm7.0", None)])
def test_a_cuda_tag_is_a_cuda_version(tag, version):
    assert tw.cuda_version_of(tag) == version


def test_only_builds_the_driver_can_run_are_candidates_newest_first():
    assert tw.candidate_tags("cuda", ROOT, (13, 0)) == ["cu130", "cu126", "cu118"]
    assert tw.candidate_tags("cuda", ROOT, (12, 8)) == ["cu126", "cu118"]
    assert tw.candidate_tags("cuda", ROOT, (11, 4)) == []
    assert tw.candidate_tags("cpu", ROOT, None) == ["cpu"]


def test_the_newest_build_the_driver_supports_is_chosen_for_the_installed_version():
    plan = tw.plan("cuda", index(pages("cu130", "cu126")), driver=(13, 0), installed=INSTALLED, python="cp311", system="Windows", machine="x86_64")
    assert plan.tag == "cu130"
    assert [w.filename for w in plan.wheels] == [
        "torch-2.14.1+cu130-cp311-cp311-win_amd64.whl",
        "torchvision-0.29.1+cu130-cp311-cp311-win_amd64.whl",
    ]


def test_a_build_without_a_wheel_for_this_version_falls_back_to_an_older_one():
    entries = pages("cu126")
    entries[f"{tw.INDEX_URL}/cu130/torch/"] = listing("torch", "cu130", "2.10.0")  # not the installed version
    plan = tw.plan("cuda", index(entries), driver=(13, 0), installed=INSTALLED, python="cp311", system="Linux", machine="x86_64")
    assert plan.tag == "cu126"
    assert plan.wheels[0].filename.endswith("manylinux_2_28_x86_64.whl")


def test_a_python_without_a_wheel_gives_no_plan():
    plan = tw.plan("cuda", index(pages("cu130")), driver=(13, 0), installed=INSTALLED, python="cp313", system="Windows", machine="x86_64")
    assert plan is None


def test_torch_and_torchvision_stay_a_pair():
    entries = pages("cu130")
    entries[f"{tw.INDEX_URL}/cu130/torchvision/"] = listing("torchvision", "cu130", "0.20.0")  # a different torchvision
    assert tw.plan("cuda", index(entries), driver=(13, 0), installed=INSTALLED, python="cp311", system="Windows", machine="x86_64") is None


def test_without_torch_installed_there_is_nothing_to_plan():
    assert tw.plan("cuda", index(pages("cu130")), driver=(13, 0), installed={}, python="cp311", system="Windows", machine="x86_64") is None


def test_the_driver_cuda_version_is_read_from_nvidia_smi():
    def run(*_args, **_kwargs):
        return subprocess.CompletedProcess([], 0, stdout="| NVIDIA-SMI 581.57  Driver Version: 581.57  CUDA Version: 13.0 |", stderr="")

    assert tw.driver_cuda_version(run) == (13, 0)


def test_no_nvidia_smi_output_means_no_driver():
    assert tw.driver_cuda_version(lambda *a, **k: subprocess.CompletedProcess([], 9, stdout="", stderr="")) is None

    def missing(*_a, **_k):
        raise FileNotFoundError

    assert tw.driver_cuda_version(missing) is None


def test_apply_installs_the_wheels_together_over_the_current_torch(tmp_path, monkeypatch):
    plan = tw.plan("cuda", index(pages("cu130")), driver=(13, 0), installed=INSTALLED, python="cp311", system="Windows", machine="x86_64")
    fetched, commands = [], []

    def fake_download(url, destination, **_kwargs):
        fetched.append(destination.name)
        return destination

    monkeypatch.setattr(tw, "download_resumable", fake_download)
    monkeypatch.setattr(tw.subprocess, "run", lambda command, **_kw: commands.append(command) or subprocess.CompletedProcess(command, 0, "", ""))

    tw.apply(plan, tmp_path, uv="uv")

    assert fetched == [w.filename for w in plan.wheels]
    assert len(commands) == 1
    command = commands[0]
    assert command[:3] == ["uv", "pip", "install"]
    assert command.count("--reinstall-package") == 2 and "torch" in command and "torchvision" in command
    assert all(str(tmp_path / w.filename) in command for w in plan.wheels)


def test_a_failed_install_says_why(tmp_path, monkeypatch):
    plan = tw.plan("cuda", index(pages("cu130")), driver=(13, 0), installed=INSTALLED, python="cp311", system="Windows", machine="x86_64")
    monkeypatch.setattr(tw, "download_resumable", lambda url, destination, **_kw: destination)
    monkeypatch.setattr(tw.subprocess, "run", lambda command, **_kw: subprocess.CompletedProcess(command, 2, "", "resolution failed"))
    with pytest.raises(RuntimeError, match="resolution failed"):
        tw.apply(plan, tmp_path, uv="uv")
