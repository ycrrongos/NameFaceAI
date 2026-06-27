import asyncio
import json
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.schemas.student import AttendanceCheckIn, FaceMatch, RecognizeResponse
from app.services.attendance_service import attendance_service
from app.services.face_service import face_service
from app.services.preview_hub import preview_hub

router = APIRouter(tags=["recognize"])

_AUTO_MARK_DEBOUNCE_SEC = 30.0
_last_auto_mark: dict[int, float] = {}


def _handle_checkin(db, student_id: int, name: str) -> AttendanceCheckIn:
    now = time.monotonic()
    last = _last_auto_mark.get(student_id, 0.0)
    if now - last >= _AUTO_MARK_DEBOUNCE_SEC:
        result = attendance_service.process_auto_checkin(db, student_id)
        if result.newly_marked:
            _last_auto_mark[student_id] = now
    else:
        result = attendance_service.get_checkin_status(db, student_id)

    return AttendanceCheckIn(
        student_id=student_id,
        name=name,
        checked_in=result.checked_in,
        newly_marked=result.newly_marked,
        source=result.source,
    )


def _build_response(db, matches, inference_ms: float) -> RecognizeResponse:
    attendance: list[AttendanceCheckIn] = []
    seen: set[int] = set()

    for match in matches:
        if match.student_id is None or match.student_id in seen:
            continue
        seen.add(match.student_id)
        attendance.append(_handle_checkin(db, match.student_id, match.name))

    return RecognizeResponse(
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
        attendance=attendance,
    )


def _process_frame_sync(db, frame: bytes) -> tuple[RecognizeResponse, int, int, float, float]:
    received_at = time.perf_counter()
    image = face_service.decode_image(frame)
    height, width = image.shape[:2]
    matches, inference_ms = face_service.recognize(db, image)
    processed_at = time.perf_counter()
    response = _build_response(db, matches, inference_ms)
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
                    import base64

                    frame = base64.b64decode(
                        frame_b64.split(",", 1)[1] if "," in frame_b64 else frame_b64
                    )
                else:
                    continue

            if frame is None:
                continue

            try:
                response = await _process_frame(db, frame)
                await websocket.send_json(response.model_dump())
            except Exception as exc:
                await websocket.send_json({"error": str(exc)})
    except WebSocketDisconnect:
        pass
    finally:
        db.close()
