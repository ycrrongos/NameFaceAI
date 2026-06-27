from fastapi import APIRouter
from app.schemas.student import HealthResponse
from app.services.face_service import face_service

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    from app.config import settings

    try:
        face_service.load_model()
        status = "ok"
    except Exception as exc:
        return HealthResponse(
            status=f"error: {exc}",
            gpu=False,
            accelerator="cpu",
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

    return HealthResponse(
        status=status,
        gpu=face_service.gpu,
        accelerator=face_service.accelerator,
        provider=face_service.provider,
        inference_ms=inference_ms,
        model_loaded=face_service.model_loaded,
        face_model_name=settings.face_model_name,
        face_det_size=settings.face_det_size,
        llm_provider=settings.llm_provider or None,
    )
