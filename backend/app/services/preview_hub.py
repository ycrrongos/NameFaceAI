import asyncio
import base64
import time
from typing import Any

from fastapi import WebSocket


class PreviewHub:
    """将 Rokid 识别会话的画面与结果广播给电脑端预览客户端。"""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def broadcast_frame(
        self,
        frame_jpeg: bytes,
        faces: list[dict[str, Any]],
        inference_ms: float,
        width: int,
        height: int,
        received_at: float | None = None,
        processed_at: float | None = None,
    ) -> None:
        async with self._lock:
            if not self._clients:
                return
            clients = list(self._clients)

        now = time.perf_counter()
        recv = received_at if received_at is not None else now
        done = processed_at if processed_at is not None else now
        payload = {
            "type": "frame",
            "frame": base64.b64encode(frame_jpeg).decode("ascii"),
            "faces": faces,
            "inference_ms": inference_ms,
            "width": width,
            "height": height,
            "received_at": recv,
            "processed_at": done,
            "total_ms": round((done - recv) * 1000, 1),
        }

        dead: list[WebSocket] = []
        for websocket in clients:
            try:
                await websocket.send_json(payload)
            except Exception:
                dead.append(websocket)

        for websocket in dead:
            await self.disconnect(websocket)


preview_hub = PreviewHub()
