import AddIcon from "@mui/icons-material/Add";
import MemoryIcon from "@mui/icons-material/Memory";
import SpeedIcon from "@mui/icons-material/Speed";
import WifiIcon from "@mui/icons-material/Wifi";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { CameraView } from "../components/CameraView";
import { getPhoneCameraStreamUrl } from "../config/runtime";
import { useI18n } from "../i18n/I18nProvider";
import { useRecognizeWebSocket } from "../hooks/useWebSocket";

export function RecognizePage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [fps, setFps] = useState(10);
  const [gpuMode, setGpuMode] = useState(false);
  const [health, setHealth] = useState<string>("");
  const { connected, faces, attendance, inferenceMs, error, sendFrame, frameSize } =
    useRecognizeWebSocket(true);

  useEffect(() => {
    api.health().then((h) => {
      const accel =
        h.accelerator === "gpu"
          ? t("recognize.accelGpu")
          : h.accelerator === "igpu"
            ? t("recognize.accelIgpu")
            : t("recognize.accelCpu");
      setGpuMode(h.gpu);
      setHealth(
        `${h.face_model_name ?? "模型"}@${h.face_det_size ?? "?"} · ${accel} · ${h.provider}`,
      );
      if (h.gpu) setFps(12);
      else if (h.inference_ms != null) {
        const interval = Math.max(h.inference_ms * 1.5, 300);
        setFps(Math.min(5, Math.max(1, Math.round(1000 / interval))));
      }
    });
  }, [t]);

  useEffect(() => {
    if (inferenceMs == null) return;
    if (gpuMode) {
      const interval = Math.max(inferenceMs * 1.2, 50);
      setFps(Math.min(15, Math.max(8, Math.round(1000 / interval))));
    } else {
      const interval = Math.max(inferenceMs * 1.5, 300);
      setFps(Math.min(5, Math.max(1, Math.round(1000 / interval))));
    }
  }, [inferenceMs, gpuMode]);

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}>
            <Chip
              icon={connected ? <WifiIcon /> : <WifiOffIcon />}
              label={connected ? t("recognize.connected") : t("recognize.connecting")}
              color={connected ? "success" : "default"}
              variant="outlined"
            />
            <Chip icon={<MemoryIcon />} label={health || t("common.loading")} variant="outlined" />
            {inferenceMs != null && (
              <Chip
                icon={<SpeedIcon />}
                label={t("recognize.inferenceMs", { ms: inferenceMs.toFixed(0) })}
                variant="outlined"
              />
            )}
            {connected && inferenceMs == null && (
              <Chip label="等待推理…" color="warning" variant="outlined" />
            )}
            {faces.length > 0 && (
              <Chip
                label={t("recognize.facesDetected", { count: faces.length })}
                color="primary"
                variant="outlined"
              />
            )}
            {attendance.filter((a) => a.newly_marked).map((a) => (
              <Chip key={a.student_id} label={t("recognize.autoCheckIn", { name: a.name })} color="success" />
            ))}
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      <CameraView
        faces={faces}
        onFrame={sendFrame}
        fps={fps}
        captureMaxWidth={1280}
        captureQuality={0.75}
        streamUrl={getPhoneCameraStreamUrl()}
        sourceFrameSize={frameSize}
      />

      <Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/enroll")} size="large">
          {t("recognize.enrollNew")}
        </Button>
      </Box>
    </Stack>
  );
}
