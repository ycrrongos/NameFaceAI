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
import { useI18n } from "../i18n/I18nProvider";
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
  const { t, faceName } = useI18n();
  const { connected, preview, error, frameCount, stale, resetStats } = useRokidPreview(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotationCW, setRotationCW] = useState<PreviewRotation>(loadSavedRotation);

  const redraw = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !preview) return;
    if (img.naturalWidth < 1) return;
    drawRokidPreviewFrame(canvas, img, preview.faces, rotationCW, faceName("未知"));
  }, [preview, rotationCW, faceName]);

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
          {t("rokidPreview.title")}
        </Typography>
        <Chip
          size="small"
          label={connected ? t("rokidPreview.connected") : t("rokidPreview.disconnected")}
          color={connected ? "success" : "default"}
        />
        <Button size="small" startIcon={<RotateRightIcon />} onClick={rotatePreview}>
          {t("rokidPreview.rotate", { deg: rotationCW })}
        </Button>
        <Button size="small" startIcon={<RefreshIcon />} onClick={resetStats}>
          {t("rokidPreview.resetStats")}
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {t("rokidPreview.descriptionWithRotate")}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {!preview && connected && <Alert severity="info">{t("rokidPreview.waitingFrame")}</Alert>}

      {stale && preview && (
        <Alert severity="warning">{t("rokidPreview.staleFrames")}</Alert>
      )}

      {!connected && <Alert severity="warning">{t("rokidPreview.notConnected")}</Alert>}

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
            <Typography color="text.secondary">{t("rokidPreview.noFrame")}</Typography>
          )}
        </Box>

        <CardContent>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
            <Chip label={t("rokidPreview.rotationLabel", { deg: rotationCW })} variant="outlined" />
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
