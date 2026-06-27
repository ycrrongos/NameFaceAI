export function getCameraErrorMessage(err: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    const { hostname, port } = window.location;
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
    if (!isLocal) {
      return `非安全连接无法使用摄像头。请改用 https://${hostname}:${port} 或 http://localhost:${port}`;
    }
  }

  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return "摄像头权限被拒绝。请点击「开启摄像头」并在浏览器中允许访问";
      case "NotFoundError":
        return "未检测到摄像头设备";
      case "NotReadableError":
        return "摄像头被其他程序占用，请关闭后重试";
      case "OverconstrainedError":
        return "摄像头参数不兼容，正在尝试其他模式…";
      default:
        return err.message || "无法访问摄像头";
    }
  }

  if (err instanceof Error) return err.message;
  return "无法访问摄像头，请检查浏览器权限";
}

type VideoConstraints = MediaTrackConstraints | boolean;

/** 依次尝试多种约束，兼容笔记本/Rokid/外接摄像头 */
export async function openCameraStream(deviceId?: string): Promise<MediaStream> {
  const attempts: VideoConstraints[] = [];

  if (deviceId) {
    attempts.push({ deviceId: { ideal: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } });
  }
  attempts.push(
    { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { width: { ideal: 1280 }, height: { ideal: 720 } },
    true
  );

  let lastError: unknown;
  for (const video of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export function isSecureEnoughForCamera(): boolean {
  if (typeof window === "undefined") return true;
  if (window.isSecureContext) return true;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}
