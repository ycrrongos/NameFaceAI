import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EventNoteIcon from "@mui/icons-material/EventNote";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import RefreshIcon from "@mui/icons-material/Refresh";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
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
import { useI18n } from "../i18n/I18nProvider";
import { exportAttendanceMarkdown, exportAttendancePdf } from "../utils/attendanceExport";

function todayString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const STATUS_KEYS: Record<AttendanceStatus, string> = {
  present: "attendance.statusPresent",
  absent: "attendance.statusAbsent",
  late: "attendance.statusLate",
  excused: "attendance.statusExcused",
};

export function AttendancePage() {
  const { t, dateLocale } = useI18n();
  const [date, setDate] = useState(todayString());
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<AttendanceSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"md" | "pdf" | null>(null);

  const exportLabels = useMemo(
    () => ({
      title: t("attendance.exportTitle"),
      dateLabel: t("attendance.date"),
      classLabel: t("attendance.classFilter"),
      allClasses: t("common.all"),
      summaryTitle: t("attendance.summaryTitle"),
      detailTitle: t("attendance.detailTitle"),
      name: t("common.name"),
      className: t("common.className"),
      status: t("attendance.status"),
      source: t("attendance.source"),
      markedAt: t("attendance.markedAt"),
      total: t("attendance.summaryTotal"),
      present: t("attendance.summaryPresent"),
      absent: t("attendance.summaryAbsent"),
      late: t("attendance.summaryLate"),
      excused: t("attendance.summaryExcused"),
      unmarked: t("attendance.summaryUnmarked"),
      statusLabels: {
        present: t("attendance.statusPresent"),
        absent: t("attendance.statusAbsent"),
        late: t("attendance.statusLate"),
        excused: t("attendance.statusExcused"),
      },
      sourceAuto: t("attendance.sourceAuto"),
      sourceManual: t("attendance.sourceManual"),
      none: "—",
    }),
    [t],
  );

  const formatTime = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getAttendanceSheet(date, classFilter || undefined)
      .then(setSheet)
      .catch((e) => setError(e instanceof Error ? e.message : t("attendance.loadFailed")))
      .finally(() => setLoading(false));
  }, [date, classFilter, t]);

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

  const buildExportOptions = () => {
    if (!sheet || filteredRows.length === 0) return null;
    return {
      sheet,
      rows: filteredRows,
      classFilter,
      labels: exportLabels,
      formatTime,
    };
  };

  const handleExportMarkdown = () => {
    const options = buildExportOptions();
    if (!options) return;
    try {
      exportAttendanceMarkdown(options);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("attendance.exportFailed"));
    }
  };

  const handleExportPdf = async () => {
    const options = buildExportOptions();
    if (!options) return;
    setExporting("pdf");
    setError(null);
    try {
      await exportAttendancePdf(options);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("attendance.exportFailed"));
    } finally {
      setExporting(null);
    }
  };

  const markStatus = async (studentId: number, status: AttendanceStatus) => {
    setSavingId(studentId);
    setError(null);
    try {
      await api.markAttendance({ student_id: studentId, date, status });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("attendance.saveFailed"));
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
      setError(e instanceof Error ? e.message : t("attendance.batchFailed"));
      setLoading(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Alert severity="info" sx={{ borderRadius: 3 }}>
        {t("attendance.info")}
      </Alert>

      <Card>
        <Box sx={{ p: 2.5 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ flexWrap: "wrap" }}>
              <TextField
                label={t("attendance.date")}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ minWidth: 160 }}
              />
              <FormControl sx={{ minWidth: 140 }}>
                <InputLabel id="class-filter-label">{t("attendance.classFilter")}</InputLabel>
                <Select
                  labelId="class-filter-label"
                  label={t("attendance.classFilter")}
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <MenuItem value="">{t("common.all")}</MenuItem>
                  {classOptions.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label={t("attendance.searchName")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ flex: 1, minWidth: 160 }}
              />
              <Button startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
                {t("common.refresh")}
              </Button>
            </Stack>

            {sheet && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                <Chip icon={<EventNoteIcon />} label={t("attendance.total", { count: sheet.summary.total })} />
                <Chip color="success" variant="outlined" label={t("attendance.present", { count: sheet.summary.present })} />
                <Chip color="error" variant="outlined" label={t("attendance.absent", { count: sheet.summary.absent })} />
                <Chip color="warning" variant="outlined" label={t("attendance.late", { count: sheet.summary.late })} />
                <Chip color="info" variant="outlined" label={t("attendance.excused", { count: sheet.summary.excused })} />
                <Chip variant="outlined" label={t("attendance.unmarked", { count: sheet.summary.unmarked })} />
              </Stack>
            )}

            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              <Button variant="outlined" color="success" onClick={() => markAll("present")} disabled={loading}>
                {t("attendance.markAllPresent")}
              </Button>
              <Button variant="outlined" color="error" onClick={() => markAll("absent")} disabled={loading}>
                {t("attendance.markAllAbsent")}
              </Button>
              <Button
                variant="outlined"
                startIcon={<TextSnippetIcon />}
                onClick={handleExportMarkdown}
                disabled={loading || !sheet || filteredRows.length === 0}
              >
                {t("attendance.exportMarkdown")}
              </Button>
              <Button
                variant="outlined"
                startIcon={<PictureAsPdfIcon />}
                onClick={() => void handleExportPdf()}
                disabled={loading || exporting === "pdf" || !sheet || filteredRows.length === 0}
              >
                {exporting === "pdf" ? t("common.loading") : t("attendance.exportPdf")}
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
            {sheet?.summary.total === 0 ? t("attendance.noStudents") : t("attendance.noMatch")}
          </Typography>
        </Card>
      ) : (
        <TableContainer component={Card}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t("common.name")}</TableCell>
                <TableCell>{t("common.className")}</TableCell>
                <TableCell>{t("attendance.status")}</TableCell>
                <TableCell>{t("attendance.source")}</TableCell>
                <TableCell>{t("attendance.markedAt")}</TableCell>
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
                      {(Object.keys(STATUS_KEYS) as AttendanceStatus[]).map((status) => (
                        <ToggleButton key={status} value={status}>
                          {t(STATUS_KEYS[status])}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </TableCell>
                  <TableCell>
                    {row.source === "auto" && (
                      <Chip
                        size="small"
                        icon={<CheckCircleIcon />}
                        label={t("attendance.sourceAuto")}
                        color="success"
                        variant="outlined"
                      />
                    )}
                    {row.source === "manual" && (
                      <Chip size="small" label={t("attendance.sourceManual")} variant="outlined" />
                    )}
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
