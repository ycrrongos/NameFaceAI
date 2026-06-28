import MonitorIcon from "@mui/icons-material/Monitor";
import RefreshIcon from "@mui/icons-material/Refresh";
import RotateRightIcon from "@mui/icons-material/RotateRight";
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
import { useCallback, useEffect, useRef, useState } from "react";
import { useRokidPreview } from "../hooks/useRokidPreview";
import {
  drawRokidPreviewFrame,
  nextPreviewRotation,
  previewContentSize,
  type PreviewRotation,
  ROKID_PREVIEW_ROTATIONS,
} from "../utils/rokidPreviewUtils";

const ROTATION_STORAGE_KEY = "rokid-preview-rotation";

function loadSavedRotation(): PreviewRotation {
  try {
    const raw = localStorage.getItem(ROTATION_STORAGE_KEY);
    const n = Number(raw);
    if (ROKID_PREVIEW_ROTATIONS.includes(n as PreviewRotation)) {
      return n as PreviewRotation;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

export function RokidPreviewPage() {
  const { connected, preview, error, frameCount, stale, resetStats } = useRokidPreview(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotationCW, setRotationCW] = useState<PreviewRotation>(loadSavedRotation);

  const redraw = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !preview) return;
    if (img.naturalWidth < 1) return;
    drawRokidPreviewFrame(canvas, img, preview.faces, rotationCW);
  }, [preview, rotationCW]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !preview) return;

    if (img.complete && img.naturalWidth > 0) {
      redraw();
      return;
    }

    const onLoad = () => redraw();
    img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, [preview, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const rotatePreview = () => {
    setRotationCW((current) => {
      const next = nextPreviewRotation(current);
      try {
        localStorage.setItem(ROTATION_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const fps =
    preview?.frameIntervalMs != null && preview.frameIntervalMs > 0
      ? (1000 / preview.frameIntervalMs).toFixed(1)
      : "—";

  const previewAspect = preview
    ? (() => {
        const { contentW, contentH } = previewContentSize(
          preview.width || 16,
          preview.height || 9,
          rotationCW,
        );
        return `${contentW}/${contentH}`;
      })()
    : "9/16";

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <MonitorIcon color="primary" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          Rokid 画面预览
        </Typography>
        <Chip
          size="small"
          label={connected ? "已连接" : "未连接"}
          color={connected ? "success" : "default"}
        />
        <Button size="small" startIcon={<RotateRightIcon />} onClick={rotatePreview}>
          旋转 {rotationCW}°
        </Button>
        <Button size="small" startIcon={<RefreshIcon />} onClick={resetStats}>
          重置统计
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        实时显示眼镜端上传的画面与识别框。若画面方向不对，点「旋转」调整；设置会自动保存。
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
            minHeight: 320,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {preview ? (
            <>
              <Box
                component="img"
                ref={imgRef}
                src={preview.imageUrl}
                alt=""
                aria-hidden
                sx={{ display: "none" }}
              />
              <Box
                component="canvas"
                ref={canvasRef}
                sx={{
                  width: "100%",
                  maxWidth: 480,
                  aspectRatio: previewAspect,
                  maxHeight: 560,
                  display: "block",
                }}
              />
            </>
          ) : (
            <Typography color="text.secondary">暂无画面</Typography>
          )}
        </Box>

        <CardContent>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
            <Chip label={`旋转 ${rotationCW}°`} variant="outlined" />
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
