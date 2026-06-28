import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "@fontsource/noto-sans-sc/chinese-simplified-400.css";
import "@fontsource/noto-sans-sc/chinese-simplified-700.css";
import { api } from "../api/client";
import { GlassesCamera, pickCenterFace } from "../components/GlassesCamera";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { getBackendParam, isRokidNativeCamera, isRokidWebView } from "../config/runtime";
import { useRokidNativeRecognize } from "../hooks/useRokidNativeRecognize";
import { useI18n } from "../i18n/I18nProvider";
import { useRecognizeWebSocket } from "../hooks/useWebSocket";
import "./GlassesPage.css";

export function GlassesPage() {
  const { t, faceName } = useI18n();
  const navigate = useNavigate();
  const rokid = isRokidWebView();
  const nativeCamera = isRokidNativeCamera();
  const showCenterHud = rokid || nativeCamera;
  const showBrowserPanel = !showCenterHud;
  const [fps, setFps] = useState(8);
  const [gpuMode, setGpuMode] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [punchFlash, setPunchFlash] = useState(false);
  const ws = useRecognizeWebSocket(!nativeCamera);
  const native = useRokidNativeRecognize(nativeCamera);
  const { connected, faces, attendance, inferenceMs, error } = nativeCamera ? native : ws;

  const primary = useMemo(
    () => pickCenterFace(faces, frameSize.width, frameSize.height),
    [faces, frameSize.width, frameSize.height],
  );
  const isKnown = primary != null && primary.name !== "未知";

  const primaryCheckIn = useMemo(() => {
    if (!primary?.student_id) return null;
    return attendance.find((a) => a.student_id === primary.student_id) ?? null;
  }, [attendance, primary?.student_id]);

  useEffect(() => {
    document.title = "NameFace · Rokid";
    document.documentElement.style.background = "#000";
    document.body.classList.add("glasses-body");

    if (rokid) {
      document.documentElement.classList.add("rokid-webview");
    }

    return () => {
      document.title = "NameFaceAI";
      document.documentElement.style.background = "";
      document.body.classList.remove("glasses-body");
      document.documentElement.classList.remove("rokid-webview");
    };
  }, [rokid]);

  useEffect(() => {
    api
      .health()
      .then((h) => {
        setGpuMode(h.gpu);
        if (h.gpu) setFps(10);
        else if (h.inference_ms != null) {
          const interval = Math.max(h.inference_ms * 1.5, 300);
          setFps(Math.min(4, Math.max(1, Math.round(1000 / interval))));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (inferenceMs == null) return;
    if (gpuMode) {
      const interval = Math.max(inferenceMs * 1.05, 40);
      const cap = rokid ? 20 : 12;
      setFps(Math.min(cap, Math.max(rokid ? 12 : 6, Math.round(1000 / interval))));
    } else {
      const interval = Math.max(inferenceMs * 1.3, 250);
      setFps(Math.min(4, Math.max(1, Math.round(1000 / interval))));
    }
  }, [inferenceMs, gpuMode, rokid]);

  useEffect(() => {
    if (!nativeCamera) return;
    if (native.frameSize.width > 0) {
      setFrameSize(native.frameSize);
    }
  }, [nativeCamera, native.frameSize.width, native.frameSize.height]);

  useEffect(() => {
    if (!primaryCheckIn?.newly_marked || rokid) return;
    setPunchFlash(true);
    const timer = window.setTimeout(() => setPunchFlash(false), 2000);
    return () => window.clearTimeout(timer);
  }, [primaryCheckIn?.newly_marked, primaryCheckIn?.student_id, rokid]);

  const backendHint = getBackendParam();

  const openEnroll = () => {
    const base = window.location.pathname.startsWith("/glasses") ? "/glasses/enroll" : "/rokid/enroll";
    navigate(`${base}${window.location.search}`);
  };

  return (
    <div className={`glasses-page${rokid ? " glasses-page--rokid" : ""}`}>
      {showBrowserPanel && (
        <div className="glasses-page__hud-top">
          <div className="glasses-page__status">
            <span className={`glasses-page__dot ${connected ? "glasses-page__dot--on" : "glasses-page__dot--warn"}`} />
            {connected ? t("glasses.statusOn") : t("glasses.statusConnecting")}
          </div>
          <div className="glasses-page__meta">
            {inferenceMs != null && `${inferenceMs.toFixed(0)}ms`}
            {faces.length > 1 && ` · ${t("glasses.peopleCount", { count: faces.length })}`}
          </div>
          <LanguageSwitcher compact />
        </div>
      )}

      {error && (showBrowserPanel || showCenterHud) && (
        <div className={`glasses-page__error-bar${showCenterHud ? " glasses-page__error-bar--hud" : ""}`}>
          {error}
        </div>
      )}

      <GlassesCamera
        faces={faces}
        onFrame={nativeCamera ? undefined : ws.sendFrame}
        onFrameSize={(width, height) => setFrameSize({ width, height })}
        sourceFrameSize={frameSize}
        fps={fps}
        captureMaxWidth={nativeCamera ? 960 : rokid ? 480 : 640}
        captureQuality={nativeCamera ? 0.55 : rokid ? 0.5 : 0.6}
        hideVideo={nativeCamera || rokid}
        hideOverlay={rokid}
        autoStart={!nativeCamera && (rokid || showBrowserPanel)}
        nativeCapture={nativeCamera}
      />

      {showCenterHud && (
        <div className="glasses-page__center-hud" aria-live="polite">
          <div className="glasses-page__reticle-wrap">
            <div className="glasses-page__reticle" aria-hidden="true" />
            {primary ? (
              <div className={`glasses-page__center-name ${isKnown ? "" : "glasses-page__center-name--unknown"}`}>
                {isKnown ? primary.name : faceName("未知")}
              </div>
            ) : (
              <div className="glasses-page__center-idle">{t("glasses.idleHint")}</div>
            )}
          </div>
          <button type="button" className="glasses-page__enroll-fab" onClick={openEnroll}>
            {t("glassesEnroll.entry")}
          </button>
        </div>
      )}

      {showBrowserPanel && (
        <>
          <div className="glasses-page__name-panel">
            {primary ? (
              <>
                <div className={`glasses-page__name ${isKnown ? "" : "glasses-page__name--unknown"}`}>
                  {isKnown ? primary.name : faceName("未知")}
                </div>
                <div className={`glasses-page__sub ${isKnown ? "" : "glasses-page__sub--unknown"}`}>
                  {isKnown
                    ? t("glasses.confidence", { pct: (primary.confidence * 100).toFixed(0) })
                    : t("glasses.notEnrolled")}
                </div>
                {isKnown && primaryCheckIn?.checked_in && (
                  <div className={`glasses-page__checkin ${punchFlash ? "glasses-page__checkin--flash" : ""}`}>
                    {t("glasses.checkedIn")}
                    {primaryCheckIn.newly_marked
                      ? t("glasses.justMarked")
                      : primaryCheckIn.source === "auto"
                        ? t("glasses.autoSource")
                        : ""}
                  </div>
                )}
              </>
            ) : (
              <div className="glasses-page__idle">{t("glasses.idleHint")}</div>
            )}
          </div>

          <div className="glasses-page__hint">
            {t("glasses.footer")}
            {backendHint ? ` · ${backendHint}` : ""}
          </div>
        </>
      )}
    </div>
  );
}
