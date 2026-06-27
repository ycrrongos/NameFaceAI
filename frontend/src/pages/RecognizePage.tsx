import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { CameraView } from "../components/CameraView";
import { useRecognizeWebSocket } from "../hooks/useWebSocket";

export function RecognizePage() {
  const [fps, setFps] = useState(12);
  const [health, setHealth] = useState<string>("");
  const { connected, faces, inferenceMs, error, sendFrame } = useRecognizeWebSocket(true);

  useEffect(() => {
    api.health().then((h) => {
      const gpu = h.gpu ? "GPU" : "CPU";
      setHealth(`${gpu} · ${h.provider} · ${h.inference_ms?.toFixed(0) ?? "?"}ms`);
      if (h.inference_ms != null && h.inference_ms < 50) setFps(15);
    });
  }, []);

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

      <CameraView faces={faces} onFrame={sendFrame} fps={fps} />

      <div className="actions">
        <Link to="/enroll" className="btn btn-primary">
          录入新学生
        </Link>
      </div>
    </div>
  );
}
