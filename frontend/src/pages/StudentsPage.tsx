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
import { useI18n } from "../i18n/I18nProvider";

export function StudentsPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
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
      setError(e instanceof Error ? e.message : t("students.updateFailed"));
    }
  };

  const deleteStudent = async (id: number) => {
    if (!confirm(t("students.confirmDelete"))) return;
    try {
      await api.deleteStudent(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("students.deleteFailed"));
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
      setError(e instanceof Error ? e.message : t("students.reenrollFailed"));
    }
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/enroll")}>
          {t("students.enrollNew")}
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
            {t("students.empty")}
          </Typography>
          <Button variant="outlined" onClick={() => navigate("/enroll")}>
            {t("students.goEnroll")}
          </Button>
        </Card>
      ) : (
        <TableContainer component={Card}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t("common.name")}</TableCell>
                <TableCell>{t("common.className")}</TableCell>
                <TableCell align="center">{t("students.faceCount")}</TableCell>
                <TableCell>{t("common.notes")}</TableCell>
                <TableCell align="right">{t("common.actions")}</TableCell>
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
                    <Chip
                      label={s.face_count}
                      size="small"
                      color={s.face_count > 0 ? "success" : "default"}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.notes || "—"}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={t("common.edit")}>
                      <IconButton size="small" onClick={() => setEditing({ ...s })}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("students.reenrollFace")}>
                      <IconButton
                        size="small"
                        onClick={() => {
                          setReenrolling(s);
                          setCaptured([]);
                        }}
                      >
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("common.delete")}>
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
        <DialogTitle>{t("students.editStudent")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t("common.name")}
              fullWidth
              value={editing?.name ?? ""}
              onChange={(e) => setEditing((p) => p && { ...p, name: e.target.value })}
            />
            <TextField
              label={t("common.className")}
              fullWidth
              value={editing?.class_name ?? ""}
              onChange={(e) => setEditing((p) => p && { ...p, class_name: e.target.value })}
            />
            <TextField
              label={t("common.notes")}
              fullWidth
              multiline
              rows={3}
              value={editing?.notes ?? ""}
              onChange={(e) => setEditing((p) => p && { ...p, notes: e.target.value })}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
          <Button variant="contained" onClick={saveEdit}>
            {t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!reenrolling}
        onClose={() => {
          setReenrolling(null);
          setCaptured([]);
          setReenrollMode("camera");
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{t("students.reenrollTitle", { name: reenrolling?.name ?? "" })}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Tabs
              value={reenrollMode}
              onChange={(_, value: "camera" | "upload") => setReenrollMode(value)}
              variant="fullWidth"
            >
              <Tab icon={<CameraAltIcon />} iconPosition="start" label={t("students.tabCamera")} value="camera" />
              <Tab icon={<PhotoLibraryIcon />} iconPosition="start" label={t("students.tabUpload")} value="upload" />
            </Tabs>
            {reenrollMode === "camera" ? (
              <CameraView showOverlay={false} />
            ) : (
              <PhotoUploadZone onPhotosAdded={(imgs) => setCaptured((prev) => [...prev, ...imgs])} />
            )}
            {captured.length > 0 && (
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                {captured.map((img, i) => (
                  <Box
                    key={i}
                    component="img"
                    src={img}
                    alt={`capture ${i + 1}`}
                    sx={{ width: 80, height: 80, objectFit: "cover", borderRadius: 2 }}
                  />
                ))}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {reenrollMode === "camera" && (
            <Button startIcon={<CameraAltIcon />} onClick={capturePhoto}>
              {t("students.capturePhoto", { count: captured.length })}
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            onClick={() => {
              setReenrolling(null);
              setCaptured([]);
              setReenrollMode("camera");
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button variant="contained" onClick={submitReenroll} disabled={captured.length === 0}>
            {t("common.submit")}
          </Button>
        </DialogActions>
      </Dialog>

      <canvas ref={previewRef} style={{ display: "none" }} />
    </Stack>
  );
}
