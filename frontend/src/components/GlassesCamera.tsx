import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceMatch } from "../api/client";
import { getCameraErrorMessage, isSecureEnoughForCamera, openCameraStream } from "../utils/cameraUtils";

interface GlassesCameraProps {
  onFrame?: (jpeg: ArrayBuffer) => void;
  faces?: FaceMatch[];
  fps?: number;
  captureMaxWidth?: number;
  captureQuality?: number;
}

export function GlassesCamera({
  onFrame,
  faces = [],
  fps = 8,
  captureMaxWidth = 640,
  captureQuality = 0.6,
}: GlassesCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<HTMLCanvasElement>(null);
  const captureSizeRef = useRef({ width: 0, height: 0 });
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("不支持摄像头");
      return;
    }
    if (!isSecureEnoughForCamera()) {
      const { hostname, port } = window.location;
      setCameraError(`请用 https://${hostname}:${port}/rokid 打开`);
      return;
    }
    setStarting(true);
    setCameraError(null);
    stopStream();
    try {
      const stream = await openCameraStream();
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();
      setActive(true);
    } catch (err) {
      stopStream();
      setCameraError(getCameraErrorMessage(err));
    } finally {
      setStarting(false);
    }
  }, [stopStream]);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  useEffect(() => {
    if (!active || !onFrame) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      const capture = captureRef.current;
      if (!video || !capture || video.readyState < 2) return;

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
      capture.toBlob(
        (blob) => {
          if (blob) blob.arrayBuffer().then(onFrame);
        },
        "image/jpeg",
        captureQuality
      );
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [active, onFrame, fps, captureMaxWidth, captureQuality]);

  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let raf: number;
    const draw = () => {
      if (video.readyState >= 2) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const srcW = captureSizeRef.current.width || video.videoWidth;
          const srcH = captureSizeRef.current.height || video.videoHeight;
          const scaleX = canvas.width / srcW;
          const scaleY = canvas.height / srcH;

          for (const face of faces) {
            const [x1, y1, x2, y2] = face.bbox;
            const left = canvas.width - x2 * scaleX;
            const top = y1 * scaleY;
            const width = (x2 - x1) * scaleX;
            const height = (y2 - y1) * scaleY;
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
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [faces, active]);

  return (
    <div className="glasses-camera">
      {!active && (
        <div className="glasses-camera__start">
          {!isSecureEnoughForCamera() && (
            <p className="glasses-camera__hint">
              请使用 https://{window.location.hostname}:{window.location.port}/rokid
            </p>
          )}
          {cameraError && <p className="glasses-camera__hint glasses-camera__hint--error">{cameraError}</p>}
          <button type="button" className="glasses-camera__start-btn" disabled={starting} onClick={() => void startCamera()}>
            {starting ? "开启中…" : "开启摄像头"}
          </button>
        </div>
      )}
      <video ref={videoRef} className="glasses-camera__video" playsInline muted />
      <canvas ref={canvasRef} className="glasses-camera__overlay" />
      <canvas ref={captureRef} hidden />
    </div>
  );
}

export function pickPrimaryFace(faces: FaceMatch[]): FaceMatch | null {
  const known = faces.filter((f) => f.name !== "未知" && f.student_id != null);
  if (known.length === 0) return faces[0] ?? null;
  return known.reduce((best, f) => (f.confidence > best.confidence ? f : best));
}
