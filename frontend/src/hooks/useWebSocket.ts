import { useCallback, useEffect, useRef, useState } from "react";
import type { AttendanceCheckIn, FaceMatch } from "../api/client";
import { wsRecognizeUrl } from "../api/client";
import { isRokidWebView } from "../config/runtime";

interface RecognizeMessage {
  faces?: FaceMatch[];
  inference_ms?: number;
  attendance?: AttendanceCheckIn[];
  error?: string;
}

interface UseRecognizeWebSocketOptions {
  lowLatency?: boolean;
}

const RECONNECT_MS = 2000;

export function useRecognizeWebSocket(enabled: boolean, options: UseRecognizeWebSocketOptions = {}) {
  const lowLatency = options.lowLatency ?? isRokidWebView();
  const wsRef = useRef<WebSocket | null>(null);
  const busyRef = useRef(false);
  const latestFrameRef = useRef<ArrayBuffer | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [faces, setFaces] = useState<FaceMatch[]>([]);
  const [attendance, setAttendance] = useState<AttendanceCheckIn[]>([]);
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flushLatest = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || busyRef.current) return;
    const frame = latestFrameRef.current;
    if (!frame) return;
    latestFrameRef.current = null;
    busyRef.current = true;
    ws.send(frame);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let closed = false;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(wsRecognizeUrl());
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        flushLatest();
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        busyRef.current = false;
        if (!closed) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
        }
      };
      ws.onerror = () => {
        const hint = isRokidWebView() ? "（请确认电脑后端 8000 已启动）" : "";
        setError(`WebSocket 连接失败${hint}`);
      };
      ws.onmessage = (event) => {
        const data: RecognizeMessage = JSON.parse(
          typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data),
        );
        busyRef.current = false;
        if (data.error) {
          setError(data.error);
          return;
        }
        setError(null);
        if (data.faces) setFaces(data.faces);
        if (data.attendance) setAttendance(data.attendance);
        if (data.inference_ms != null) setInferenceMs(data.inference_ms);
        if (lowLatency) flushLatest();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      latestFrameRef.current = null;
      busyRef.current = false;
    };
  }, [enabled, lowLatency, flushLatest]);

  const sendFrame = useCallback(
    (jpeg: ArrayBuffer) => {
      if (lowLatency) {
        latestFrameRef.current = jpeg;
        flushLatest();
        return;
      }
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || busyRef.current) return;
      busyRef.current = true;
      ws.send(jpeg);
    },
    [lowLatency, flushLatest],
  );

  return { connected, faces, attendance, inferenceMs, error, sendFrame };
}
