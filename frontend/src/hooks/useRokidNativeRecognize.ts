import { useCallback, useEffect, useRef, useState } from "react";
import type { AttendanceCheckIn, FaceMatch } from "../api/client";
import { isRokidNativeCamera } from "../config/runtime";

interface RecognizeMessage {
  faces?: FaceMatch[];
  inference_ms?: number;
  attendance?: AttendanceCheckIn[];
  error?: string;
}

const FACE_HOLD_MS = 1500;

declare global {
  interface Window {
    NameFaceRokid?: {
      nativeCamera?: boolean;
      onRecognizeResult?: (data: RecognizeMessage) => void;
      onConnectionChange?: (connected: boolean) => void;
      onFrameSize?: (width: number, height: number) => void;
      onError?: (message: string) => void;
    };
    NameFaceRokidNative?: {
      isNativeCamera: () => boolean;
      onPageReady: () => void;
    };
  }
}

export function useRokidNativeRecognize(enabled: boolean) {
  const [connected, setConnected] = useState(false);
  const [faces, setFaces] = useState<FaceMatch[]>([]);
  const [attendance, setAttendance] = useState<AttendanceCheckIn[]>([]);
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const lastFacesAtRef = useRef(0);

  const applyFaces = useCallback((next: FaceMatch[]) => {
    if (next.length > 0) {
      lastFacesAtRef.current = Date.now();
      setFaces(next);
      return;
    }
    if (Date.now() - lastFacesAtRef.current >= FACE_HOLD_MS) {
      setFaces([]);
    }
  }, []);

  const sendFrame = useCallback((_jpeg: ArrayBuffer) => {}, []);

  useEffect(() => {
    if (!enabled || !isRokidNativeCamera()) return;

    const bridge = window.NameFaceRokid ?? (window.NameFaceRokid = { nativeCamera: true });

    bridge.onRecognizeResult = (data) => {
      if (data.error) {
        setError(data.error);
        return;
      }
      setError(null);
      if (Array.isArray(data.faces)) applyFaces(data.faces);
      if (data.attendance) setAttendance(data.attendance);
      if (data.inference_ms != null) setInferenceMs(data.inference_ms);
    };
    bridge.onConnectionChange = (value) => setConnected(value);
    bridge.onFrameSize = (width, height) => setFrameSize({ width, height });
    bridge.onError = (message) => {
      if (message) setError(message);
    };

    return () => {
      bridge.onRecognizeResult = undefined;
      bridge.onConnectionChange = undefined;
      bridge.onFrameSize = undefined;
      bridge.onError = undefined;
      lastFacesAtRef.current = 0;
    };
  }, [enabled, applyFaces]);

  return { connected, faces, attendance, inferenceMs, error, sendFrame, frameSize };
}
