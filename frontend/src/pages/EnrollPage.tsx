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
import { filesToDataUrls } from "../utils/imageUpload";

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
        setError(
          result.raw_text
            ? `未能识别姓名，OCR 读到：${result.raw_text}`
            : "未能从名牌识别出姓名，请调整角度或手动输入"
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "名牌识别失败");
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
      setError("摄像头尚未就绪，请稍后再试");
      return;
    }
    addPhotos([image]);
    await recognizeNameTag(image);
  };

  const recognizeLatestPhoto = async () => {
    const latest = captured[captured.length - 1];
    if (!latest) {
      setError(mode === "upload" ? "请先上传照片" : "请先拍照，或点击「拍照并识别名牌」");
      return;
    }
    await recognizeNameTag(latest);
  };

  const submit = async () => {
    if (!name.trim()) {
      setError("请输入学生姓名");
      return;
    }
    if (captured.length < 1) {
      setError("请至少添加 1 张照片（拍照或上传均可，建议 3–5 张不同角度）");
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
      setError(e instanceof Error ? e.message : "录入失败");
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
        setError("摄像头尚未就绪，请稍后再试");
        return;
      }
      images = [image];
      setCaptured([image]);
    }

    if (images.length === 0) {
      setError("请先拍照或上传至少 1 张照片");
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
      setError(e instanceof Error ? e.message : "名牌录入失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Alert severity="info" sx={{ borderRadius: 3 }}>
        可通过摄像头实时拍照，或上传已有照片录入人脸。建议 3–5 张不同角度以提高识别准确率。
      </Alert>

      <Card>
        <Tabs
          value={mode}
          onChange={(_, value: EnrollMode) => setMode(value)}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Tab icon={<CameraAltIcon />} iconPosition="start" label="摄像头拍照" value="camera" />
          <Tab icon={<PhotoLibraryIcon />} iconPosition="start" label="上传照片" value="upload" />
        </Tabs>
        <CardContent>
          {mode === "camera" ? (
            <CameraView showOverlay={false} />
          ) : (
            <PhotoUploadZone
              onPhotosAdded={addPhotos}
              disabled={loading || ocrLoading}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <BadgeIcon color="primary" />
              <Typography variant="subtitle1">名牌识别（可选）</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              若照片中含姓名牌，可自动 OCR 识别姓名并填入下方表单。
            </Typography>
            {ocrResult?.name && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                <Chip
                  color="success"
                  label={`识别：${ocrResult.name}${ocrResult.class_name ? ` · ${ocrResult.class_name}` : ""}`}
                />
                <Chip variant="outlined" label={`置信度 ${Math.round(ocrResult.confidence * 100)}%`} />
                {ocrResult.face_detected ? (
                  <Chip variant="outlined" label="已检测到人脸" />
                ) : (
                  <Chip variant="outlined" color="warning" label="未检测到人脸" />
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
                  {ocrLoading ? "识别中…" : "拍照并识别名牌"}
                </Button>
              )}
              <Button
                variant={mode === "camera" ? "outlined" : "contained"}
                startIcon={<BadgeIcon />}
                onClick={recognizeLatestPhoto}
                disabled={ocrLoading || loading || captured.length === 0}
              >
                {ocrLoading ? "识别中…" : mode === "upload" ? "识别最新上传照片" : "重新识别最新照片"}
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                onClick={submitFromNameTag}
                disabled={loading || ocrLoading}
              >
                {loading ? "录入中…" : "名牌一键录入"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <TextField label="姓名" required fullWidth value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="班级" fullWidth placeholder="如：三班" value={className} onChange={(e) => setClassName(e.target.value)} />
            <TextField label="备注" fullWidth multiline rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {captured.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom color="text.secondary">
              已选 {captured.length} 张
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 1.5 }}>
              {captured.map((img, i) => (
                <Box key={i}>
                  <Box sx={{ position: "relative", borderRadius: 2, overflow: "hidden" }}>
                    <Box component="img" src={img} alt={`照片 ${i + 1}`} sx={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                    <IconButton
                      size="small"
                      onClick={() => setCaptured((p) => p.filter((_, j) => j !== i))}
                      sx={{ position: "absolute", top: 4, right: 4, bgcolor: "rgba(0,0,0,0.5)", color: "#fff", "&:hover": { bgcolor: "rgba(0,0,0,0.7)" } }}
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
            拍照 ({captured.length})
          </Button>
        )}
        {mode === "upload" && (
          <Button
            variant="outlined"
            startIcon={<PhotoLibraryIcon />}
            onClick={() => document.getElementById("enroll-upload-more")?.click()}
            size="large"
          >
            继续上传
          </Button>
        )}
        <Button variant="contained" startIcon={<SaveIcon />} onClick={submit} disabled={loading} size="large">
          {loading ? "保存中…" : "保存"}
        </Button>
        <Button variant="text" startIcon={<CloseIcon />} onClick={() => navigate("/")}>
          取消
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
              .catch((err) => setError(err instanceof Error ? err.message : "上传失败"))
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
