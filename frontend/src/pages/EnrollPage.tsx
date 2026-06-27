import CameraAltIcon from "@mui/icons-material/CameraAlt";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { CameraView } from "../components/CameraView";

export function EnrollPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [notes, setNotes] = useState("");
  const [captured, setCaptured] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const capturePhoto = () => {
    const video = document.querySelector("video") as HTMLVideoElement | null;
    const canvas = previewRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setCaptured((prev) => [...prev, canvas.toDataURL("image/jpeg", 0.85)]);
  };

  const submit = async () => {
    if (!name.trim()) {
      setError("请输入学生姓名");
      return;
    }
    if (captured.length < 1) {
      setError("请至少拍摄 1 张照片（建议 3–5 张不同角度）");
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

  return (
    <Stack spacing={3}>
      <Alert severity="info" sx={{ borderRadius: 3 }}>
        拍摄 3–5 张不同角度的照片，可显著提高远距离识别准确率
      </Alert>

      <CameraView showOverlay={false} />

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
              已拍 {captured.length} 张
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
        <Button variant="outlined" startIcon={<CameraAltIcon />} onClick={capturePhoto} size="large">
          拍照 ({captured.length})
        </Button>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={submit} disabled={loading} size="large">
          {loading ? "保存中…" : "保存"}
        </Button>
        <Button variant="text" startIcon={<CloseIcon />} onClick={() => navigate("/")}>
          取消
        </Button>
      </Stack>

      <canvas ref={previewRef} style={{ display: "none" }} />
    </Stack>
  );
}
