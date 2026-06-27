import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { GlassesCamera, pickPrimaryFace } from "../components/GlassesCamera";
import { getBackendParam, isRokidWebView } from "../config/runtime";
import { useRecognizeWebSocket } from "../hooks/useWebSocket";
import "./GlassesPage.css";

export function GlassesPage() {
  const rokid = isRokidWebView();
  const [fps, setFps] = useState(8);
  const [gpuMode, setGpuMode] = useState(false);
  const { connected, faces, inferenceMs, error, sendFrame } = useRecognizeWebSocket(true);

  const primary = useMemo(() => pickPrimaryFace(faces), [faces]);
  const isKnown = primary != null && primary.name !== "未知";

  useEffect(() => {
    document.title = "NameFace · Rokid";
    document.documentElement.style.background = "#000";
    document.body.classList.add("glasses-body");

    if (isRokidWebView()) {
      document.documentElement.classList.add("rokid-webview");
    }

    return () => {
      document.title = "NameFaceAI";
      document.documentElement.style.background = "";
      document.body.classList.remove("glasses-body");
      document.documentElement.classList.remove("rokid-webview");
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
      const interval = Math.max(inferenceMs * 1.05, 40);
      const cap = rokid ? 15 : 12;
      setFps(Math.min(cap, Math.max(rokid ? 8 : 6, Math.round(1000 / interval))));
    } else {
      const interval = Math.max(inferenceMs * 1.3, 250);
      setFps(Math.min(4, Math.max(1, Math.round(1000 / interval))));
    }
  }, [inferenceMs, gpuMode, rokid]);

  const backendHint = getBackendParam();

  return (
    <div className={`glasses-page${rokid ? " glasses-page--rokid" : ""}`}>
      {!rokid && (
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
      )}

      {error && <div className="glasses-page__error-bar">{error}</div>}

      <GlassesCamera
        faces={faces}
        onFrame={sendFrame}
        fps={fps}
        captureMaxWidth={rokid ? 480 : 640}
        captureQuality={rokid ? 0.5 : 0.6}
        hideVideo
        autoStart={rokid}
      />

      {!rokid && (
        <>
          <div className="glasses-page__name-panel">
            {primary ? (
              <>
                <div className={`glasses-page__name ${isKnown ? "" : "glasses-page__name--unknown"}`}>
                  {isKnown ? primary.name : "未知"}
                </div>
                <div className={`glasses-page__sub ${isKnown ? "" : "glasses-page__sub--unknown"}`}>
                  {isKnown
                    ? `置信度 ${(primary.confidence * 100).toFixed(0)}%`
                    : "未录入人脸"}
                </div>
              </>
            ) : (
              <div className="glasses-page__idle">注视学生面部</div>
            )}
          </div>

          <div className="glasses-page__hint">
            Rokid · NameFaceAI
            {backendHint ? ` · ${backendHint}` : ""}
          </div>
        </>
      )}
    </div>
  );
}
