import platform

import onnxruntime as ort
from fastapi import APIRouter

from app.config import settings
from app.schemas.student import HealthResponse
from app.services.face_service import face_service

router = APIRouter(tags=["health"])


def _accelerator_display() -> tuple[str, str | None]:
    if face_service.provider == "CoreMLExecutionProvider":
        return "Apple GPU", None
    if face_service.accelerator == "gpu":
        return "独显", None
    if face_service.accelerator == "igpu":
        return "集显", None
    if platform.system() == "Darwin" and platform.machine() == "arm64":
        if "CoreMLExecutionProvider" in ort.get_available_providers():
            return (
                "Apple Silicon",
                f"{settings.face_model_name} 暂不支持 Mac GPU，已用 CPU 推理（约 {face_service._last_inference_ms or 0:.0f} ms）",
            )
    return "CPU", None


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    try:
        face_service.load_model()
        status = "ok"
    except Exception as exc:
        return HealthResponse(
            status=f"error: {exc}",
            gpu=False,
            accelerator="cpu",
            accelerator_label="CPU",
            provider="none",
            inference_ms=None,
            model_loaded=False,
            face_model_name=settings.face_model_name,
            face_det_size=settings.face_det_size,
            llm_provider=settings.llm_provider or None,
        )

    inference_ms = face_service._last_inference_ms
    if inference_ms is None:
        import numpy as np

        dummy = np.zeros((480, 640, 3), dtype=np.uint8)
        face_service.detect_and_embed(dummy)
        inference_ms = face_service._last_inference_ms

    label, note = _accelerator_display()

    return HealthResponse(
        status=status,
        gpu=face_service.gpu,
        accelerator=face_service.accelerator,
        accelerator_label=label,
        accelerator_note=note,
        provider=face_service.provider,
        inference_ms=inference_ms,
        model_loaded=face_service.model_loaded,
        face_model_name=settings.face_model_name,
        face_det_size=settings.face_det_size,
        llm_provider=settings.llm_provider or None,
    )
