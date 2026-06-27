#!/usr/bin/env bash
# USB 安卓摄像头 → 本地 MJPEG（无需 sudo / v4l2loopback）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PHONE_CAM_PORT:-8765}"
PIPE="${PHONE_CAM_PIPE:-/tmp/nameface-phone.pipe}"
FACING="${SCRCPY_CAMERA_FACING:-front}"
SIZE="${SCRCPY_CAMERA_SIZE:-1280x720}"

stop_bridge() {
  echo "▸ 停止旧的摄像头桥接…"
  pkill -9 -f "phone-mjpeg-server.py" 2>/dev/null || true
  pkill -9 -f "scrcpy --video-source=camera" 2>/dev/null || true
  pkill -9 -f "ffmpeg.*nameface-phone.pipe" 2>/dev/null || true
  pkill -9 -f "record=${PIPE}" 2>/dev/null || true
  if command -v fuser >/dev/null; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
  fi
  rm -f "$PIPE"
  sleep 1
}

port_in_use() {
  ss -ltn "sport = :${PORT}" 2>/dev/null | grep -q ":${PORT} "
}

wait_for_scrcpy() {
  local i
  for i in $(seq 1 40); do
    if ! kill -0 "$SCRPID" 2>/dev/null; then
      return 1
    fi
    if grep -qE "Recording started|Using camera" /tmp/nameface-scrcpy.log 2>/dev/null; then
      sleep 1
      return 0
    fi
    sleep 0.5
  done
  # 进程仍在但日志未就绪时，再给一点时间
  if kill -0 "$SCRPID" 2>/dev/null; then
    sleep 2
    return 0
  fi
  return 1
}

cleanup() {
  [ -n "${SCRPID:-}" ] && kill "$SCRPID" 2>/dev/null || true
  [ -n "${SRVPID:-}" ] && kill "$SRVPID" 2>/dev/null || true
  rm -f "$PIPE"
}
trap cleanup EXIT INT TERM

cmd_stop() {
  stop_bridge
  echo "已停止"
}

cmd_start() {
  command -v adb >/dev/null || { echo "缺少 adb：sudo pacman -S android-tools"; exit 1; }
  command -v scrcpy >/dev/null || { echo "缺少 scrcpy：sudo pacman -S scrcpy"; exit 1; }
  command -v ffmpeg >/dev/null || { echo "缺少 ffmpeg：sudo pacman -S ffmpeg"; exit 1; }

  stop_bridge
  if port_in_use; then
    echo "端口 ${PORT} 仍被占用。请执行：$0 stop"
    exit 1
  fi

  adb start-server >/dev/null 2>&1 || true
  if ! adb devices | awk 'NR>1 && $2=="device"{found=1} END{exit !found}'; then
    echo "未检测到已授权的 USB 设备。请开启 USB 调试并连接数据线。"
    adb devices
    exit 1
  fi

  rm -f "$PIPE"
  mkfifo "$PIPE"

  echo "▸ 启动 scrcpy（${FACING} 摄像头 ${SIZE}）…"
  : > /tmp/nameface-scrcpy.log
  scrcpy \
    --video-source=camera \
    --camera-facing="$FACING" \
    --camera-size="$SIZE" \
    --no-playback \
    --no-control \
    --record="$PIPE" \
    --record-format=mkv >>/tmp/nameface-scrcpy.log 2>&1 &
  SCRPID=$!

  if ! wait_for_scrcpy; then
    echo "scrcpy 启动失败，日志："
    cat /tmp/nameface-scrcpy.log
    exit 1
  fi

  echo "▸ 启动 MJPEG 服务 http://127.0.0.1:${PORT}/cam.mjpg"
  python3 "$ROOT/scripts/phone-mjpeg-server.py" --pipe "$PIPE" --port "$PORT" &
  SRVPID=$!
  sleep 1

  if ! kill -0 "$SRVPID" 2>/dev/null; then
    echo "MJPEG 服务启动失败（端口 ${PORT} 可能被占用）。请先执行：$0 stop"
    exit 1
  fi

  echo ""
  echo "NameFaceAI 打开："
  echo "  http://localhost:5173/?camera=phone"
  echo ""
  echo "停止：$0 stop  或 Ctrl+C"
  wait "$SRVPID"
}

case "${1:-start}" in
  start|usb) cmd_start ;;
  stop)      cmd_stop ;;
  restart)   cmd_stop; cmd_start ;;
  *)
    echo "用法: $0 {start|stop|restart}"
    exit 1
    ;;
esac
