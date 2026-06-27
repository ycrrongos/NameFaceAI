import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceMatch } from "../api/client";
import { WS_RECOGNIZE_URL } from "../api/client";

interface RecognizeMessage {
  faces?: FaceMatch[];
  inference_ms?: number;
  error?: string;
}

export function useRecognizeWebSocket(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [faces, setFaces] = useState<FaceMatch[]>([]);
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const ws = new WebSocket(WS_RECOGNIZE_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setError("WebSocket 连接失败");
    ws.onmessage = (event) => {
      const data: RecognizeMessage = JSON.parse(event.data);
      if (data.error) {
        setError(data.error);
        return;
      }
      if (data.faces) setFaces(data.faces);
      if (data.inference_ms != null) setInferenceMs(data.inference_ms);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [enabled]);

  const sendFrame = useCallback((frameBase64: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ frame: frameBase64 }));
  }, []);

  return { connected, faces, inferenceMs, error, sendFrame };
}
