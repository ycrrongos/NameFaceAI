import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.schemas.student import FaceMatch, RecognizeResponse
from app.services.face_service import face_service

router = APIRouter(tags=["recognize"])


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
                image = face_service.decode_image(frame)
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
            except Exception as exc:
                await websocket.send_json({"error": str(exc)})
    except WebSocketDisconnect:
        pass
    finally:
        db.close()
