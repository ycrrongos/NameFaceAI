/** 眼镜端运行时配置：?backend=192.168.1.10:8000 */
export function getBackendParam(): string | null {
  return new URLSearchParams(window.location.search).get("backend");
}

export function getApiBase(): string {
  const backend = getBackendParam();
  if (backend && typeof window !== "undefined" && isGlassesRoute()) {
    const port = window.location.port;
    // 眼镜页由 Vite 提供时，API 走同源 /api 代理，避免跨域
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

  // Rokid：页面 HTTPS，WebSocket 直连后端 8000（局域网最短路径，WebView 已允许混合内容）
  if (isRokidWebView() && backendHost) {
    return `ws://${backendHost}/ws/recognize`;
  }

  const explicit = new URLSearchParams(window.location.search).get("ws");
  if (explicit) {
    if (backendHost && (explicit.includes(":5173/") || explicit.includes(":8000/") || explicit.startsWith("wss://"))) {
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
