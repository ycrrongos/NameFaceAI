import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { GlassesCamera, pickCenterFace } from "../components/GlassesCamera";
import { getBackendParam } from "../config/runtime";
import { useRecognizeWebSocket } from "../hooks/useWebSocket";
import "./GlassesPage.css";

export function GlassesPage() {
  const [fps, setFps] = useState(8);
  const [gpuMode, setGpuMode] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const { connected, faces, inferenceMs, error, sendFrame } = useRecognizeWebSocket(true);

  const primary = useMemo(
    () => pickCenterFace(faces, frameSize.width, frameSize.height),
    [faces, frameSize.width, frameSize.height],
  );
  const isKnown = primary != null && primary.name !== "未知";

  useEffect(() => {
    document.title = "NameFace · Rokid";
    document.documentElement.style.background = "#000";
    return () => {
      document.title = "NameFaceAI";
      document.documentElement.style.background = "";
    };
  }, []);

  useEffect(() => {
    api.health().then((h) => {
      setGpuMode(h.gpu);
      if (h.gpu) setFps(10);
      else if (h.inference_ms != null) {
        const interval = Math.max(h.inference_ms * 1.5, 300);
        setFps(Math.min(4, Math.max(1, Math.round(1000 / interval))));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (inferenceMs == null) return;
    if (gpuMode) {
      const interval = Math.max(inferenceMs * 1.2, 50);
      setFps(Math.min(12, Math.max(6, Math.round(1000 / interval))));
    } else {
      const interval = Math.max(inferenceMs * 1.5, 300);
      setFps(Math.min(4, Math.max(1, Math.round(1000 / interval))));
    }
  }, [inferenceMs, gpuMode]);

  const backendHint = getBackendParam();

  return (
    <div className="glasses-page">
      <div className="glasses-page__hud-top">
        <div className="glasses-page__status">
          <span className={`glasses-page__dot ${connected ? "glasses-page__dot--on" : "glasses-page__dot--warn"}`} />
          {connected ? "识别中" : "连接中"}
        </div>
        <div className="glasses-page__meta">
          {inferenceMs != null && `${inferenceMs.toFixed(0)}ms`}
          {faces.length > 1 && ` · ${faces.length}人`}
        </div>
      </div>

      {error && <div className="glasses-page__error-bar">{error}</div>}

      <GlassesCamera
        faces={faces}
        onFrame={sendFrame}
        onFrameSize={(width, height) => setFrameSize({ width, height })}
        fps={fps}
        captureMaxWidth={640}
        captureQuality={0.6}
      />

      <div className="glasses-page__center-hud" aria-live="polite">
        {primary ? (
          <>
            <div className={`glasses-page__center-name ${isKnown ? "" : "glasses-page__center-name--unknown"}`}>
              {isKnown ? primary.name : "未知"}
            </div>
            <div className={`glasses-page__center-sub ${isKnown ? "" : "glasses-page__center-sub--unknown"}`}>
              {isKnown
                ? `${(primary.confidence * 100).toFixed(0)}%`
                : "未录入"}
            </div>
          </>
        ) : (
          <div className="glasses-page__center-idle">注视画面中心</div>
        )}
      </div>

      <div className="glasses-page__hint">
        Rokid · NameFaceAI
        {backendHint ? ` · ${backendHint}` : ""}
      </div>
    </div>
  );
}
