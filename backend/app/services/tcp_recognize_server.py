"""TCP 识别服务：长度前缀 JPEG 帧入 / JSON 出（供 Rokid APK 原生推流）。"""

from __future__ import annotations

import asyncio
import json
import logging
import struct

from app.config import settings
from app.services.face_service import face_service
from app.services.recognize_pipeline import new_db_session, process_frame

logger = logging.getLogger(__name__)

_MAX_FRAME_BYTES = 10 * 1024 * 1024
_HEADER = struct.Struct(">I")


async def _read_exact(reader: asyncio.StreamReader, size: int) -> bytes:
    data = await reader.readexactly(size)
    if len(data) < size:
        raise ConnectionError("connection closed")
    return data


async def _handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    peer = writer.get_extra_info("peername")
    logger.info("TCP recognize connected: %s", peer)
    db = new_db_session()
    try:
        face_service.load_model()
        while True:
            length_bytes = await _read_exact(reader, _HEADER.size)
            (length,) = _HEADER.unpack(length_bytes)
            if length < 1 or length > _MAX_FRAME_BYTES:
                raise ValueError(f"invalid frame length: {length}")
            frame = await _read_exact(reader, length)

            try:
                response = await process_frame(db, frame)
                payload = json.dumps(response.model_dump(), ensure_ascii=False).encode("utf-8")
            except Exception as exc:
                payload = json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8")

            writer.write(_HEADER.pack(len(payload)))
            writer.write(payload)
            await writer.drain()
    except (asyncio.IncompleteReadError, ConnectionError, ConnectionResetError):
        pass
    except Exception:
        logger.exception("TCP recognize error from %s", peer)
    finally:
        db.close()
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        logger.info("TCP recognize disconnected: %s", peer)


async def run_tcp_recognize_server() -> asyncio.Server:
    server = await asyncio.start_server(
        _handle_client,
        host="0.0.0.0",
        port=settings.tcp_recognize_port,
    )
    addr = ", ".join(str(sock.getsockname()) for sock in server.sockets or [])
    logger.info("TCP recognize listening on %s", addr)
    return server
