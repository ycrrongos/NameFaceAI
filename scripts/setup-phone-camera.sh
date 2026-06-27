#!/usr/bin/env bash
# 将安卓手机摄像头作为电脑虚拟摄像头，供浏览器 / NameFaceAI 使用
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}▸${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
fail()  { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

need_sudo() {
  if ! sudo -n true 2>/dev/null; then
    warn "接下来需要输入 sudo 密码以加载内核模块"
  fi
}

load_v4l2loopback() {
  need_sudo
  if lsmod | grep -q '^v4l2loopback'; then
    info "v4l2loopback 已加载"
  else
    info "加载 v4l2loopback（exclusive_caps=1，兼容 Chrome）…"
    sudo modprobe v4l2loopback devices=1 exclusive_caps=1 card_label="Phone Camera"
  fi

  local dev
  dev="$(ls /dev/video* 2>/dev/null | head -1 || true)"
  if [ -z "$dev" ]; then
    fail "未找到 /dev/video*。请确认已安装 v4l2loopback-dkms：sudo pacman -S v4l2loopback-dkms linux-headers"
  fi
  info "虚拟摄像头设备：$dev"
  V4L2_DEV="$dev"
}

persist_v4l2loopback() {
  need_sudo
  sudo tee /etc/modules-load.d/v4l2loopback.conf >/dev/null <<'EOF'
v4l2loopback
EOF
  sudo tee /etc/modprobe.d/v4l2loopback.conf >/dev/null <<'EOF'
options v4l2loopback devices=1 exclusive_caps=1 card_label="Phone Camera"
EOF
  info "已写入开机自动加载配置（/etc/modules-load.d + /etc/modprobe.d）"
}

show_namefaceai_hint() {
  echo ""
  info "在 NameFaceAI 中使用："
  echo "  1. 运行 ./scripts/dev.sh 启动项目"
  echo "  2. 浏览器打开 http://localhost:5173 →「实时识别」"
  echo "  3. 点击「开启摄像头」，在「摄像头」下拉框中选择 Phone Camera / DroidCam"
  echo "  4. 若画面镜像不对，可切换不同摄像头条目"
  echo ""
}

wifi_ip() {
  local ip
  for pat in 'wlp*' 'wlan*' 'enp*'; do
    ip="$(ip -4 addr show $pat 2>/dev/null | awk '/inet / {print $2; exit}' | cut -d/ -f1)"
    [ -n "$ip" ] && echo "$ip" && return 0
  done
  ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}'
}

cmd_droidcam() {
  if ! command -v droidcam >/dev/null && ! command -v droidcam-cli >/dev/null; then
    warn "未安装 DroidCam 客户端"
    echo "  安装：yay -S droidcam   或   paru -S droidcam"
    echo "  手机端：Google Play 搜索「DroidCam」并安装"
    echo ""
    echo "  安装完成后重新运行：$0 droidcam"
    return 1
  fi

  load_v4l2loopback
  local ip
  ip="$(wifi_ip || true)"
  echo ""
  info "DroidCam 连接步骤："
  echo "  1. 手机与电脑连同一 Wi‑Fi（或 USB 调试模式下的 USB）"
  echo "  2. 手机打开 DroidCam App"
  if [ -n "$ip" ]; then
    echo "  3. 电脑 IP：${ip}（Wi‑Fi 模式时在 App 里填此地址）"
  fi
  echo "  4. 下面将启动 DroidCam 客户端，按提示连接"
  echo ""
  show_namefaceai_hint

  if command -v droidcam >/dev/null; then
    exec droidcam
  else
    warn "请手动运行：droidcam-cli ${ip:-<电脑IP>} 4747"
  fi
}

cmd_scrcpy() {
  command -v adb >/dev/null || fail "请先安装：sudo pacman -S android-tools"
  command -v scrcpy >/dev/null || fail "请先安装：sudo pacman -S scrcpy"

  load_v4l2loopback

  info "检查 USB 连接的安卓设备…"
  adb start-server >/dev/null 2>&1 || true
  if ! adb devices | awk 'NR>1 && $2=="device"{found=1} END{exit !found}'; then
    echo ""
    warn "未检测到已授权的设备。请先在手机上："
    echo "  设置 → 开发者选项 → 开启「USB 调试」"
    echo "  用数据线连接电脑，弹出授权框时点「允许」"
    echo "  然后执行：adb devices"
    echo ""
    fail "没有可用的 adb 设备"
  fi

  info "可用摄像头："
  scrcpy --list-cameras 2>/dev/null || warn "无法列出摄像头（需 Android 12+）"

  echo ""
  info "启动 scrcpy 摄像头 → ${V4L2_DEV}（保持此窗口运行）"
  warn "需要 Android 12 及以上；按 Ctrl+C 停止"
  show_namefaceai_hint

  local facing="${SCRCPY_CAMERA_FACING:-front}"
  info "使用 ${facing} 摄像头（本机后置若失败可改：SCRCPY_CAMERA_FACING=front $0 scrcpy）"

  exec scrcpy \
    --video-source=camera \
    --camera-facing="${facing}" \
    --camera-size=1280x720 \
    --v4l2-sink="${V4L2_DEV}" \
    --no-playback \
    --no-control
}

cmd_status() {
  echo "=== 虚拟摄像头 ==="
  if lsmod | grep -q v4l2loopback; then
    echo "  v4l2loopback: 已加载"
  else
    echo "  v4l2loopback: 未加载"
  fi
  if ls /dev/video* >/dev/null 2>&1; then
    v4l2-ctl --list-devices 2>/dev/null || ls -l /dev/video*
  else
    echo "  无 /dev/video* 设备"
  fi
  echo ""
  echo "=== 工具 ==="
  for c in droidcam droidcam-cli adb scrcpy; do
    if command -v "$c" >/dev/null; then echo "  $c: $(command -v "$c")"; else echo "  $c: 未安装"; fi
  done
  echo ""
  echo "=== adb 设备 ==="
  adb devices 2>/dev/null || echo "  adb 不可用"
  local ip
  ip="$(wifi_ip || true)"
  [ -n "$ip" ] && echo "" && echo "=== 本机 Wi‑Fi IP ===" && echo "  $ip"
}

usage() {
  cat <<EOF
用法: $0 <命令>

命令:
  status     查看当前摄像头 / 工具状态
  load       仅加载 v4l2loopback 虚拟摄像头
  persist    配置开机自动加载 v4l2loopback
  droidcam   Wi‑Fi / USB — 推荐，需安装 DroidCam（yay -S droidcam）
  scrcpy     USB + v4l2 — 需 sudo 加载虚拟摄像头（Android 12+）
  usb        USB + MJPEG — 无需 sudo，配合 ?camera=phone 使用
  usb-stop   停止 USB 摄像头桥接

推荐流程（USB，无需 sudo）:
  $0 usb
  浏览器打开 http://localhost:5173/?camera=phone
  若端口占用：$0 usb-stop && $0 usb
EOF
}

cmd_usb() {
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  exec "$ROOT/scripts/phone-mjpeg-bridge.sh" start
}

cmd_usb_stop() {
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  exec "$ROOT/scripts/phone-mjpeg-bridge.sh" stop
}

main() {
  case "${1:-}" in
    status)   cmd_status ;;
    load)     load_v4l2loopback; show_namefaceai_hint ;;
    persist)  persist_v4l2loopback ;;
    droidcam) cmd_droidcam ;;
    scrcpy)   cmd_scrcpy ;;
    usb)      cmd_usb ;;
    usb-stop) cmd_usb_stop ;;
    -h|--help|help) usage ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
