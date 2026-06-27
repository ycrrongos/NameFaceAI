import MonitorIcon from "@mui/icons-material/Monitor";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useRef } from "react";
import type { FaceMatch } from "../api/client";
import { useRokidPreview } from "../hooks/useRokidPreview";
import { mapFaceBboxToOverlay } from "../utils/cameraUtils";

function drawOverlay(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  faces: FaceMatch[],
) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 1 || h < 1) return;

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);
  for (const face of faces) {
    const { left, top, width, height } = mapFaceBboxToOverlay(
      face.bbox,
      w,
      h,
      w,
      h,
      { objectFit: "fill", mirrored: false },
    );
    const known = face.name !== "未知";

    ctx.strokeStyle = known ? "#39FF14" : "#FF4444";
    ctx.lineWidth = 3;
    ctx.strokeRect(left, top, width, height);

    const label = known ? face.name : "?";
    ctx.font = "700 20px 'Noto Sans SC', sans-serif";
    const tw = ctx.measureText(label).width + 16;
    ctx.fillStyle = known ? "rgba(57,255,20,0.9)" : "rgba(255,68,68,0.9)";
    ctx.fillRect(left, top - 30, tw, 28);
    ctx.fillStyle = known ? "#000" : "#fff";
    ctx.fillText(label, left + 8, top - 10);
  }
}

export function RokidPreviewPage() {
  const { connected, preview, error, frameCount, stale, resetStats } = useRokidPreview(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !preview) return;

    if (img.complete && img.naturalWidth > 0) {
      drawOverlay(canvas, img, preview.faces);
      return;
    }

    const onLoad = () => drawOverlay(canvas, img, preview.faces);
    img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, [preview]);

  const fps =
    preview?.frameIntervalMs != null && preview.frameIntervalMs > 0
      ? (1000 / preview.frameIntervalMs).toFixed(1)
      : "—";

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <MonitorIcon color="primary" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          Rokid 画面预览
        </Typography>
        <Chip
          size="small"
          label={connected ? "已连接" : "未连接"}
          color={connected ? "success" : "default"}
        />
        <Button size="small" startIcon={<RefreshIcon />} onClick={resetStats}>
          重置统计
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        实时显示眼镜端上传的画面与识别框，用于观察延迟。请先在眼镜上开启 NameFaceAI 识别。
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {!preview && connected && (
        <Alert severity="info">已连接，等待眼镜端发送画面…</Alert>
      )}

      {stale && preview && (
        <Alert severity="warning">超过 5 秒未收到新帧，请检查眼镜是否在线、后端 TCP 8001 是否可达。</Alert>
      )}

      {!connected && (
        <Alert severity="warning">未连接到预览服务，请确认后端已启动。</Alert>
      )}

      <Card sx={{ overflow: "hidden" }}>
        <Box
          sx={{
            position: "relative",
            bgcolor: "#111",
            minHeight: 280,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {preview ? (
            <Box sx={{ position: "relative", maxWidth: "100%", lineHeight: 0 }}>
              <Box
                component="img"
                ref={imgRef}
                src={preview.imageUrl}
                alt="Rokid 预览"
                sx={{ maxWidth: "100%", maxHeight: 480, display: "block" }}
              />
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
            </Box>
          ) : (
            <Typography color="text.secondary">暂无画面</Typography>
          )}
        </Box>

        <CardContent>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
            <Chip label={`推理 ${preview ? preview.inferenceMs.toFixed(0) : "—"} ms`} />
            <Chip label={`处理 ${preview ? preview.totalMs.toFixed(0) : "—"} ms`} />
            <Chip label={`帧间隔 ${preview?.frameIntervalMs?.toFixed(0) ?? "—"} ms`} />
            <Chip label={`预览 FPS ${fps}`} />
            <Chip label={`累计 ${frameCount} 帧`} />
            {preview && preview.faces.length > 0 && (
              <Chip
                color="success"
                label={preview.faces.map((f) => f.name).join("、")}
              />
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
