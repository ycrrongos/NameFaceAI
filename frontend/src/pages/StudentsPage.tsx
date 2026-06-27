import AddIcon from "@mui/icons-material/Add";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FaceIcon from "@mui/icons-material/Face";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Student } from "../api/client";
import { CameraView } from "../components/CameraView";
import { PhotoUploadZone } from "../components/PhotoUploadZone";

export function StudentsPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [reenrolling, setReenrolling] = useState<Student | null>(null);
  const [reenrollMode, setReenrollMode] = useState<"camera" | "upload">("camera");
  const [captured, setCaptured] = useState<string[]>([]);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const load = () => {
    setLoading(true);
    api
      .listStudents()
      .then(setStudents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.updateStudent(editing.id, {
        name: editing.name,
        class_name: editing.class_name ?? undefined,
        notes: editing.notes ?? undefined,
      });
      setEditing(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    }
  };

  const deleteStudent = async (id: number) => {
    if (!confirm("确定删除该学生？")) return;
    try {
      await api.deleteStudent(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const capturePhoto = () => {
    const video = document.querySelector("video") as HTMLVideoElement | null;
    const canvas = previewRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setCaptured((prev) => [...prev, canvas.toDataURL("image/jpeg", 0.85)]);
  };

  const submitReenroll = async () => {
    if (!reenrolling || captured.length === 0) return;
    try {
      await api.reenrollStudent(reenrolling.id, {
        name: reenrolling.name,
        class_name: reenrolling.class_name ?? undefined,
        notes: reenrolling.notes ?? undefined,
        images: captured,
      });
      setReenrolling(null);
      setCaptured([]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "重新录入失败");
    }
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/enroll")}>
          录入新学生
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : students.length === 0 ? (
        <Card sx={{ textAlign: "center", py: 6 }}>
          <FaceIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
          <Typography color="text.secondary" gutterBottom>
            暂无学生
          </Typography>
          <Button variant="outlined" onClick={() => navigate("/enroll")}>
            去录入
          </Button>
        </Card>
      ) : (
        <TableContainer component={Card}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>姓名</TableCell>
                <TableCell>班级</TableCell>
                <TableCell align="center">人脸数</TableCell>
                <TableCell>备注</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 500 }}>{s.name}</Typography>
                  </TableCell>
                  <TableCell>{s.class_name || "—"}</TableCell>
                  <TableCell align="center">
                    <Chip label={s.face_count} size="small" color={s.face_count > 0 ? "success" : "default"} variant="outlined" />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.notes || "—"}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="编辑">
                      <IconButton size="small" onClick={() => setEditing({ ...s })}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="重录人脸">
                      <IconButton size="small" onClick={() => { setReenrolling(s); setCaptured([]); }}>
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton size="small" color="error" onClick={() => deleteStudent(s.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>编辑学生</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="姓名" fullWidth value={editing?.name ?? ""} onChange={(e) => setEditing((p) => p && { ...p, name: e.target.value })} />
            <TextField label="班级" fullWidth value={editing?.class_name ?? ""} onChange={(e) => setEditing((p) => p && { ...p, class_name: e.target.value })} />
            <TextField label="备注" fullWidth multiline rows={3} value={editing?.notes ?? ""} onChange={(e) => setEditing((p) => p && { ...p, notes: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(null)}>取消</Button>
          <Button variant="contained" onClick={saveEdit}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!reenrolling} onClose={() => { setReenrolling(null); setCaptured([]); setReenrollMode("camera"); }} fullWidth maxWidth="md">
        <DialogTitle>重新录入人脸 — {reenrolling?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Tabs
              value={reenrollMode}
              onChange={(_, value: "camera" | "upload") => setReenrollMode(value)}
              variant="fullWidth"
            >
              <Tab icon={<CameraAltIcon />} iconPosition="start" label="摄像头" value="camera" />
              <Tab icon={<PhotoLibraryIcon />} iconPosition="start" label="上传照片" value="upload" />
            </Tabs>
            {reenrollMode === "camera" ? (
              <CameraView showOverlay={false} />
            ) : (
              <PhotoUploadZone onPhotosAdded={(imgs) => setCaptured((prev) => [...prev, ...imgs])} />
            )}
            {captured.length > 0 && (
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                {captured.map((img, i) => (
                  <Box key={i} component="img" src={img} alt={`capture ${i + 1}`} sx={{ width: 80, height: 80, objectFit: "cover", borderRadius: 2 }} />
                ))}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {reenrollMode === "camera" && (
            <Button startIcon={<CameraAltIcon />} onClick={capturePhoto}>
              拍照 ({captured.length})
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => { setReenrolling(null); setCaptured([]); setReenrollMode("camera"); }}>取消</Button>
          <Button variant="contained" onClick={submitReenroll} disabled={captured.length === 0}>
            提交
          </Button>
        </DialogActions>
      </Dialog>

      <canvas ref={previewRef} style={{ display: "none" }} />
    </Stack>
  );
}
