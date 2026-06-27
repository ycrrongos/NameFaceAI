import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { GlassesCamera, pickPrimaryFace } from "../components/GlassesCamera";
import { getBackendParam } from "../config/runtime";
import { useRecognizeWebSocket } from "../hooks/useWebSocket";
import "./GlassesPage.css";

export function GlassesPage() {
  const [fps, setFps] = useState(8);
  const [gpuMode, setGpuMode] = useState(false);
  const [punchFlash, setPunchFlash] = useState(false);
  const { connected, faces, attendance, inferenceMs, error, sendFrame } = useRecognizeWebSocket(true);

  const primary = useMemo(() => pickPrimaryFace(faces), [faces]);
  const isKnown = primary != null && primary.name !== "未知";

  const primaryCheckIn = useMemo(() => {
    if (!primary?.student_id) return null;
    return attendance.find((a) => a.student_id === primary.student_id) ?? null;
  }, [attendance, primary?.student_id]);

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

  useEffect(() => {
    if (!primaryCheckIn?.newly_marked) return;
    setPunchFlash(true);
    const timer = window.setTimeout(() => setPunchFlash(false), 2000);
    return () => window.clearTimeout(timer);
  }, [primaryCheckIn?.newly_marked, primaryCheckIn?.student_id]);

  const backendHint = getBackendParam();

  return (
    <div className="glasses-page">
      <div className="glasses-page__hud-top">
        <div className="glasses-page__status">
          <span className={`glasses-page__dot ${connected ? "glasses-page__dot--on" : "glasses-page__dot--warn"}`} />
          {connected ? "识别 · 自动考勤" : "连接中"}
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
        fps={fps}
        captureMaxWidth={640}
        captureQuality={0.6}
      />

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
            {isKnown && primaryCheckIn?.checked_in && (
              <div className={`glasses-page__checkin ${punchFlash ? "glasses-page__checkin--flash" : ""}`}>
                ✓ 今日已打卡
                {primaryCheckIn.newly_marked ? "（刚刚记录）" : primaryCheckIn.source === "auto" ? "（自动）" : ""}
              </div>
            )}
          </>
        ) : (
          <div className="glasses-page__idle">注视学生面部以识别并自动考勤</div>
        )}
      </div>

      <div className="glasses-page__hint">
        Rokid · NameFaceAI · 识别成功自动记录出勤
        {backendHint ? ` · ${backendHint}` : ""}
      </div>
    </div>
  );
}
