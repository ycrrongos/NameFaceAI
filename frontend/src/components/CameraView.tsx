import RefreshIcon from "@mui/icons-material/Refresh";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import {
  Alert,
  Box,
  Button,
  Card,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
} from "@mui/material";
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

function getCameraErrorMessage(err: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      return `请使用 http://localhost:${window.location.port} 访问以启用摄像头`;
    }
  }
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return "摄像头权限被拒绝，请在浏览器设置中允许访问";
      case "NotFoundError":
        return "未检测到摄像头设备";
      case "NotReadableError":
        return "摄像头被其他程序占用";
      default:
        return err.message;
    }
  }
  return "无法访问摄像头，请检查浏览器权限";
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
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(
    async (selectedId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("当前浏览器不支持摄像头");
        return;
      }
      setStarting(true);
      setCameraError(null);
      stopStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: selectedId
            ? { deviceId: { ideal: selectedId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        setDevices(allDevices.filter((d) => d.kind === "videoinput"));
      } catch (err) {
        stopStream();
        setCameraError(getCameraErrorMessage(err));
      } finally {
        setStarting(false);
      }
    },
    [stopStream]
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      if (active) await startCamera(deviceId || undefined);
    })();
    return () => {
      active = false;
      stopStream();
    };
  }, [deviceId, startCamera, stopStream]);

  useEffect(() => {
    if (!onFrame) return;
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
            if (mirrored) left = canvas.width - left - width;

            const isKnown = face.name !== "未知";
            ctx.strokeStyle = isKnown ? "#386A20" : "#B3261E";
            ctx.lineWidth = 3;
            ctx.strokeRect(left, top, width, height);

            const label = `${face.name}  ${(face.confidence * 100).toFixed(0)}%`;
            ctx.font = "600 22px Roboto, Noto Sans SC, sans-serif";
            const textWidth = ctx.measureText(label).width + 20;
            ctx.fillStyle = isKnown ? "#386A20" : "#B3261E";
            ctx.beginPath();
            ctx.roundRect(left, top - 36, textWidth, 32, 8);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.fillText(label, left + 10, top - 12);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [faces, showOverlay, mirrored]);

  return (
    <Stack spacing={2}>
      {devices.length > 1 && (
        <FormControl size="small" sx={{ maxWidth: 320 }}>
          <InputLabel id="camera-select-label">摄像头</InputLabel>
          <Select
            labelId="camera-select-label"
            label="摄像头"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            <MenuItem value="">默认摄像头</MenuItem>
            {devices.map((d) => (
              <MenuItem key={d.deviceId} value={d.deviceId}>
                {d.label || `摄像头 ${d.deviceId.slice(0, 8)}`}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {cameraError && (
        <Alert
          severity="error"
          icon={<VideocamOffIcon />}
          action={
            <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={() => void startCamera(deviceId || undefined)} disabled={starting}>
              重试
            </Button>
          }
        >
          {cameraError}
        </Alert>
      )}

      <Card sx={{ overflow: "hidden" }}>
        <Box
          sx={{
            position: "relative",
            bgcolor: "#1a1a2e",
            aspectRatio: "16 / 9",
            maxHeight: 480,
          }}
        >
          <Box
            component="video"
            ref={videoRef}
            playsInline
            muted
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              transform: mirrored ? "scaleX(-1)" : undefined,
            }}
          />
          {showOverlay && (
            <Box
              component="canvas"
              ref={canvasRef}
              sx={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          )}
        </Box>
      </Card>

      <canvas ref={captureRef} style={{ display: "none" }} />
    </Stack>
  );
}
