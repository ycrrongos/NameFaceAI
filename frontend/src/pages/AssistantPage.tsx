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
    api.health().then((h) => {
      setLlmAvailable(h.llm_provider);
    });
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
      const resp = await api.chat(
        next.map((m) => ({ role: m.role, content: m.content }))
      );
      setMessages([...next, { role: "assistant", content: resp.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page assistant-page">
      <header className="page-header">
        <h1>AI 助手</h1>
        <p className="subtitle">
          {llmAvailable
            ? `当前 Provider: ${llmAvailable}`
            : "LLM 未配置 — 请在 backend/.env 中设置 LLM_PROVIDER"}
        </p>
      </header>

      {!llmAvailable && (
        <div className="info-box">
          <p>支持以下配置（任选其一）：</p>
          <ul>
            <li><code>LLM_PROVIDER=dashscope</code> + <code>DASHSCOPE_API_KEY</code></li>
            <li><code>LLM_PROVIDER=deepseek</code> + <code>DEEPSEEK_API_KEY</code></li>
            <li><code>LLM_PROVIDER=ollama</code> + 本地 Ollama（如 qwen2.5:7b）</li>
          </ul>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="btn btn-suggestion" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="chat-bubble assistant">思考中…</div>}
        <div ref={bottomRef} />
      </div>

      {error && <p className="error">{error}</p>}

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入问题，如：帮我记住张三的脸…"
          disabled={loading}
        />
        <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
          发送
        </button>
      </form>
    </div>
  );
}
