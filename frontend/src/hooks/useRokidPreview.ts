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

export function useRokidPreview(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [preview, setPreview] = useState<PreviewFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const ws = new WebSocket(getWsPreviewUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setError("预览 WebSocket 连接失败");
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type !== "frame" || !data.frame) return;

      const now = performance.now();
      const frameIntervalMs =
        lastFrameAtRef.current != null ? now - lastFrameAtRef.current : null;
      lastFrameAtRef.current = now;

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

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [enabled]);

  const resetStats = useCallback(() => {
    setFrameCount(0);
    lastFrameAtRef.current = null;
  }, []);

  return { connected, preview, error, frameCount, resetStats };
}
