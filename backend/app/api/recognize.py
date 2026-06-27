import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.face_service import face_service
from app.services.recognize_pipeline import new_db_session, process_frame

router = APIRouter(tags=["recognize"])


@router.websocket("/ws/recognize")
async def recognize_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    db = new_db_session()
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
                    import base64

                    frame = base64.b64decode(
                        frame_b64.split(",", 1)[1] if "," in frame_b64 else frame_b64
                    )
                else:
                    continue

            if frame is None:
                continue

            try:
                response = await process_frame(db, frame)
                await websocket.send_json(response.model_dump())
            except WebSocketDisconnect:
                break
            except Exception as exc:
                try:
                    await websocket.send_json({"error": str(exc)})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        db.close()
