import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { CameraView } from "../components/CameraView";
import { useRecognizeWebSocket } from "../hooks/useWebSocket";

export function RecognizePage() {
  const [fps, setFps] = useState(10);
  const [gpuMode, setGpuMode] = useState(false);
  const [health, setHealth] = useState<string>("");
  const { connected, faces, inferenceMs, error, sendFrame } = useRecognizeWebSocket(true);

  useEffect(() => {
    api.health().then((h) => {
      const accel =
        h.accelerator === "gpu" ? "独显" : h.accelerator === "igpu" ? "集显" : "CPU";
      setGpuMode(h.gpu);
      setHealth(`${accel} · ${h.provider} · ${h.inference_ms?.toFixed(0) ?? "?"}ms`);
      if (h.gpu) {
        setFps(12);
      } else if (h.inference_ms != null) {
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
    <div className="page">
      <header className="page-header">
        <h1>实时识别</h1>
        <p className="subtitle">
          {connected ? "已连接" : "连接中…"} · {health}
          {inferenceMs != null && ` · 推理 ${inferenceMs.toFixed(0)}ms`}
        </p>
      </header>

      {error && <p className="error">{error}</p>}

      <CameraView faces={faces} onFrame={sendFrame} fps={fps} captureMaxWidth={1280} captureQuality={0.75} />

      <div className="actions">
        <Link to="/enroll" className="btn btn-primary">
          录入新学生
        </Link>
      </div>
    </div>
  );
}
