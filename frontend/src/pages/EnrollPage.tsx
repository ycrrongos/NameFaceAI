import BadgeIcon from "@mui/icons-material/Badge";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import SaveIcon from "@mui/icons-material/Save";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type NameTagOcrResult } from "../api/client";
import { CameraView } from "../components/CameraView";
import { PhotoUploadZone } from "../components/PhotoUploadZone";
import { useI18n } from "../i18n/I18nProvider";
import { filesToDataUrls, UploadError } from "../utils/imageUpload";

function captureFrame(canvas: HTMLCanvasElement, video: HTMLVideoElement): string | null {
  if (video.readyState < 2) return null;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.85);
}

type EnrollMode = "camera" | "upload";

export function EnrollPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [mode, setMode] = useState<EnrollMode>("camera");
  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [notes, setNotes] = useState("");
  const [captured, setCaptured] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<NameTagOcrResult | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const getVideo = () => document.querySelector("video") as HTMLVideoElement | null;

  const addPhotos = (images: string[]) => {
    setCaptured((prev) => [...prev, ...images]);
    setOcrResult(null);
  };

  const capturePhoto = () => {
    const canvas = previewRef.current;
    const video = getVideo();
    if (!canvas || !video) return;
    const image = captureFrame(canvas, video);
    if (!image) return;
    addPhotos([image]);
  };

  const applyOcrResult = (result: NameTagOcrResult) => {
    setOcrResult(result);
    if (result.name) setName(result.name);
    if (result.class_name) setClassName(result.class_name);
  };

  const recognizeNameTag = async (image: string) => {
    setOcrLoading(true);
    setError(null);
    try {
      const result = await api.detectNameTag(image);
      applyOcrResult(result);
      if (!result.name) {
        const detected = result.ocr_lines.length > 0 ? result.ocr_lines.join(" / ") : result.raw_text;
        setError(
          detected
            ? t("enroll.ocrNoNameDetected", { text: detected })
            : t("enroll.ocrNoName"),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("enroll.ocrFailed"));
    } finally {
      setOcrLoading(false);
    }
  };

  const captureAndRecognize = async () => {
    const canvas = previewRef.current;
    const video = getVideo();
    if (!canvas || !video) return;
    const image = captureFrame(canvas, video);
    if (!image) {
      setError(t("enroll.cameraNotReady"));
      return;
    }
    addPhotos([image]);
    await recognizeNameTag(image);
  };

  const recognizeLatestPhoto = async () => {
    const latest = captured[captured.length - 1];
    if (!latest) {
      setError(mode === "upload" ? t("enroll.uploadFirst") : t("enroll.photoOrOcrFirst"));
      return;
    }
    await recognizeNameTag(latest);
  };

  const submit = async () => {
    if (!name.trim()) {
      setError(t("enroll.nameRequired"));
      return;
    }
    if (captured.length < 1) {
      setError(t("enroll.photosRequired"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.enrollStudent({
        name: name.trim(),
        class_name: className.trim() || undefined,
        notes: notes.trim() || undefined,
        images: captured,
      });
      navigate("/students");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("enroll.enrollFailed"));
    } finally {
      setLoading(false);
    }
  };

  const submitFromNameTag = async () => {
    let images = captured;

    if (images.length === 0 && mode === "camera") {
      const canvas = previewRef.current;
      const video = getVideo();
      if (!canvas || !video) return;
      const image = captureFrame(canvas, video);
      if (!image) {
        setError(t("enroll.cameraNotReady"));
        return;
      }
      images = [image];
      setCaptured([image]);
    }

    if (images.length === 0) {
      setError(t("enroll.photoRequired"));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.enrollFromNameTag({
        images,
        name: name.trim() || undefined,
        class_name: className.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      navigate("/students");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("enroll.nameTagEnrollFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Alert severity="info" sx={{ borderRadius: 3 }}>
        {t("enroll.info")}
      </Alert>

      <Card>
        <Tabs
          value={mode}
          onChange={(_, value: EnrollMode) => setMode(value)}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Tab icon={<CameraAltIcon />} iconPosition="start" label={t("enroll.tabCamera")} value="camera" />
          <Tab icon={<PhotoLibraryIcon />} iconPosition="start" label={t("enroll.tabUpload")} value="upload" />
        </Tabs>
        <CardContent>
          {mode === "camera" ? (
            <CameraView showOverlay={false} />
          ) : (
            <PhotoUploadZone onPhotosAdded={addPhotos} disabled={loading || ocrLoading} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <BadgeIcon color="primary" />
              <Typography variant="subtitle1">{t("enroll.nameTagTitle")}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {t("enroll.nameTagHint")}
            </Typography>
            {ocrResult && ocrResult.ocr_lines.length > 0 && !ocrResult.name && (
              <Typography variant="caption" color="text.secondary">
                {t("enroll.ocrDetected", { text: ocrResult.ocr_lines.join(" / ") })}
              </Typography>
            )}
            {ocrResult?.name && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                <Chip
                  color="success"
                  label={t("enroll.ocrResult", {
                    name: ocrResult.name,
                    className: ocrResult.class_name ? ` · ${ocrResult.class_name}` : "",
                  })}
                />
                <Chip
                  variant="outlined"
                  label={t("enroll.confidence", { pct: Math.round(ocrResult.confidence * 100) })}
                />
                {ocrResult.face_detected ? (
                  <Chip variant="outlined" label={t("enroll.faceDetected")} />
                ) : (
                  <Chip variant="outlined" color="warning" label={t("enroll.faceNotDetected")} />
                )}
              </Stack>
            )}
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
              {mode === "camera" && (
                <Button
                  variant="contained"
                  startIcon={<BadgeIcon />}
                  onClick={captureAndRecognize}
                  disabled={ocrLoading || loading}
                >
                  {ocrLoading ? t("enroll.ocring") : t("enroll.captureAndOcr")}
                </Button>
              )}
              <Button
                variant={mode === "camera" ? "outlined" : "contained"}
                startIcon={<BadgeIcon />}
                onClick={recognizeLatestPhoto}
                disabled={ocrLoading || loading || captured.length === 0}
              >
                {ocrLoading
                  ? t("enroll.ocring")
                  : mode === "upload"
                    ? t("enroll.ocrLatestUpload")
                    : t("enroll.ocrLatestPhoto")}
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                onClick={submitFromNameTag}
                disabled={loading || ocrLoading}
              >
                {loading ? t("enroll.enrolling") : t("enroll.nameTagEnroll")}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <TextField
              label={t("common.name")}
              required
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label={t("common.className")}
              fullWidth
              placeholder={t("enroll.classPlaceholder")}
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            />
            <TextField
              label={t("common.notes")}
              fullWidth
              multiline
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {captured.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom color="text.secondary">
              {t("enroll.selectedPhotos", { count: captured.length })}
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 1.5 }}>
              {captured.map((img, i) => (
                <Box key={i}>
                  <Box sx={{ position: "relative", borderRadius: 2, overflow: "hidden" }}>
                    <Box
                      component="img"
                      src={img}
                      alt={t("enroll.photoAlt", { n: i + 1 })}
                      sx={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => setCaptured((p) => p.filter((_, j) => j !== i))}
                      sx={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        bgcolor: "rgba(0,0,0,0.5)",
                        color: "#fff",
                        "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.5 }}>
        {mode === "camera" && (
          <Button variant="outlined" startIcon={<CameraAltIcon />} onClick={capturePhoto} size="large">
            {t("enroll.capturePhoto", { count: captured.length })}
          </Button>
        )}
        {mode === "upload" && (
          <Button
            variant="outlined"
            startIcon={<PhotoLibraryIcon />}
            onClick={() => document.getElementById("enroll-upload-more")?.click()}
            size="large"
          >
            {t("enroll.uploadMore")}
          </Button>
        )}
        <Button variant="contained" startIcon={<SaveIcon />} onClick={submit} disabled={loading} size="large">
          {loading ? t("enroll.saving") : t("common.save")}
        </Button>
        <Button variant="text" startIcon={<CloseIcon />} onClick={() => navigate("/")}>
          {t("common.cancel")}
        </Button>
      </Stack>

      {mode === "upload" && (
        <input
          id="enroll-upload-more"
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple
          onChange={(e) => {
            const files = e.target.files;
            if (!files) return;
            void filesToDataUrls(files)
              .then(addPhotos)
              .catch((err) => {
                if (err instanceof UploadError) {
                  setError(t(err.i18nKey, err.i18nParams));
                } else {
                  setError(t("enroll.uploadFailed"));
                }
              })
              .finally(() => {
                e.target.value = "";
              });
          }}
        />
      )}

      <canvas ref={previewRef} style={{ display: "none" }} />
    </Stack>
  );
}
