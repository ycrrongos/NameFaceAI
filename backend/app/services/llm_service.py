from typing import Protocol

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.student import Student


class LLMProvider(Protocol):
    async def chat(self, messages: list[dict[str, str]]) -> str: ...


class DashScopeProvider:
    async def chat(self, messages: list[dict[str, str]]) -> str:
        if not settings.dashscope_api_key:
            raise RuntimeError("DASHSCOPE_API_KEY 未配置")

        payload = {
            "model": settings.dashscope_model,
            "messages": messages,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.dashscope_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]


class DeepSeekProvider:
    async def chat(self, messages: list[dict[str, str]]) -> str:
        if not settings.deepseek_api_key:
            raise RuntimeError("DEEPSEEK_API_KEY 未配置")

        payload = {
            "model": settings.deepseek_model,
            "messages": messages,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.deepseek_base_url.rstrip('/')}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.deepseek_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]


class OpenAIProvider:
    async def chat(self, messages: list[dict[str, str]]) -> str:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY 未配置")

        payload = {
            "model": settings.openai_model,
            "messages": messages,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.openai_base_url.rstrip('/')}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]


class OllamaProvider:
    async def chat(self, messages: list[dict[str, str]]) -> str:
        payload = {
            "model": settings.ollama_model,
            "messages": messages,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{settings.ollama_base_url.rstrip('/')}/api/chat",
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["message"]["content"]


def build_student_context(db: Session) -> str:
    students = db.query(Student).all()
    if not students:
        return "当前没有录入任何学生。"

    lines = ["当前学生档案："]
    for s in students:
        face_count = len(s.embeddings)
        line = f"- ID={s.id} 姓名={s.name}"
        if s.class_name:
            line += f" 班级={s.class_name}"
        line += f" 已录入人脸={face_count}张"
        if s.notes:
            line += f" 备注={s.notes}"
        lines.append(line)
    return "\n".join(lines)


def get_llm_provider() -> LLMProvider | None:
    provider = settings.llm_provider.lower().strip()
    if provider == "dashscope":
        return DashScopeProvider()
    if provider == "deepseek":
        return DeepSeekProvider()
    if provider == "openai":
        return OpenAIProvider()
    if provider == "ollama":
        return OllamaProvider()
    return None


class LLMService:
    async def chat(self, db: Session, messages: list[dict[str, str]]) -> tuple[str, str]:
        provider = get_llm_provider()
        if provider is None:
            raise RuntimeError(
                "LLM 未配置。请在 .env 中设置 LLM_PROVIDER=dashscope|deepseek|openai|ollama"
            )

        context = build_student_context(db)
        system_msg = {
            "role": "system",
            "content": (
                "你是 NameFaceAI 教学助手，帮助教师记住学生姓名、整理档案、生成记忆口诀。"
                "请基于以下学生档案回答问题，不要编造不存在的学生。\n\n"
                f"{context}"
            ),
        }
        full_messages = [system_msg, *messages]
        reply = await provider.chat(full_messages)
        return reply, settings.llm_provider


llm_service = LLMService()
