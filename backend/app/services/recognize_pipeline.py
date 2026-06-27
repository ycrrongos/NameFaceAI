import asyncio
import time

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.schemas.student import AttendanceCheckIn, FaceMatch, RecognizeResponse
from app.services.attendance_service import attendance_service
from app.services.face_service import face_service
from app.services.preview_hub import preview_hub

_AUTO_MARK_DEBOUNCE_SEC = 30.0
_last_auto_mark: dict[int, float] = {}


def _handle_checkin(db: Session, student_id: int, name: str) -> AttendanceCheckIn:
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


def _build_response(
    db: Session, matches, inference_ms: float, width: int, height: int
) -> RecognizeResponse:
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
        frame_width=width,
        frame_height=height,
    )


def process_frame_sync(db: Session, frame: bytes) -> tuple[RecognizeResponse, int, int, float, float]:
    received_at = time.perf_counter()
    image = face_service.decode_image(frame)
    height, width = image.shape[:2]
    matches, inference_ms = face_service.recognize(db, image)
    processed_at = time.perf_counter()
    response = _build_response(db, matches, inference_ms, width, height)
    return response, width, height, received_at, processed_at


async def process_frame(db: Session, frame: bytes) -> RecognizeResponse:
    response, width, height, received_at, processed_at = await asyncio.to_thread(
        process_frame_sync, db, frame
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


def new_db_session() -> Session:
    return SessionLocal()
