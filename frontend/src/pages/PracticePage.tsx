import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import QuizIcon from "@mui/icons-material/Quiz";
import ReplayIcon from "@mui/icons-material/Replay";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type PracticeAnswerResponse,
  type PracticeProgress,
  type PracticeQuestion,
  type PracticeSessionSummary,
  type Student,
} from "../api/client";

type Phase = "setup" | "question" | "feedback" | "complete";

export function PracticePage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classFilter, setClassFilter] = useState("");
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [progress, setProgress] = useState<PracticeProgress | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [lastResult, setLastResult] = useState<PracticeAnswerResponse | null>(null);
  const [summary, setSummary] = useState<PracticeSessionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listStudents()
      .then(setStudents)
      .catch((e) => setError(e instanceof Error ? e.message : "加载学生失败"))
      .finally(() => setLoadingStudents(false));
  }, []);

  const classOptions = useMemo(() => {
    return [...new Set(students.map((s) => s.class_name).filter(Boolean))] as string[];
  }, [students]);

  const eligibleCount = useMemo(() => {
    const list = classFilter
      ? students.filter((s) => s.class_name === classFilter)
      : students;
    return list.filter((s) => s.face_count > 0).length;
  }, [students, classFilter]);

  const loadQuestion = useCallback(async (sid: number) => {
    const q = await api.getPracticeQuestion(sid);
    setQuestion(q);
    setProgress(q.progress);
    setPhase("question");
    setLastResult(null);
  }, []);

  const startPractice = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { session_id } = await api.startPracticeSession({
        class_name: classFilter || undefined,
      });
      setSessionId(session_id);
      await loadQuestion(session_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法开始练习");
    } finally {
      setBusy(false);
    }
  }, [classFilter, loadQuestion]);

  const submitAnswer = useCallback(
    async (chosenName: string) => {
      if (!sessionId || !question || busy) return;
      setBusy(true);
      setError(null);
      try {
        const result = await api.submitPracticeAnswer(sessionId, {
          target_student_id: question.target_student_id,
          chosen_name: chosenName,
        });
        setLastResult(result);
        setProgress(result.progress);
        setPhase("feedback");

        if (result.session_complete) {
          const s = await api.getPracticeSummary(sessionId);
          setSummary(s);
          setPhase("complete");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "提交失败");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, question, busy]
  );

  const nextQuestion = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      await loadQuestion(sessionId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载题目失败";
      if (msg.includes("已全部完成")) {
        const s = await api.getPracticeSummary(sessionId);
        setSummary(s);
        setPhase("complete");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [sessionId, loadQuestion]);

  const reset = () => {
    setSessionId(null);
    setQuestion(null);
    setProgress(null);
    setLastResult(null);
    setSummary(null);
    setPhase("setup");
    setError(null);
  };

  if (loadingStudents) {
    return (
      <Stack alignItems="center" py={6}>
        <CircularProgress />
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <QuizIcon color="primary" />
          记名练习
        </Typography>
        <Typography variant="body2" color="text.secondary">
          看学生照片选名字。每题 2–5 个选项（含正确答案），会混入长相或姓名相近的同学。答错会记录，下一轮优先考易错的同学和干扰项。
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {phase === "setup" && (
        <Card>
          <CardContent>
            <Stack spacing={2.5}>
              <FormControl fullWidth>
                <InputLabel>班级筛选（可选）</InputLabel>
                <Select
                  label="班级筛选（可选）"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <MenuItem value="">全部学生</MenuItem>
                  {classOptions.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="body2" color="text.secondary">
                可练习 {eligibleCount} 人（需已录入人脸，且至少 2 人）
              </Typography>
              <Button
                variant="contained"
                size="large"
                disabled={eligibleCount < 2 || busy}
                onClick={startPractice}
              >
                开始练习
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {(phase === "question" || phase === "feedback") && question && progress && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`第 ${progress.round} 轮`} color="primary" variant="outlined" />
            <Chip label={`本轮 ${progress.round_answered}/${progress.round_total}`} />
            <Chip label={`已掌握 ${progress.mastered}/${progress.session_total}`} color="success" variant="outlined" />
          </Stack>

          {question.adaptation_hint && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              {question.adaptation_hint}
            </Alert>
          )}

          <Card>
            <CardContent>
              <Stack spacing={2.5} alignItems="center">
                <Box
                  sx={{
                    width: "100%",
                    maxWidth: 320,
                    aspectRatio: "3/4",
                    borderRadius: 3,
                    overflow: "hidden",
                    bgcolor: "#111",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {question.photo_base64 ? (
                    <Box
                      component="img"
                      src={question.photo_base64}
                      alt="学生照片"
                      sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <Typography color="grey.500">暂无照片</Typography>
                  )}
                </Box>

                {phase === "feedback" && lastResult && (
                  <Alert
                    severity={lastResult.correct ? "success" : "error"}
                    icon={lastResult.correct ? <CheckCircleIcon /> : <CancelIcon />}
                    sx={{ width: "100%" }}
                  >
                    {lastResult.correct
                      ? "回答正确！该同学本轮已掌握，后续轮次不再出现。"
                      : lastResult.feedback ?? `正确答案：${lastResult.correct_name}`}
                  </Alert>
                )}

                <Stack spacing={1.5} sx={{ width: "100%" }}>
                  {question.options.map((name) => {
                    const answered = phase === "feedback" && lastResult;
                    const isChosen = answered && lastResult.chosen_name === name;
                    const isCorrect = answered && lastResult.correct_name === name;
                    let color: "primary" | "success" | "error" | "inherit" = "primary";
                    if (answered) {
                      if (isCorrect) color = "success";
                      else if (isChosen) color = "error";
                      else color = "inherit";
                    }

                    return (
                      <Button
                        key={name}
                        variant={answered && (isChosen || isCorrect) ? "contained" : "outlined"}
                        color={color}
                        size="large"
                        disabled={phase !== "question" || busy}
                        onClick={() => submitAnswer(name)}
                        sx={{ justifyContent: "center", py: 1.5 }}
                      >
                        {name}
                      </Button>
                    );
                  })}
                </Stack>

                {phase === "feedback" && !lastResult?.session_complete && (
                  <Button variant="contained" onClick={nextQuestion} disabled={busy}>
                    下一题
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      )}

      {phase === "complete" && summary && (
        <Card>
          <CardContent>
            <Stack spacing={2} alignItems="flex-start">
              <Alert severity="success" sx={{ width: "100%" }}>
                练习完成！共 {summary.total_students} 人，掌握 {summary.mastered} 人，答错{" "}
                {summary.wrong_count} 次。
              </Alert>
              {summary.wrong_count > 0 && (
                <Box sx={{ width: "100%" }}>
                  <Typography variant="subtitle2" gutterBottom>
                    错题记录
                  </Typography>
                  <Stack spacing={0.5}>
                    {summary.attempts
                      .filter((a) => !a.is_correct)
                      .map((a) => (
                        <Typography key={a.id} variant="body2" color="text.secondary">
                          第 {a.round_number} 轮：把「{a.target_name}」选成了「{a.chosen_name}」
                        </Typography>
                      ))}
                  </Stack>
                </Box>
              )}
              <Button startIcon={<ReplayIcon />} variant="outlined" onClick={reset}>
                再来一轮
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
