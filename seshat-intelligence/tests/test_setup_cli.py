import json

import pytest

from seshat_intelligence.providers.docling_setup import MODELS, Hardware
from seshat_intelligence.setup import cli, report
from seshat_intelligence.setup import torch_wheels as tw


@pytest.fixture
def machine(monkeypatch):
    """A machine with an NVIDIA driver and a CPU build of torch, until a test says otherwise."""
    state = {"driver": (13, 0), "build": "cpu", "device": "cpu"}
    monkeypatch.setattr(tw, "driver_cuda_version", lambda *a, **k: state["driver"])
    monkeypatch.setattr(tw, "torch_build", lambda: state["build"])
    monkeypatch.setattr(report, "detect_hardware", lambda: Hardware(state["device"], "Test GPU", 4.0, 12, 17.0))
    monkeypatch.setattr(cli, "detect_hardware", lambda: Hardware(state["device"], "Test GPU", 4.0, 12, 17.0))
    return state


def prepared(tmp_path, *keys):
    for key in keys:
        (tmp_path / MODELS[key].folder).mkdir()
    return tmp_path


def run_check(capsys, tmp_path, *extra):
    code = cli.main(["check", "--json", "--profile", "minimal", "--artifacts-path", str(tmp_path), *extra])
    return code, json.loads(capsys.readouterr().out)


def test_check_reports_missing_models_with_the_command_that_fixes_them(machine, tmp_path, capsys):
    code, data = run_check(capsys, tmp_path)
    assert code == 1 and data["ok"] is False
    problem = next(p for p in data["problems"] if p["code"] == "models_missing")
    assert problem["severity"] == "error" and problem["fix"] == "seshat-intelligence install"
    assert data["models"]["missing_mb"] == MODELS["layout"].size_mb + MODELS["tableformer"].size_mb


def test_check_is_ready_when_the_models_are_there(machine, tmp_path, capsys):
    machine["device"], machine["build"] = "cuda", "cuda"
    code, data = run_check(capsys, prepared(tmp_path, "layout", "tableformer"))
    assert code == 0 and data["ok"] is True and data["problems"] == []
    assert data["torch"]["build"] == "cuda" and data["hardware"]["nvidia_driver_cuda"] == "13.0"


def test_a_gpu_that_torch_cannot_use_is_a_warning_not_a_failure(machine, tmp_path, capsys):
    code, data = run_check(capsys, prepared(tmp_path, "layout", "tableformer"))
    assert code == 0 and data["ok"] is True
    warning = next(p for p in data["problems"] if p["code"] == "gpu_not_used")
    assert warning["severity"] == "warning" and "CPU build" in warning["message"]


def test_no_gpu_no_warning(machine, tmp_path, capsys):
    machine["driver"] = None
    _, data = run_check(capsys, prepared(tmp_path, "layout", "tableformer"))
    assert [p["code"] for p in data["problems"]] == []


def test_the_text_report_is_readable(machine, tmp_path, capsys):
    code = cli.main(["check", "--profile", "minimal", "--artifacts-path", str(tmp_path)])
    out = capsys.readouterr().out
    assert code == 1 and "MISSING" in out and "fix: seshat-intelligence install" in out


def test_a_dry_run_installs_nothing_and_says_what_it_would_do(machine, tmp_path, capsys, monkeypatch):
    plan = tw.TorchPlan("cuda", "cu130", (tw.Wheel("torch", "2.14.1", "cu130", "torch-2.14.1+cu130-cp311-cp311-win_amd64.whl", "https://x", "a" * 64),))
    monkeypatch.setattr(tw, "plan", lambda *a, **k: plan)
    monkeypatch.setattr(tw, "installed_version", lambda name: tw.Installed("2.14.1", "cpu"))
    touched = []
    monkeypatch.setattr(tw, "apply", lambda *a, **k: touched.append("torch"))
    monkeypatch.setattr(cli, "download_models", lambda *a, **k: touched.append("models"))

    code = cli.main(["install", "--json", "--dry-run", "--profile", "minimal", "--artifacts-path", str(tmp_path)])

    data = json.loads(capsys.readouterr().out)
    steps = {step["name"]: step for step in data["steps"]}
    assert touched == []
    assert steps["torch"]["status"] == "planned" and "cu130" in steps["torch"]["detail"]
    assert steps["models"]["status"] == "planned"
    assert code == 1  # still not ready: nothing was installed


def test_install_downloads_what_is_missing_and_records_it(machine, tmp_path, capsys, monkeypatch):
    machine["driver"] = None  # no GPU step
    fetched = []

    def fake_download(setup):
        fetched.append(setup.profile)
        prepared(tmp_path, "layout", "tableformer")

    monkeypatch.setattr(cli, "download_models", fake_download)

    code = cli.main(["install", "--json", "--profile", "minimal", "--artifacts-path", str(tmp_path)])

    data = json.loads(capsys.readouterr().out)
    assert fetched == ["minimal"]
    assert [step["name"] for step in data["steps"]] == ["torch", "models"]
    assert data["steps"][1]["status"] == "installed"
    assert code == 0 and data["ok"] is True
    assert (tmp_path / "seshat-models.json").exists()


def test_install_keeps_a_complete_profile_and_downloads_nothing(machine, tmp_path, capsys, monkeypatch):
    machine["driver"] = None
    monkeypatch.setattr(cli, "download_models", lambda *a, **k: pytest.fail("nothing is missing"))
    code = cli.main(["install", "--json", "--profile", "minimal", "--artifacts-path", str(prepared(tmp_path, "layout", "tableformer"))])
    data = json.loads(capsys.readouterr().out)
    assert code == 0 and data["steps"][1] == {"name": "models", "status": "ok", "detail": "the minimal profile is complete"}


def test_a_failed_model_download_is_reported_not_raised(machine, tmp_path, capsys, monkeypatch):
    machine["driver"] = None

    def broken(setup):
        raise OSError("connection reset")

    monkeypatch.setattr(cli, "download_models", broken)
    code = cli.main(["install", "--json", "--profile", "minimal", "--artifacts-path", str(tmp_path)])
    data = json.loads(capsys.readouterr().out)
    assert code == 1 and data["ok"] is False
    assert data["steps"][1]["status"] == "failed" and "connection reset" in data["steps"][1]["detail"]
    assert not (tmp_path / "seshat-models.json").exists()


def test_the_gpu_step_is_skipped_when_asked_or_when_there_is_no_gpu(machine, tmp_path, capsys, monkeypatch):
    monkeypatch.setattr(cli, "download_models", lambda *a, **k: None)
    cli.main(["install", "--json", "--no-gpu", "--skip-models", "--profile", "minimal", "--artifacts-path", str(tmp_path)])
    assert json.loads(capsys.readouterr().out)["steps"][0] == {"name": "torch", "status": "skipped", "detail": "GPU build not requested"}
    machine["driver"] = None
    cli.main(["install", "--json", "--skip-models", "--profile", "minimal", "--artifacts-path", str(tmp_path)])
    assert json.loads(capsys.readouterr().out)["steps"][0]["detail"] == "no NVIDIA driver found"
