import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pypdf
import pytest

from seshat_intelligence.config import Settings
from seshat_intelligence.providers.docling_setup import (
    MODELS,
    PROFILES,
    Hardware,
    build_pipeline_options,
    detect_hardware,
    profile_size_mb,
    recommend_profile,
)

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "prepare_models.py"


def load_script():
    spec = importlib.util.spec_from_file_location("prepare_models", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_profiles_only_name_known_models_and_grow():
    sizes = [profile_size_mb(name) for name in ("minimal", "standard", "full")]
    assert sizes == sorted(sizes) and len(set(sizes)) == 3
    for spec in PROFILES.values():
        assert set(spec.models) <= set(MODELS)


@pytest.mark.parametrize(
    ("profile", "accurate", "pictures", "code_formula"),
    [("minimal", False, False, False), ("standard", True, True, False), ("full", True, True, True)],
)
def test_pipeline_options_follow_the_profile(profile, accurate, pictures, code_formula):
    options = build_pipeline_options(Settings(docling_profile=profile))
    assert (options.table_structure_options.mode.value == "accurate") is accurate
    assert options.do_table_structure is True
    assert options.do_picture_classification is pictures
    assert options.do_code_enrichment is code_formula
    assert options.do_formula_enrichment is code_formula


def test_pipeline_options_carry_device_threads_ocr_and_artifacts(tmp_path):
    options = build_pipeline_options(
        Settings(docling_device="cpu", docling_num_threads=3, docling_ocr="none", docling_artifacts_path=tmp_path)
    )
    assert options.accelerator_options.device == "cpu"
    assert options.accelerator_options.num_threads == 3
    assert options.do_ocr is False
    assert options.artifacts_path == tmp_path


def test_easyocr_gets_the_configured_languages():
    options = build_pipeline_options(Settings(docling_ocr="easyocr", docling_ocr_languages=["fr", "de"]))
    assert options.ocr_options.lang == ["fr", "de"]


def fake_torch(cuda: bool = False, mps: bool = False):
    props = SimpleNamespace(total_memory=8e9)
    return SimpleNamespace(
        cuda=SimpleNamespace(is_available=lambda: cuda, get_device_properties=lambda _: props, get_device_name=lambda _: "Test GPU"),
        backends=SimpleNamespace(mps=SimpleNamespace(is_available=lambda: mps)),
    )


def test_hardware_detection_prefers_cuda_then_mps_then_cpu():
    assert detect_hardware(fake_torch(cuda=True)).device == "cuda"
    assert detect_hardware(fake_torch(cuda=True)).vram_gb == 8.0
    assert detect_hardware(fake_torch(mps=True)).device == "mps"
    assert detect_hardware(fake_torch()).device == "cpu"


def test_a_broken_gpu_stack_means_cpu_not_a_failed_plan():
    broken = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: 1 / 0), backends=None)
    assert detect_hardware(broken).device == "cpu"


@pytest.mark.parametrize(
    ("hardware", "expected"),
    [
        (Hardware("cuda", "x", 12.0, 16, 32.0), "full"),
        (Hardware("cuda", "x", 4.0, 8, 16.0), "standard"),
        (Hardware("mps", "x", None, 8, 16.0), "standard"),
        (Hardware("cpu", "x", None, 12, 17.0), "standard"),
        (Hardware("cpu", "x", None, 2, 4.0), "minimal"),
    ],
)
def test_the_recommended_profile_fits_the_machine(hardware, expected):
    assert recommend_profile(hardware) == expected


def test_the_check_pdf_is_a_readable_pdf_with_its_text():
    script = load_script()
    from io import BytesIO

    reader = pypdf.PdfReader(BytesIO(script.tiny_pdf()))
    assert len(reader.pages) == 1 and "Model check" in reader.pages[0].extract_text()


def test_presence_in_an_artifacts_directory_is_by_model_folder(tmp_path):
    script = load_script()
    assert script.is_present("layout", tmp_path) is False
    (tmp_path / MODELS["layout"].folder).mkdir()
    assert script.is_present("layout", tmp_path) is True
    assert script.is_present("code_formula", tmp_path) is False


def test_the_plan_lists_what_is_missing_and_downloads_nothing(tmp_path, capsys, monkeypatch):
    script = load_script()
    (tmp_path / MODELS["layout"].folder).mkdir()
    calls = []
    monkeypatch.setattr(script, "download", lambda *a, **k: calls.append(a))

    code = script.main(["--profile", "full", "--artifacts-path", str(tmp_path)])

    out = capsys.readouterr().out
    assert code == 0 and not calls
    assert "present" in out and "MISSING" in out and "code_formula" in out
    assert f"To download: {profile_size_mb('full') - MODELS['layout'].size_mb} MB" in out
    assert "Nothing was downloaded" in out
