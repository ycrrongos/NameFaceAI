import asyncio
import json
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.schemas.student import FaceMatch, RecognizeResponse
from app.services.face_service import face_service
from app.services.preview_hub import preview_hub

router = APIRouter(tags=["recognize"])


def _process_frame_sync(db, frame: bytes) -> tuple[RecognizeResponse, int, int, float, float]:
    received_at = time.perf_counter()
    image = face_service.decode_image(frame)
    height, width = image.shape[:2]
    matches, inference_ms = face_service.recognize(db, image)
    processed_at = time.perf_counter()

    faces = [
        FaceMatch(
            bbox=m.bbox,
            name=m.name,
            student_id=m.student_id,
            confidence=m.confidence,
        )
        for m in matches
    ]
    response = RecognizeResponse(faces=faces, inference_ms=inference_ms)
    return response, width, height, received_at, processed_at


async def _process_frame(db, frame: bytes) -> RecognizeResponse:
    response, width, height, received_at, processed_at = await asyncio.to_thread(
        _process_frame_sync, db, frame
    )

    if preview_hub.client_count > 0:
        asyncio.create_task(
            preview_hub.broadcast_frame(
                frame_jpeg=frame,
                faces=[f.model_dump() for f in response.faces],
                inference_ms=response.inference_ms or 0,
                width=width,
                height=height,
                received_at=received_at,
                processed_at=processed_at,
            )
        )

    return response


@router.websocket("/ws/recognize")
async def recognize_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    db = SessionLocal()
    try:
        face_service.load_model()
        while True:
            data = await websocket.receive()
            if data.get("type") == "websocket.disconnect":
                break

            frame: bytes | None = None

            if "bytes" in data:
                frame = data["bytes"]
            elif "text" in data:
                payload = json.loads(data["text"])
                if payload.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue
                frame_b64 = payload.get("frame", "")
                if frame_b64:
                    image = face_service.decode_base64_image(frame_b64)
                    matches, inference_ms = face_service.recognize(db, image)
                    response = RecognizeResponse(
                        faces=[
                            FaceMatch(
                                bbox=m.bbox,
                                name=m.name,
                                student_id=m.student_id,
                                confidence=m.confidence,
                            )
                            for m in matches
                        ],
                        inference_ms=inference_ms,
                    )
                    await websocket.send_json(response.model_dump())
                continue

            if frame is None:
                continue

            try:
                response = await _process_frame(db, frame)
                await websocket.send_json(response.model_dump())
            except Exception as exc:
                await websocket.send_json({"error": str(exc)})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        db.close()
