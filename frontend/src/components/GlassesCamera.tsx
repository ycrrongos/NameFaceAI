import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceMatch } from "../api/client";
import { isRokidWebView } from "../config/runtime";
import { useI18n } from "../i18n/I18nProvider";
import {
  getCameraErrorRef,
  isSecureEnoughForCamera,
  mapFaceBboxToOverlay,
  openCameraStream,
  type CameraErrorRef,
} from "../utils/cameraUtils";

interface GlassesCameraProps {
  onFrame?: (jpeg: ArrayBuffer) => void;
  onFrameSize?: (width: number, height: number) => void;
  faces?: FaceMatch[];
  fps?: number;
  captureMaxWidth?: number;
  captureQuality?: number;
  hideVideo?: boolean;
  hideOverlay?: boolean;
  autoStart?: boolean;
  nativeCapture?: boolean;
  sourceFrameSize?: { width: number; height: number };
}

export function GlassesCamera({
  onFrame,
  onFrameSize,
  faces = [],
  fps = 8,
  captureMaxWidth = 640,
  captureQuality = 0.6,
  hideVideo = false,
  hideOverlay = false,
  autoStart = false,
  nativeCapture = false,
  sourceFrameSize,
}: GlassesCameraProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<HTMLCanvasElement>(null);
  const captureSizeRef = useRef({ width: 0, height: 0 });
  const encodingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const mountGenRef = useRef(0);
  const startInFlightRef = useRef(false);
  const [cameraErrorRef, setCameraErrorRef] = useState<CameraErrorRef | null>(null);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(false);

  const cameraError = cameraErrorRef ? t(cameraErrorRef.key, cameraErrorRef.params) : null;
  const { hostname, port } = window.location;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  const playVideo = useCallback(async (video: HTMLVideoElement) => {
    video.playsInline = true;
    video.muted = true;
    if (video.readyState < 1) {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => {
          video.removeEventListener("loadedmetadata", onReady);
          video.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          video.removeEventListener("loadedmetadata", onReady);
          video.removeEventListener("error", onError);
          reject(new Error("video load failed"));
        };
        video.addEventListener("loadedmetadata", onReady, { once: true });
        video.addEventListener("error", onError, { once: true });
      });
    }
    try {
      await video.play();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        await new Promise((r) => window.setTimeout(r, 50));
        await video.play();
        return;
      }
      throw err;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (startInFlightRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      const insecure = typeof window !== "undefined" && window.location.protocol === "http:";
      setCameraErrorRef({
        key: insecure && isRokidWebView() ? "glasses.cameraHttpWait" : "glasses.cameraUnsupported",
      });
      return;
    }
    if (!isSecureEnoughForCamera()) {
      setCameraErrorRef({ key: "glasses.cameraOpenHttps", params: { hostname, port } });
      return;
    }

    const gen = mountGenRef.current;
    startInFlightRef.current = true;
    setStarting(true);
    setCameraErrorRef(null);
    stopStream();
    try {
      const stream = await openCameraStream();
      if (gen !== mountGenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video || gen !== mountGenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await playVideo(video);
      if (gen !== mountGenRef.current) return;
      setActive(true);
    } catch (err) {
      if (gen !== mountGenRef.current) return;
      stopStream();
      setCameraErrorRef(getCameraErrorRef(err));
    } finally {
      startInFlightRef.current = false;
      if (gen === mountGenRef.current) setStarting(false);
    }
  }, [hostname, port, stopStream, playVideo]);

  useEffect(() => {
    mountGenRef.current += 1;
    return () => {
      mountGenRef.current += 1;
      startInFlightRef.current = false;
      stopStream();
    };
  }, [stopStream]);

  useEffect(() => {
    if (nativeCapture) {
      setActive(true);
      setCameraErrorRef(null);
      return;
    }
    if (autoStart && !active && !starting && !cameraErrorRef && !startInFlightRef.current) {
      void startCamera();
    }
  }, [nativeCapture, autoStart, active, starting, cameraErrorRef, startCamera]);

  useEffect(() => {
    if (!active || !onFrame || nativeCapture) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      const capture = captureRef.current;
      if (!video || !capture || video.readyState < 2 || encodingRef.current) return;

      let drawW = video.videoWidth;
      let drawH = video.videoHeight;
      if (captureMaxWidth > 0 && drawW > captureMaxWidth) {
        const scale = captureMaxWidth / drawW;
        drawW = captureMaxWidth;
        drawH = Math.round(drawH * scale);
      }
      capture.width = drawW;
      capture.height = drawH;
      const ctx = capture.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, drawW, drawH);
      captureSizeRef.current = { width: drawW, height: drawH };
      onFrameSize?.(drawW, drawH);
      encodingRef.current = true;
      capture.toBlob(
        (blob) => {
          encodingRef.current = false;
          if (blob) blob.arrayBuffer().then(onFrame);
        },
        "image/jpeg",
        captureQuality,
      );
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [active, onFrame, onFrameSize, fps, captureMaxWidth, captureQuality, nativeCapture]);

  useEffect(() => {
    if (sourceFrameSize && sourceFrameSize.width > 0 && sourceFrameSize.height > 0) {
      captureSizeRef.current = sourceFrameSize;
    }
  }, [sourceFrameSize?.width, sourceFrameSize?.height]);

  useEffect(() => {
    if (!active || hideOverlay) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!video || !canvas || !container) return;

    let raf: number;
    const draw = () => {
      const srcW =
        captureSizeRef.current.width || sourceFrameSize?.width || video.videoWidth;
      const srcH =
        captureSizeRef.current.height || sourceFrameSize?.height || video.videoHeight;
      const canDraw =
        (nativeCapture || hideVideo || video.readyState >= 2) && srcW > 0 && srcH > 0;

      if (canDraw) {
        const rect = hideVideo
          ? container.getBoundingClientRect()
          : video.getBoundingClientRect();
        const w = Math.round(rect.width) || container.clientWidth;
        const h = Math.round(rect.height) || container.clientHeight;
        if (w >= 1 && h >= 1) {
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const overlayFit = hideVideo ? "fill" : "cover";

            for (const face of faces) {
              const { left, top, width, height } = mapFaceBboxToOverlay(
                face.bbox,
                srcW,
                srcH,
                canvas.width,
                canvas.height,
                { objectFit: overlayFit, mirrored: !hideVideo },
              );
              const known = face.name !== "未知";

              ctx.strokeStyle = known ? "#39FF14" : "#FF4444";
              ctx.lineWidth = 4;
              ctx.strokeRect(left, top, width, height);

              const label = known ? face.name : "?";
              ctx.font = "700 28px 'Noto Sans SC', sans-serif";
              const tw = ctx.measureText(label).width + 24;
              ctx.fillStyle = known ? "rgba(57,255,20,0.85)" : "rgba(255,68,68,0.85)";
              ctx.fillRect(left, top - 40, tw, 36);
              ctx.fillStyle = known ? "#000" : "#fff";
              ctx.fillText(label, left + 12, top - 12);
            }
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [faces, active, hideVideo, hideOverlay, nativeCapture, sourceFrameSize?.width, sourceFrameSize?.height]);

  return (
    <div ref={containerRef} className={`glasses-camera${hideVideo ? " glasses-camera--boxes-only" : ""}`}>
      {!active && !nativeCapture && (
        <div className="glasses-camera__start">
          {!isSecureEnoughForCamera() && (
            <p className="glasses-camera__hint">
              {t("glasses.cameraUseHttps", { hostname, port })}
            </p>
          )}
          {cameraError && <p className="glasses-camera__hint glasses-camera__hint--error">{cameraError}</p>}
          <button type="button" className="glasses-camera__start-btn" disabled={starting} onClick={() => void startCamera()}>
            {starting ? t("glasses.cameraStarting") : t("glasses.cameraStart")}
          </button>
        </div>
      )}
      <video
        ref={videoRef}
        className={`glasses-camera__video${hideVideo ? " glasses-camera__video--hidden" : ""}`}
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="glasses-camera__overlay" />
      <canvas ref={captureRef} hidden />
    </div>
  );
}

function faceCenterDistance(face: FaceMatch, frameW: number, frameH: number): number {
  const [x1, y1, x2, y2] = face.bbox;
  const fx = (x1 + x2) / 2;
  const fy = (y1 + y2) / 2;
  const cx = frameW / 2;
  const cy = frameH / 2;
  return (fx - cx) ** 2 + (fy - cy) ** 2;
}

/** 选取 bbox 中心最接近画面中心的人脸 */
export function pickCenterFace(
  faces: FaceMatch[],
  frameW: number,
  frameH: number,
): FaceMatch | null {
  if (faces.length === 0) return null;
  if (frameW <= 0 || frameH <= 0) return faces[0] ?? null;

  return faces.reduce<FaceMatch | null>((best, face) => {
    if (!best) return face;
    const dist = faceCenterDistance(face, frameW, frameH);
    const bestDist = faceCenterDistance(best, frameW, frameH);
    if (dist < bestDist) return face;
    if (dist === bestDist && face.confidence > best.confidence) return face;
    return best;
  }, null);
}

/** @deprecated use pickCenterFace */
export function pickPrimaryFace(faces: FaceMatch[]): FaceMatch | null {
  const known = faces.filter((f) => f.name !== "未知" && f.student_id != null);
  if (known.length === 0) return faces[0] ?? null;
  return known.reduce((best, f) => (f.confidence > best.confidence ? f : best));
}
