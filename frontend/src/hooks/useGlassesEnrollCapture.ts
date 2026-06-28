import { useCallback, useRef } from "react";
import { isRokidNativeCamera } from "../config/runtime";

declare global {
  interface Window {
    NameFaceRokidNative?: {
      isNativeCamera: () => boolean;
      onPageReady: () => void;
      setEnrollMode: (enabled: boolean) => void;
      captureEnrollmentPhoto: () => string;
    };
  }
}

function captureFromVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement, quality = 0.85): string | null {
  if (video.readyState < 2 || video.videoWidth <= 0) return null;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
}

export function useGlassesEnrollCapture(videoSelector = ".glasses-enroll__camera video") {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const native = isRokidNativeCamera();

  const capturePhoto = useCallback((): string | null => {
    if (native) {
      const dataUrl = window.NameFaceRokidNative?.captureEnrollmentPhoto?.() ?? "";
      return dataUrl.length > 0 ? dataUrl : null;
    }
    const video = document.querySelector(videoSelector) as HTMLVideoElement | null;
    if (!video) return null;
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    return captureFromVideo(video, canvasRef.current);
  }, [native, videoSelector]);

  const setEnrollMode = useCallback(
    (enabled: boolean) => {
      if (native) {
        window.NameFaceRokidNative?.setEnrollMode(enabled);
      }
    },
    [native],
  );

  return { capturePhoto, setEnrollMode, nativeCamera: native };
}
