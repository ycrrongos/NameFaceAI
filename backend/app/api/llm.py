from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.student import LLMChatRequest, LLMChatResponse
from app.services.llm_service import llm_service

router = APIRouter(prefix="/llm", tags=["llm"])


@router.post("/chat", response_model=LLMChatResponse)
async def chat(payload: LLMChatRequest, db: Session = Depends(get_db)) -> LLMChatResponse:
    try:
        reply, provider = await llm_service.chat(db, payload.messages)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM 调用失败: {exc}") from exc

    return LLMChatResponse(reply=reply, provider=provider)
