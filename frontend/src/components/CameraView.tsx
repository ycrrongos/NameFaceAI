import RefreshIcon from "@mui/icons-material/Refresh";
import VideocamIcon from "@mui/icons-material/Videocam";
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
import { getCameraErrorMessage, isSecureEnoughForCamera, openCameraStream } from "../utils/cameraUtils";

interface CameraViewProps {
  onFrame?: (jpeg: ArrayBuffer) => void;
  faces?: FaceMatch[];
  fps?: number;
  captureMaxWidth?: number;
  captureQuality?: number;
  showOverlay?: boolean;
  mirrored?: boolean;
  requireUserGesture?: boolean;
  /** MJPEG 地址（?camera=phone + phone-mjpeg-bridge.sh） */
  streamUrl?: string | null;
}

export function CameraView({
  onFrame,
  faces = [],
  fps = 12,
  captureMaxWidth = 640,
  captureQuality = 0.65,
  showOverlay = true,
  mirrored = true,
  requireUserGesture = false,
  streamUrl = null,
}: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<HTMLCanvasElement>(null);
  const captureSizeRef = useRef({ width: 0, height: 0 });
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(false);
  const useStream = Boolean(streamUrl);

  const frameReady = useCallback(() => {
    if (useStream) {
      const img = imgRef.current;
      return Boolean(img && img.naturalWidth > 0);
    }
    const video = videoRef.current;
    return Boolean(video && video.readyState >= 2);
  }, [useStream]);

  const frameSize = useCallback(() => {
    if (useStream) {
      const img = imgRef.current;
      return { w: img?.naturalWidth ?? 0, h: img?.naturalHeight ?? 0 };
    }
    const video = videoRef.current;
    return { w: video?.videoWidth ?? 0, h: video?.videoHeight ?? 0 };
  }, [useStream]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  const startCamera = useCallback(
    async (selectedId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("当前浏览器不支持摄像头");
        return;
      }
      if (!isSecureEnoughForCamera()) {
        const { hostname, port } = window.location;
        setCameraError(`请使用 https://${hostname}:${port} 访问（当前为非安全连接）`);
        return;
      }
      setStarting(true);
      setCameraError(null);
      stopStream();
      try {
        const stream = await openCameraStream(selectedId);
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        await video.play();
        setActive(true);
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
    if (!useStream || !streamUrl) return;
    setCameraError(null);
    setStarting(true);
    const img = imgRef.current;
    if (!img) {
      setStarting(false);
      return;
    }
    const onLoad = () => {
      setActive(true);
      setStarting(false);
    };
    const onError = () => {
      setActive(false);
      setStarting(false);
      setCameraError("无法连接手机摄像头。请先运行：./scripts/phone-mjpeg-bridge.sh");
    };
    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
    img.src = streamUrl;
    return () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
      img.removeAttribute("src");
      setActive(false);
    };
  }, [streamUrl, useStream]);

  useEffect(() => {
    if (useStream) return;
    if (requireUserGesture) return;
    if (!isSecureEnoughForCamera()) return;
    let alive = true;
    void (async () => {
      if (alive) await startCamera(deviceId || undefined);
    })();
    return () => {
      alive = false;
      stopStream();
    };
  }, [deviceId, requireUserGesture, startCamera, stopStream, useStream]);

  useEffect(() => {
    if (!active || !onFrame) return;
    const interval = setInterval(() => {
      const capture = captureRef.current;
      if (!capture || !frameReady()) return;
      const source = useStream ? imgRef.current : videoRef.current;
      if (!source) return;

      const { w: srcW, h: srcH } = frameSize();
      if (srcW <= 0 || srcH <= 0) return;

      let drawW = srcW;
      let drawH = srcH;
      if (captureMaxWidth > 0 && drawW > captureMaxWidth) {
        const scale = captureMaxWidth / drawW;
        drawW = captureMaxWidth;
        drawH = Math.round(drawH * scale);
      }
      capture.width = drawW;
      capture.height = drawH;
      const ctx = capture.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(source, 0, 0, drawW, drawH);
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
  }, [active, onFrame, fps, captureMaxWidth, captureQuality, frameReady, frameSize, useStream]);

  useEffect(() => {
    if (!showOverlay || !active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf: number;
    const draw = () => {
      if (frameReady()) {
        const display = useStream ? imgRef.current : videoRef.current;
        canvas.width = display?.clientWidth ?? canvas.clientWidth;
        canvas.height = display?.clientHeight ?? canvas.clientHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const srcW = captureSizeRef.current.width || frameSize().w;
          const srcH = captureSizeRef.current.height || frameSize().h;
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
  }, [faces, showOverlay, mirrored, active, frameReady, frameSize, useStream]);

  const showStartButton =
    !useStream && !active && (requireUserGesture || !isSecureEnoughForCamera() || cameraError);

  return (
    <Stack spacing={2}>
      {!isSecureEnoughForCamera() && !useStream && (
        <Alert severity="warning">
          通过 IP 访问需使用 HTTPS：
          <strong> https://{window.location.hostname}:{window.location.port} </strong>
        </Alert>
      )}

      {useStream && (
        <Alert severity="info">手机 USB 摄像头（运行 ./scripts/phone-mjpeg-bridge.sh）</Alert>
      )}

      {devices.length > 1 && active && !useStream && (
        <FormControl size="small" sx={{ maxWidth: 320 }}>
          <InputLabel id="camera-select-label">摄像头</InputLabel>
          <Select
            labelId="camera-select-label"
            label="摄像头"
            value={deviceId}
            onChange={(e) => {
              setDeviceId(e.target.value);
              void startCamera(e.target.value || undefined);
            }}
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
            !useStream ? (
              <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={() => void startCamera(deviceId || undefined)} disabled={starting}>
                重试
              </Button>
            ) : undefined
          }
        >
          {cameraError}
        </Alert>
      )}

      <Card sx={{ overflow: "hidden", position: "relative" }}>
        <Box sx={{ position: "relative", bgcolor: "#1a1a2e", aspectRatio: "16 / 9", maxHeight: 480 }}>
          <Box
            component="video"
            ref={videoRef}
            playsInline
            muted
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: useStream ? "none" : "block",
              transform: mirrored ? "scaleX(-1)" : undefined,
            }}
          />
          {useStream && (
            <Box
              component="img"
              ref={imgRef}
              alt="手机摄像头"
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                transform: mirrored ? "scaleX(-1)" : undefined,
              }}
            />
          )}
          {showOverlay && (
            <Box component="canvas" ref={canvasRef} sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
          )}
          {showStartButton && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(0,0,0,0.55)",
              }}
            >
              <Button
                variant="contained"
                size="large"
                startIcon={<VideocamIcon />}
                disabled={starting}
                onClick={() => void startCamera(deviceId || undefined)}
              >
                {starting ? "正在开启…" : "开启摄像头"}
              </Button>
            </Box>
          )}
        </Box>
      </Card>

      <canvas ref={captureRef} style={{ display: "none" }} />
    </Stack>
  );
}
