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
import { useRecognizeWebSocket } from "../hooks/useWebSocket";

export function RecognizePage() {
  const navigate = useNavigate();
  const [fps, setFps] = useState(10);
  const [gpuMode, setGpuMode] = useState(false);
  const [health, setHealth] = useState<string>("");
  const { connected, faces, attendance, inferenceMs, error, sendFrame } = useRecognizeWebSocket(true);

  useEffect(() => {
    api.health().then((h) => {
      const accel =
        h.accelerator === "gpu" ? "独显" : h.accelerator === "igpu" ? "集显" : "CPU";
      setGpuMode(h.gpu);
      setHealth(`${accel} · ${h.provider}`);
      if (h.gpu) setFps(12);
      else if (h.inference_ms != null) {
        const interval = Math.max(h.inference_ms * 1.5, 300);
        setFps(Math.min(5, Math.max(1, Math.round(1000 / interval))));
      }
    });
  }, []);

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
              label={connected ? "已连接" : "连接中…"}
              color={connected ? "success" : "default"}
              variant="outlined"
            />
            <Chip icon={<MemoryIcon />} label={health || "加载中…"} variant="outlined" />
            {inferenceMs != null && (
              <Chip icon={<SpeedIcon />} label={`推理 ${inferenceMs.toFixed(0)} ms`} variant="outlined" />
            )}
            {faces.length > 0 && (
              <Chip label={`检测到 ${faces.length} 张人脸`} color="primary" variant="outlined" />
            )}
            {attendance.filter((a) => a.newly_marked).map((a) => (
              <Chip key={a.student_id} label={`${a.name} 已自动打卡`} color="success" />
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
      />

      <Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/enroll")} size="large">
          录入新学生
        </Button>
      </Box>
    </Stack>
  );
}
