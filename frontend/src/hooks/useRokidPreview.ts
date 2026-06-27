import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceMatch } from "../api/client";
import { getWsPreviewUrl } from "../config/runtime";

export interface PreviewFrame {
  imageUrl: string;
  faces: FaceMatch[];
  inferenceMs: number;
  totalMs: number;
  width: number;
  height: number;
  frameIntervalMs: number | null;
  receivedAt: number;
}

const RECONNECT_MS = 2000;
const STALE_MS = 5_000;

export function useRokidPreview(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [preview, setPreview] = useState<PreviewFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let closed = false;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(getWsPreviewUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!closed) {
          reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
        }
      };
      ws.onerror = () => setError("预览 WebSocket 连接失败");
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type !== "frame" || !data.frame) return;

        const now = performance.now();
        const frameIntervalMs =
          lastFrameAtRef.current != null ? now - lastFrameAtRef.current : null;
        lastFrameAtRef.current = now;

        setStale(false);
        setPreview({
          imageUrl: `data:image/jpeg;base64,${data.frame}`,
          faces: data.faces ?? [],
          inferenceMs: data.inference_ms ?? 0,
          totalMs: data.total_ms ?? 0,
          width: data.width ?? 0,
          height: data.height ?? 0,
          frameIntervalMs,
          receivedAt: now,
        });
        setFrameCount((n) => n + 1);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !connected) return;
    const timer = window.setInterval(() => {
      const last = lastFrameAtRef.current;
      if (last == null) {
        setStale(true);
        return;
      }
      setStale(performance.now() - last > STALE_MS);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [enabled, connected]);

  const resetStats = useCallback(() => {
    setFrameCount(0);
    lastFrameAtRef.current = null;
    setStale(false);
  }, []);

  return { connected, preview, error, frameCount, stale, resetStats };
}
