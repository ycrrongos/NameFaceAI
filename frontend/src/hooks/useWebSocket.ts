import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceMatch } from "../api/client";
import { wsRecognizeUrl } from "../api/client";
import { isRokidWebView } from "../config/runtime";

interface RecognizeMessage {
  faces?: FaceMatch[];
  inference_ms?: number;
  error?: string;
}

interface UseRecognizeWebSocketOptions {
  /** 只保留最新帧、响应到达后立即发下一帧，降低排队延迟 */
  lowLatency?: boolean;
}

const RECONNECT_MS = 2000;

export function useRecognizeWebSocket(enabled: boolean, options: UseRecognizeWebSocketOptions = {}) {
  const lowLatency = options.lowLatency ?? true;
  const wsRef = useRef<WebSocket | null>(null);
  const busyRef = useRef(false);
  const busyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFrameRef = useRef<ArrayBuffer | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [faces, setFaces] = useState<FaceMatch[]>([]);
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flushLatest = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || busyRef.current) return;
    const frame = latestFrameRef.current;
    if (!frame) return;
    latestFrameRef.current = null;
    busyRef.current = true;
    if (busyTimerRef.current) clearTimeout(busyTimerRef.current);
    busyTimerRef.current = setTimeout(() => {
      busyRef.current = false;
      flushLatest();
    }, 8000);
    ws.send(frame);
  }, []);

  const releaseBusy = useCallback(() => {
    if (busyTimerRef.current) clearTimeout(busyTimerRef.current);
    busyTimerRef.current = null;
    busyRef.current = false;
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
        releaseBusy();
        if (!closed) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
        }
      };
      ws.onerror = () => {
        const hint = isRokidWebView() ? "（请确认电脑后端 8000 已启动）" : "";
        setError(`WebSocket 连接失败${hint}`);
      };
      ws.onmessage = (event) => {
        try {
          const data: RecognizeMessage = JSON.parse(
            typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data),
          );
          if (data.error) {
            setError(data.error);
            return;
          }
          setError(null);
          if (data.faces != null) setFaces(data.faces);
          if (data.inference_ms != null) setInferenceMs(data.inference_ms);
        } catch {
          setError("识别响应解析失败");
        } finally {
          releaseBusy();
          if (lowLatency) flushLatest();
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      latestFrameRef.current = null;
      releaseBusy();
    };
  }, [enabled, lowLatency, flushLatest, releaseBusy]);

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
      if (busyTimerRef.current) clearTimeout(busyTimerRef.current);
      busyTimerRef.current = setTimeout(() => {
        busyRef.current = false;
      }, 8000);
      ws.send(jpeg);
    },
    [lowLatency, flushLatest],
  );

  return { connected, faces, inferenceMs, error, sendFrame };
}
