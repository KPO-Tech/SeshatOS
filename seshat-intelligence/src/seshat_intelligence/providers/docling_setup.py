"""How Docling is set up here: which models a profile needs, how its pipeline is configured, and what the
machine can run. The service and the model preparation script (scripts/prepare_models.py) both read this, so
what is prepared is exactly what is used.

Nothing here loads a model: building the options is cheap, and the heavy imports of docling happen only
when a converter is built.
"""

from __future__ import annotations

import os
import platform
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

if TYPE_CHECKING:
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter

    from seshat_intelligence.config import Settings

Profile = Literal["minimal", "standard", "full"]


@dataclass(frozen=True)
class Model:
    """One model Docling can use. Sizes are what the Hugging Face repository weighs, measured on
    2026-10-03, and are only there so the plan can say what a download costs."""

    key: str
    repo_id: str
    size_mb: int
    purpose: str
    download_flag: str  # the keyword of docling.utils.model_downloader.download_models that fetches it
    folder: str  # where download_models puts it under an artifacts directory


MODELS: dict[str, Model] = {
    "layout": Model(
        "layout",
        "docling-project/docling-layout-heron",
        164,
        "finds headings, text, tables, figures, formulas and code on a page, and their reading order",
        "with_layout",
        "docling-project--docling-layout-heron",
    ),
    "tableformer": Model(
        "tableformer",
        "docling-project/docling-models",
        358,
        "rebuilds the rows, columns and merged cells of a table",
        "with_tableformer",
        "docling-project--docling-models",
    ),
    "picture_classifier": Model(
        "picture_classifier",
        "docling-project/DocumentFigureClassifier-v2.5",
        34,
        "says what a picture is (chart, diagram, photo, logo, signature...)",
        "with_picture_classifier",
        "docling-project--DocumentFigureClassifier-v2.5",
    ),
    "code_formula": Model(
        "code_formula",
        "docling-project/CodeFormulaV2",
        640,
        "reads a formula as LaTeX and a code block with its line breaks and indentation",
        "with_code_formula",
        "docling-project--CodeFormulaV2",
    ),
}


@dataclass(frozen=True)
class ProfileSpec:
    description: str
    models: tuple[str, ...]
    accurate_tables: bool
    picture_classification: bool
    code_and_formulas: bool


PROFILES: dict[str, ProfileSpec] = {
    "minimal": ProfileSpec(
        "layout and tables, as Docling does by default; light enough for any laptop",
        ("layout", "tableformer"),
        accurate_tables=False,
        picture_classification=False,
        code_and_formulas=False,
    ),
    "standard": ProfileSpec(
        "adds the accurate table mode and the picture classifier",
        ("layout", "tableformer", "picture_classifier"),
        accurate_tables=True,
        picture_classification=True,
        code_and_formulas=False,
    ),
    "full": ProfileSpec(
        "adds formulas as LaTeX and code with its line breaks; slow without a GPU",
        ("layout", "tableformer", "picture_classifier", "code_formula"),
        accurate_tables=True,
        picture_classification=True,
        code_and_formulas=True,
    ),
}


def profile_size_mb(profile: str) -> int:
    return sum(MODELS[key].size_mb for key in PROFILES[profile].models)


@dataclass(frozen=True)
class Hardware:
    device: Literal["cuda", "mps", "cpu"]
    name: str
    vram_gb: float | None
    cpu_count: int
    ram_gb: float | None


def detect_hardware(torch_module: Any | None = None) -> Hardware:
    """What Docling can run on here. `torch_module` is for tests; by default torch is imported if there is one."""
    cpu_count = os.cpu_count() or 1
    ram_gb: float | None = None
    try:
        import psutil

        ram_gb = round(psutil.virtual_memory().total / 1e9, 1)
    except ImportError:
        pass

    torch = torch_module
    if torch is None:
        try:
            import torch  # type: ignore[no-redef]
        except ImportError:
            torch = None
    if torch is not None:
        try:
            if torch.cuda.is_available():
                props = torch.cuda.get_device_properties(0)
                return Hardware("cuda", torch.cuda.get_device_name(0), round(props.total_memory / 1e9, 1), cpu_count, ram_gb)
            mps = getattr(getattr(torch, "backends", None), "mps", None)
            if mps is not None and mps.is_available():
                return Hardware("mps", platform.processor() or "Apple silicon", None, cpu_count, ram_gb)
        except Exception:  # noqa: BLE001 - a broken GPU stack means "no GPU", not a failed plan
            pass
    return Hardware("cpu", platform.processor() or platform.machine(), None, cpu_count, ram_gb)


def recommend_profile(hardware: Hardware) -> Profile:
    """`full` only where the formula model runs at a useful speed: a CUDA card with room for it. Elsewhere
    `standard`, and `minimal` on a machine too small to run the rest comfortably."""
    if hardware.device == "cuda" and (hardware.vram_gb or 0) >= 6:
        return "full"
    if hardware.ram_gb is not None and hardware.ram_gb < 8:
        return "minimal"
    return "standard"


def build_pipeline_options(settings: "Settings") -> "PdfPipelineOptions":
    from docling.datamodel.pipeline_options import (
        AcceleratorOptions,
        EasyOcrOptions,
        PdfPipelineOptions,
        RapidOcrOptions,
        TableFormerMode,
    )

    spec = PROFILES[settings.docling_profile]
    options = PdfPipelineOptions()
    options.do_ocr = settings.docling_ocr != "none"
    if settings.docling_ocr == "easyocr":
        options.ocr_options = EasyOcrOptions(lang=list(settings.docling_ocr_languages))
    elif settings.docling_ocr == "rapidocr":
        options.ocr_options = RapidOcrOptions()
    options.do_table_structure = True
    options.table_structure_options.mode = TableFormerMode.ACCURATE if spec.accurate_tables else TableFormerMode.FAST
    options.do_picture_classification = spec.picture_classification
    options.do_code_enrichment = spec.code_and_formulas
    options.do_formula_enrichment = spec.code_and_formulas
    options.accelerator_options = AcceleratorOptions(device=settings.docling_device, num_threads=settings.docling_num_threads)
    if settings.docling_artifacts_path is not None:
        options.artifacts_path = Path(settings.docling_artifacts_path)
    return options


def build_converter(settings: "Settings") -> "DocumentConverter":
    """The converter for the configured profile. With `docling_offline` it never reaches the network: a
    model that was not prepared is an error, not a download in the middle of a request."""
    if settings.docling_offline:
        os.environ["HF_HUB_OFFLINE"] = "1"
    from docling.datamodel.base_models import InputFormat
    from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption

    options = build_pipeline_options(settings)
    pdf_kwargs: dict[str, Any] = {"pipeline_options": options}
    if settings.docling_pdf_backend == "pypdfium":
        # Docling's default PDF reader (docling-parse) splits words at kerning gaps and breaks accented
        # letters on some fonts; pdfium reads the same files correctly. See docling-project/docling#4018.
        from docling.backend.pypdfium2_backend import PyPdfiumDocumentBackend

        pdf_kwargs["backend"] = PyPdfiumDocumentBackend
    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(**pdf_kwargs),
            InputFormat.IMAGE: ImageFormatOption(pipeline_options=options),
        }
    )
