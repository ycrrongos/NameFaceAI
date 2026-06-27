import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EventNoteIcon from "@mui/icons-material/EventNote";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AttendanceSheet, type AttendanceStatus } from "../api/client";

function todayString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "出勤",
  absent: "缺勤",
  late: "迟到",
  excused: "请假",
};

export function AttendancePage() {
  const [date, setDate] = useState(todayString());
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<AttendanceSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getAttendanceSheet(date, classFilter || undefined)
      .then(setSheet)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [date, classFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const classOptions = useMemo(() => {
    if (!sheet) return [];
    return [...new Set(sheet.rows.map((r) => r.class_name).filter(Boolean))] as string[];
  }, [sheet]);

  const filteredRows = useMemo(() => {
    if (!sheet) return [];
    const q = search.trim().toLowerCase();
    if (!q) return sheet.rows;
    return sheet.rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [sheet, search]);

  const markStatus = async (studentId: number, status: AttendanceStatus) => {
    setSavingId(studentId);
    setError(null);
    try {
      await api.markAttendance({ student_id: studentId, date, status });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingId(null);
    }
  };

  const markAll = async (status: AttendanceStatus) => {
    setLoading(true);
    setError(null);
    try {
      await api.markAllAttendance({ date, status });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量标记失败");
      setLoading(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Alert severity="info" sx={{ borderRadius: 3 }}>
        展示所有已录入学生的每日考勤。在「实时识别」页面识别到学生时会自动标记为出勤（不覆盖手动记录）。
      </Alert>

      <Card>
        <Box sx={{ p: 2.5 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ flexWrap: "wrap" }}>
              <TextField
                label="日期"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 160 }}
              />
              <FormControl sx={{ minWidth: 140 }}>
                <InputLabel id="class-filter-label">班级</InputLabel>
                <Select
                  labelId="class-filter-label"
                  label="班级"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <MenuItem value="">全部</MenuItem>
                  {classOptions.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="搜索姓名"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ flex: 1, minWidth: 160 }}
              />
              <Button startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
                刷新
              </Button>
            </Stack>

            {sheet && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                <Chip icon={<EventNoteIcon />} label={`共 ${sheet.summary.total} 人`} />
                <Chip color="success" variant="outlined" label={`出勤 ${sheet.summary.present}`} />
                <Chip color="error" variant="outlined" label={`缺勤 ${sheet.summary.absent}`} />
                <Chip color="warning" variant="outlined" label={`迟到 ${sheet.summary.late}`} />
                <Chip color="info" variant="outlined" label={`请假 ${sheet.summary.excused}`} />
                <Chip variant="outlined" label={`未标记 ${sheet.summary.unmarked}`} />
              </Stack>
            )}

            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              <Button variant="outlined" color="success" onClick={() => markAll("present")} disabled={loading}>
                全部出勤
              </Button>
              <Button variant="outlined" color="error" onClick={() => markAll("absent")} disabled={loading}>
                全部缺勤
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {loading && !sheet ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : filteredRows.length === 0 ? (
        <Card sx={{ textAlign: "center", py: 6 }}>
          <EventNoteIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
          <Typography color="text.secondary">
            {sheet?.summary.total === 0 ? "暂无已录入学生" : "没有匹配的学生"}
          </Typography>
        </Card>
      ) : (
        <TableContainer component={Card}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>姓名</TableCell>
                <TableCell>班级</TableCell>
                <TableCell>考勤状态</TableCell>
                <TableCell>来源</TableCell>
                <TableCell>标记时间</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.student_id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 500 }}>{row.name}</Typography>
                  </TableCell>
                  <TableCell>{row.class_name || "—"}</TableCell>
                  <TableCell>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={row.status ?? ""}
                      onChange={(_, value: AttendanceStatus | null) => {
                        if (value) void markStatus(row.student_id, value);
                      }}
                      disabled={savingId === row.student_id}
                    >
                      {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map((status) => (
                        <ToggleButton key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </TableCell>
                  <TableCell>
                    {row.source === "auto" && (
                      <Chip size="small" icon={<CheckCircleIcon />} label="自动" color="success" variant="outlined" />
                    )}
                    {row.source === "manual" && <Chip size="small" label="手动" variant="outlined" />}
                    {!row.source && "—"}
                  </TableCell>
                  <TableCell>{formatTime(row.marked_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
