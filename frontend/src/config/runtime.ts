/** 眼镜端运行时配置：?backend=192.168.1.10:8000 */
export function getBackendParam(): string | null {
  return new URLSearchParams(window.location.search).get("backend");
}

export function getApiBase(): string {
  const backend = getBackendParam();
  if (backend && typeof window !== "undefined" && isGlassesRoute()) {
    const port = window.location.port;
    if (port === "5173" || port === "5174") {
      return "";
    }
    const host = backend.replace(/^https?:\/\//, "");
    return `http://${host}`;
  }
  if (backend) {
    const host = backend.replace(/^https?:\/\//, "");
    return `http://${host}`;
  }
  return import.meta.env.VITE_API_BASE ?? "";
}

export function isRokidWebView(): boolean {
  return typeof navigator !== "undefined" && /NameFaceRokid/i.test(navigator.userAgent);
}

export function getWsRecognizeUrl(): string {
  const backend = getBackendParam();
  const backendHost = backend?.replace(/^https?:\/\//, "") ?? null;

  if (isRokidWebView() && backendHost) {
    return `ws://${backendHost}/ws/recognize`;
  }

  const explicit = new URLSearchParams(window.location.search).get("ws");
  if (explicit) {
    if (
      backendHost &&
      (explicit.includes(":5173/") || explicit.includes(":8000/") || explicit.startsWith("wss://"))
    ) {
      return `ws://${backendHost}/ws/recognize`;
    }
    return explicit;
  }

  if (backendHost) {
    const secure = window.location.protocol === "https:";
    return `${secure ? "wss" : "ws"}://${backendHost}/ws/recognize`;
  }

  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/recognize`;
}

export function getWsPreviewUrl(): string {
  const backend = getBackendParam();
  if (backend) {
    const host = backend.replace(/^https?:\/\//, "");
    const secure = window.location.protocol === "https:";
    return `${secure ? "wss" : "ws"}://${host}/ws/preview`;
  }

  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL.replace("/ws/recognize", "/ws/preview");
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/preview`;
}

export function isGlassesRoute(): boolean {
  return window.location.pathname.startsWith("/rokid") || window.location.pathname.startsWith("/glasses");
}

/** ?camera=phone — 使用 USB 手机摄像头 MJPEG 桥（scripts/phone-mjpeg-bridge.sh） */
export function getPhoneCameraStreamUrl(): string | null {
  const mode = new URLSearchParams(window.location.search).get("camera");
  if (mode !== "phone") return null;
  return "/phone-cam/cam.mjpg";
}
