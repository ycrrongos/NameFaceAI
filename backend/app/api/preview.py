from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.preview_hub import preview_hub

router = APIRouter(tags=["preview"])


@router.websocket("/ws/preview")
async def preview_ws(websocket: WebSocket) -> None:
    await preview_hub.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await preview_hub.disconnect(websocket)
