import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceMatch } from "../api/client";

interface CameraViewProps {
  onFrame?: (jpeg: ArrayBuffer) => void;
  faces?: FaceMatch[];
  fps?: number;
  captureMaxWidth?: number;
  captureQuality?: number;
  showOverlay?: boolean;
  mirrored?: boolean;
}

export function CameraView({
  onFrame,
  faces = [],
  fps = 12,
  captureMaxWidth = 640,
  captureQuality = 0.65,
  showOverlay = true,
  mirrored = true,
}: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<HTMLCanvasElement>(null);
  const captureSizeRef = useRef({ width: 0, height: 0 });
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const startCamera = useCallback(async (selectedId?: string) => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: selectedId ? { exact: selectedId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
      setDevices(videoDevices);
    } catch {
      setCameraError("无法访问摄像头，请检查浏览器权限");
    }
  }, []);

  useEffect(() => {
    startCamera(deviceId || undefined);
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId, startCamera]);

  useEffect(() => {
    if (!onFrame) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const capture = captureRef.current;
      if (!video || !capture || video.readyState < 2) return;

      capture.width = video.videoWidth;
      capture.height = video.videoHeight;
      const ctx = capture.getContext("2d");
      if (!ctx) return;

      let drawW = capture.width;
      let drawH = capture.height;
      if (captureMaxWidth > 0 && drawW > captureMaxWidth) {
        const scale = captureMaxWidth / drawW;
        drawW = captureMaxWidth;
        drawH = Math.round(drawH * scale);
        capture.width = drawW;
        capture.height = drawH;
      }

      ctx.drawImage(video, 0, 0, drawW, drawH);
      captureSizeRef.current = { width: drawW, height: drawH };
      if (!onFrame) return;
      capture.toBlob(
        (blob) => {
          if (blob) blob.arrayBuffer().then(onFrame);
        },
        "image/jpeg",
        captureQuality,
      );
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [onFrame, fps, captureMaxWidth, captureQuality]);

  useEffect(() => {
    if (!showOverlay) return;
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
            let left = x1 * scaleX;
            const top = y1 * scaleY;
            let width = (x2 - x1) * scaleX;
            const height = (y2 - y1) * scaleY;
            if (mirrored) {
              left = canvas.width - left - width;
            }

            const isKnown = face.name !== "未知";
            ctx.strokeStyle = isKnown ? "#22c55e" : "#ef4444";
            ctx.lineWidth = 3;
            ctx.strokeRect(left, top, width, height);

            const label = `${face.name} (${(face.confidence * 100).toFixed(0)}%)`;
            ctx.font = "bold 20px sans-serif";
            const textWidth = ctx.measureText(label).width + 12;
            ctx.fillStyle = isKnown ? "#22c55e" : "#ef4444";
            ctx.fillRect(left, top - 28, textWidth, 28);
            ctx.fillStyle = "#fff";
            ctx.fillText(label, left + 6, top - 8);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [faces, showOverlay, mirrored]);

  return (
    <div className="camera-view">
      {devices.length > 1 && (
        <select
          className="camera-select"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
        >
          <option value="">默认摄像头</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `摄像头 ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      )}
      {cameraError && <p className="error">{cameraError}</p>}
      <div className="camera-container">
        <video ref={videoRef} className={`camera-video ${mirrored ? "mirrored" : ""}`} playsInline muted />
        {showOverlay && <canvas ref={canvasRef} className="camera-overlay" />}
      </div>
      <canvas ref={captureRef} style={{ display: "none" }} />
    </div>
  );
}
