from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.practice import (
    PracticeAnswerRequest,
    PracticeAnswerResponse,
    PracticeQuestionResponse,
    PracticeSessionCreate,
    PracticeSessionSummary,
)
from app.services.practice_service import practice_service

router = APIRouter(prefix="/practice", tags=["practice"])


@router.post("/sessions", status_code=201)
def start_practice_session(
    payload: PracticeSessionCreate, db: Session = Depends(get_db)
) -> dict:
    try:
        session = practice_service.start_session(db, payload.class_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"session_id": session.id, "round": session.round_number}


@router.get("/sessions/{session_id}/question", response_model=PracticeQuestionResponse)
def get_practice_question(session_id: int, db: Session = Depends(get_db)) -> PracticeQuestionResponse:
    try:
        return practice_service.get_question(db, session_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/sessions/{session_id}/answer", response_model=PracticeAnswerResponse)
def submit_practice_answer(
    session_id: int, payload: PracticeAnswerRequest, db: Session = Depends(get_db)
) -> PracticeAnswerResponse:
    try:
        return practice_service.submit_answer(
            db, session_id, payload.target_student_id, payload.chosen_name
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/sessions/{session_id}/summary", response_model=PracticeSessionSummary)
def get_practice_summary(session_id: int, db: Session = Depends(get_db)) -> PracticeSessionSummary:
    try:
        return practice_service.get_summary(db, session_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
