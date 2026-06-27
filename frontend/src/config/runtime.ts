/** 眼镜端运行时配置：?backend=192.168.1.10:8000 */
export function getBackendParam(): string | null {
  return new URLSearchParams(window.location.search).get("backend");
}

export function getApiBase(): string {
  const backend = getBackendParam();
  if (backend) {
    const host = backend.replace(/^https?:\/\//, "");
    return `http://${host}`;
  }
  return import.meta.env.VITE_API_BASE ?? "";
}

export function getWsRecognizeUrl(): string {
  const explicit = new URLSearchParams(window.location.search).get("ws");
  if (explicit) return explicit;

  const backend = getBackendParam();
  if (backend) {
    const host = backend.replace(/^https?:\/\//, "");
    const secure = window.location.protocol === "https:";
    return `${secure ? "wss" : "ws"}://${host}/ws/recognize`;
  }

  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/recognize`;
}

export function isGlassesRoute(): boolean {
  return window.location.pathname.startsWith("/rokid") || window.location.pathname.startsWith("/glasses");
}
