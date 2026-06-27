import { useCallback, useEffect, useRef, useState } from "react";
import type { AttendanceCheckIn, FaceMatch } from "../api/client";
import { wsRecognizeUrl } from "../api/client";
import { isRokidWebView } from "../config/runtime";

interface RecognizeMessage {
  type?: string;
  faces?: FaceMatch[];
  inference_ms?: number;
  attendance?: AttendanceCheckIn[];
  error?: string;
  frame_width?: number | null;
  frame_height?: number | null;
}

interface UseRecognizeWebSocketOptions {
  lowLatency?: boolean;
}

const RECONNECT_MS = 2000;
const FACE_HOLD_MS = 1500;
const BUSY_TIMEOUT_MS = 8000;
const STALE_TIMEOUT_MS = 10000;
const PING_INTERVAL_MS = 4000;

export function useRecognizeWebSocket(enabled: boolean, _options: UseRecognizeWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const busyRef = useRef(false);
  const latestFrameRef = useRef<ArrayBuffer | null>(null);
  const lastFacesAtRef = useRef(-1);
  const lastMessageAtRef = useRef(0);
  const busyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [faces, setFaces] = useState<FaceMatch[]>([]);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [attendance, setAttendance] = useState<AttendanceCheckIn[]>([]);
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearBusyTimer = () => {
    if (busyTimerRef.current) {
      clearTimeout(busyTimerRef.current);
      busyTimerRef.current = null;
    }
  };

  const releaseBusy = () => {
    busyRef.current = false;
    clearBusyTimer();
  };

  const applyFaces = (next: FaceMatch[]) => {
    if (next.length > 0) {
      lastFacesAtRef.current = Date.now();
      setFaces(next);
      return;
    }
    if (lastFacesAtRef.current < 0) return;
    if (Date.now() - lastFacesAtRef.current >= FACE_HOLD_MS) {
      setFaces([]);
    }
  };

  const trySendFrameRef = useRef<() => void>(() => {});

  trySendFrameRef.current = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || busyRef.current) return;

    const frame = latestFrameRef.current;
    if (!frame) return;

    latestFrameRef.current = null;
    busyRef.current = true;
    clearBusyTimer();
    busyTimerRef.current = setTimeout(() => {
      busyRef.current = false;
      trySendFrameRef.current();
    }, BUSY_TIMEOUT_MS);

    try {
      ws.send(frame);
    } catch {
      releaseBusy();
      latestFrameRef.current = frame;
    }
  };

  const forceReconnect = () => {
    const ws = wsRef.current;
    if (!ws) return;
    releaseBusy();
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  };

  const handleMessage = (event: MessageEvent) => {
    lastMessageAtRef.current = Date.now();

    let data: RecognizeMessage;
    try {
      data = JSON.parse(
        typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data),
      );
    } catch {
      setError("识别结果解析失败");
      releaseBusy();
      trySendFrameRef.current();
      return;
    }

    if (data.type === "pong") return;

    try {
      if (data.error) {
        setError(data.error);
        return;
      }
      setError(null);
      if (Array.isArray(data.faces)) applyFaces(data.faces);
      if (data.attendance) setAttendance(data.attendance);
      if (data.inference_ms != null) setInferenceMs(data.inference_ms);
      if (data.frame_width && data.frame_height) {
        setFrameSize({ width: data.frame_width, height: data.frame_height });
      }
    } finally {
      releaseBusy();
      trySendFrameRef.current();
    }
  };

  useEffect(() => {
    if (!enabled) return;

    closedRef.current = false;

    const connect = () => {
      if (closedRef.current) return;

      const ws = new WebSocket(wsRecognizeUrl());
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        lastMessageAtRef.current = Date.now();
        trySendFrameRef.current();
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        releaseBusy();
        if (!closedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_MS);
        }
      };

      ws.onerror = () => {
        const hint = isRokidWebView() ? "（请确认电脑后端 8000 已启动）" : "";
        setError(`WebSocket 连接失败${hint}`);
      };

      ws.onmessage = handleMessage;
    };

    connect();

    pingTimerRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const silentFor = Date.now() - lastMessageAtRef.current;
      if (silentFor > STALE_TIMEOUT_MS) {
        forceReconnect();
        return;
      }

      if (!busyRef.current) {
        try {
          ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          forceReconnect();
        }
      }
    }, PING_INTERVAL_MS);

    return () => {
      closedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      clearBusyTimer();
      wsRef.current?.close();
      wsRef.current = null;
      latestFrameRef.current = null;
      releaseBusy();
      lastFacesAtRef.current = -1;
      lastMessageAtRef.current = 0;
    };
  }, [enabled]);

  const sendFrame = useCallback((jpeg: ArrayBuffer) => {
    latestFrameRef.current = jpeg;
    trySendFrameRef.current();
  }, []);

  return { connected, faces, attendance, inferenceMs, error, sendFrame, frameSize };
}
