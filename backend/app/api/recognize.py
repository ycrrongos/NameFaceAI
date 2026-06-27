import json
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.schemas.student import AttendanceCheckIn, FaceMatch, RecognizeResponse
from app.services.attendance_service import attendance_service
from app.services.face_service import face_service

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
                    image = face_service.decode_base64_image(frame_b64)
                    matches, inference_ms = face_service.recognize(db, image)
                    response = _build_response(db, matches, inference_ms)
                    await websocket.send_json(response.model_dump())
                continue

            if frame is None:
                continue

            try:
                image = face_service.decode_image(frame)
                matches, inference_ms = face_service.recognize(db, image)
                response = _build_response(db, matches, inference_ms)
                await websocket.send_json(response.model_dump())
            except Exception as exc:
                await websocket.send_json({"error": str(exc)})
    except WebSocketDisconnect:
        pass
    finally:
        db.close()
