import { useEffect, useState } from "react";
import "@fontsource/noto-sans-sc/chinese-simplified-400.css";
import "@fontsource/noto-sans-sc/chinese-simplified-700.css";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { GlassesCamera } from "../components/GlassesCamera";
import { isRokidWebView } from "../config/runtime";
import { useGlassesEnrollCapture } from "../hooks/useGlassesEnrollCapture";
import { useI18n } from "../i18n/I18nProvider";
import "./GlassesEnrollPage.css";

function glassesHomePath(): string {
  const path = window.location.pathname;
  if (path.startsWith("/glasses")) return `/glasses${window.location.search}`;
  return `/rokid${window.location.search}`;
}

export function GlassesEnrollPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const rokid = isRokidWebView();
  const { capturePhoto, setEnrollMode, nativeCamera } = useGlassesEnrollCapture();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashName, setFlashName] = useState<string | null>(null);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [recentNames, setRecentNames] = useState<string[]>([]);

  useEffect(() => {
    document.title = "NameFace · 名牌录入";
    document.documentElement.style.background = "#000";
    document.body.classList.add("glasses-body");
    if (rokid) document.documentElement.classList.add("rokid-webview");
    setEnrollMode(true);
    return () => {
      setEnrollMode(false);
      document.title = "NameFaceAI";
      document.documentElement.style.background = "";
      document.body.classList.remove("glasses-body");
      document.documentElement.classList.remove("rokid-webview");
    };
  }, [rokid, setEnrollMode]);

  const handleCaptureAndEnroll = async () => {
    if (loading) return;
    setError(null);
    setFlashName(null);

    const image = capturePhoto();
    if (!image) {
      setError(t("glassesEnroll.cameraNotReady"));
      return;
    }

    setLoading(true);
    try {
      const student = await api.enrollFromNameTag({ images: [image] });
      setEnrolledCount((c) => c + 1);
      setRecentNames((prev) => [student.name, ...prev.filter((n) => n !== student.name)].slice(0, 8));
      setFlashName(student.name);
      window.setTimeout(() => setFlashName(null), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("enroll.nameTagEnrollFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glasses-enroll">
      <div className="glasses-enroll__camera">
        <GlassesCamera
          autoStart={!nativeCamera}
          hideVideo={nativeCamera}
          hideOverlay
          nativeCapture={nativeCamera}
          fps={nativeCamera ? 8 : 6}
          captureMaxWidth={nativeCamera ? 960 : 640}
          captureQuality={0.7}
        />
      </div>

      <div className="glasses-enroll__hud">
        <div className="glasses-enroll__reticle" aria-hidden="true" />
        <p className="glasses-enroll__hint">{t("glassesEnroll.nameTagHint")}</p>
        <div className="glasses-enroll__session">
          {t("glassesEnroll.sessionCount", { count: enrolledCount })}
        </div>
        {flashName ? (
          <div className="glasses-enroll__flash-name">{flashName}</div>
        ) : (
          <div className="glasses-enroll__flash-name glasses-enroll__flash-name--idle">
            {enrolledCount > 0 ? t("glassesEnroll.readyNext") : t("glassesEnroll.aimNameTag")}
          </div>
        )}
        {recentNames.length > 0 && (
          <div className="glasses-enroll__recent">
            {recentNames.map((n) => (
              <span key={n} className="glasses-enroll__recent-chip">
                {n}
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <div className="glasses-enroll__error">{error}</div>}

      <div className="glasses-enroll__actions glasses-enroll__actions--two">
        <button type="button" className="glasses-enroll__btn glasses-enroll__btn--ghost" onClick={() => navigate(glassesHomePath())}>
          {t("glassesEnroll.back")}
        </button>
        <button
          type="button"
          className="glasses-enroll__btn glasses-enroll__btn--primary"
          onClick={() => void handleCaptureAndEnroll()}
          disabled={loading}
        >
          {loading ? t("enroll.enrolling") : t("glassesEnroll.captureEnroll")}
        </button>
      </div>
    </div>
  );
}
