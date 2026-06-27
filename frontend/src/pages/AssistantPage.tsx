import SendIcon from "@mui/icons-material/Send";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import {
  Alert,
  Box,
  Card,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "帮我为每位学生生成一个姓名记忆口诀",
  "列出还没有录入人脸的学生",
  "总结一下当前班级学生情况",
];

export function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [llmAvailable, setLlmAvailable] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.health().then((h) => setLlmAvailable(h.llm_provider));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const resp = await api.chat(next.map((m) => ({ role: m.role, content: m.content })));
      setMessages([...next, { role: "assistant", content: resp.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ height: { md: "calc(100vh - 160px)" }, minHeight: 480 }}>
      {!llmAvailable && (
        <Alert severity="info" sx={{ borderRadius: 3 }}>
          LLM 未配置。在 <code>backend/.env</code> 中设置{" "}
          <code>LLM_PROVIDER=dashscope|deepseek|ollama</code>
        </Alert>
      )}

      {llmAvailable && (
        <Chip icon={<SmartToyOutlinedIcon />} label={`Provider: ${llmAvailable}`} variant="outlined" sx={{ alignSelf: "flex-start" }} />
      )}

      <Card sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 360 }}>
        <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
          {messages.length === 0 && (
            <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                试试这些问题：
              </Typography>
              {SUGGESTIONS.map((s) => (
                <Chip key={s} label={s} onClick={() => send(s)} clickable variant="outlined" sx={{ height: "auto", py: 1, "& .MuiChip-label": { whiteSpace: "normal" } }} />
              ))}
            </Stack>
          )}

          <Stack spacing={1.5}>
            {messages.map((m, i) => (
              <Box key={i} sx={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <Paper
                  elevation={0}
                  sx={{
                    px: 2,
                    py: 1.5,
                    maxWidth: "85%",
                    borderRadius: m.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                    bgcolor: m.role === "user" ? "primary.main" : "secondary.light",
                    color: m.role === "user" ? "primary.contrastText" : "text.primary",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <Typography variant="body1">{m.content}</Typography>
                </Paper>
              </Box>
            ))}
            {loading && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  思考中…
                </Typography>
              </Box>
            )}
            <div ref={bottomRef} />
          </Stack>
        </Box>

        {error && (
          <Box sx={{ px: 2 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}

        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          sx={{ p: 2, borderTop: 1, borderColor: "divider", display: "flex", gap: 1 }}
        >
          <TextField
            fullWidth
            placeholder="输入问题，如：帮我记住张三的脸…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            size="small"
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 6 } }}
          />
          <IconButton type="submit" color="primary" disabled={loading || !input.trim()} sx={{ bgcolor: "primary.main", color: "#fff", "&:hover": { bgcolor: "primary.dark" }, "&.Mui-disabled": { bgcolor: "action.disabledBackground" } }}>
            <SendIcon />
          </IconButton>
        </Box>
      </Card>
    </Stack>
  );
}
