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
import { useI18n } from "../i18n/I18nProvider";
import { mapFaceBboxToOverlay } from "../utils/cameraUtils";

function drawOverlay(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  faces: FaceMatch[],
  unknownLabel: string,
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

    const label = known ? face.name : unknownLabel;
    ctx.font = "700 20px 'Noto Sans SC', sans-serif";
    const tw = ctx.measureText(label).width + 16;
    ctx.fillStyle = known ? "rgba(57,255,20,0.9)" : "rgba(255,68,68,0.9)";
    ctx.fillRect(left, top - 30, tw, 28);
    ctx.fillStyle = known ? "#000" : "#fff";
    ctx.fillText(label, left + 8, top - 10);
  }
}

export function RokidPreviewPage() {
  const { t, faceName } = useI18n();
  const { connected, preview, error, frameCount, resetStats } = useRokidPreview(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const unknownLabel = faceName("未知");

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !preview) return;

    if (img.complete && img.naturalWidth > 0) {
      drawOverlay(canvas, img, preview.faces, unknownLabel);
      return;
    }

    const onLoad = () => drawOverlay(canvas, img, preview.faces, unknownLabel);
    img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, [preview, unknownLabel]);

  const fps =
    preview?.frameIntervalMs != null && preview.frameIntervalMs > 0
      ? (1000 / preview.frameIntervalMs).toFixed(1)
      : "—";

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <MonitorIcon color="primary" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          {t("rokidPreview.title")}
        </Typography>
        <Chip
          size="small"
          label={connected ? t("rokidPreview.connected") : t("rokidPreview.disconnected")}
          color={connected ? "success" : "default"}
        />
        <Button size="small" startIcon={<RefreshIcon />} onClick={resetStats}>
          {t("rokidPreview.resetStats")}
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {t("rokidPreview.description")}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {!preview && connected && <Alert severity="info">{t("rokidPreview.waitingFrame")}</Alert>}

      {!connected && <Alert severity="warning">{t("rokidPreview.notConnected")}</Alert>}

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
                alt={t("rokidPreview.previewAlt")}
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
            <Typography color="text.secondary">{t("rokidPreview.noFrame")}</Typography>
          )}
        </Box>

        <CardContent>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
            <Chip label={t("rokidPreview.inferenceMs", { ms: preview ? preview.inferenceMs.toFixed(0) : "—" })} />
            <Chip label={t("rokidPreview.processMs", { ms: preview ? preview.totalMs.toFixed(0) : "—" })} />
            <Chip label={t("rokidPreview.frameInterval", { ms: preview?.frameIntervalMs?.toFixed(0) ?? "—" })} />
            <Chip label={t("rokidPreview.previewFps", { fps })} />
            <Chip label={t("rokidPreview.frameCount", { count: frameCount })} />
            {preview && preview.faces.length > 0 && (
              <Chip color="success" label={preview.faces.map((f) => faceName(f.name)).join("、")} />
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
