#!/usr/bin/env python3
"""从 scrcpy 命名管道读取视频，提供 MJPEG HTTP 流（支持多客户端）。"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class ReuseHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def jpeg_frames(stream):
    buf = b""
    while True:
        chunk = stream.read(8192)
        if not chunk:
            break
        buf += chunk
        while True:
            start = buf.find(b"\xff\xd8")
            end = buf.find(b"\xff\xd9", start + 2) if start >= 0 else -1
            if start < 0 or end < 0:
                if start > 0:
                    buf = buf[start:]
                break
            yield buf[start : end + 2]
            buf = buf[end + 2 :]


class MjpegBroadcaster:
    def __init__(self, pipe_path: str) -> None:
        self.pipe_path = pipe_path
        self._frame: bytes | None = None
        self._lock = threading.Lock()
        self._running = True
        threading.Thread(target=self._capture_loop, daemon=True).start()

    def _capture_loop(self) -> None:
        while self._running:
            if not os.path.exists(self.pipe_path):
                time.sleep(0.5)
                continue
            cmd = [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-probesize",
                "5M",
                "-analyzeduration",
                "5M",
                "-i",
                self.pipe_path,
                "-an",
                "-f",
                "mjpeg",
                "-q:v",
                "5",
                "pipe:1",
            ]
            try:
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
            except OSError as err:
                print(f"ffmpeg 启动失败: {err}", file=sys.stderr)
                time.sleep(2)
                continue
            assert proc.stdout is not None
            for frame in jpeg_frames(proc.stdout):
                with self._lock:
                    self._frame = frame
            rc = proc.wait()
            if rc != 0 and self._running:
                time.sleep(1)

    def latest(self) -> bytes | None:
        with self._lock:
            return self._frame

    def stop(self) -> None:
        self._running = False


def make_handler(broadcaster: MjpegBroadcaster):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path not in ("/cam.mjpg", "/"):
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Connection", "close")
            self.end_headers()
            try:
                while True:
                    frame = broadcaster.latest()
                    if frame:
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n\r\n")
                        self.wfile.write(frame)
                        self.wfile.write(b"\r\n")
                        self.wfile.flush()
                    time.sleep(1 / 15)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def log_message(self, _fmt: str, *_args) -> None:
            return

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pipe", default="/tmp/nameface-phone.pipe")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    broadcaster = MjpegBroadcaster(args.pipe)
    server = ReuseHTTPServer(("127.0.0.1", args.port), make_handler(broadcaster))
    print(f"MJPEG: http://127.0.0.1:{args.port}/cam.mjpg", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        broadcaster.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
