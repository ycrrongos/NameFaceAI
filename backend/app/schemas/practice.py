from datetime import datetime

from pydantic import BaseModel, Field


class PracticeSessionCreate(BaseModel):
    class_name: str | None = None


class PracticeProgress(BaseModel):
    round: int
    round_answered: int
    round_total: int
    mastered: int
    remaining: int
    session_total: int


class PracticeQuestionResponse(BaseModel):
    session_id: int
    target_student_id: int
    photo_base64: str | None
    options: list[str] = Field(min_length=2, max_length=5)
    round: int
    progress: PracticeProgress
    adaptation_hint: str | None = None


class PracticeAnswerRequest(BaseModel):
    target_student_id: int
    chosen_name: str


class PracticeAnswerResponse(BaseModel):
    correct: bool
    correct_name: str
    chosen_name: str
    round_complete: bool
    session_complete: bool
    progress: PracticeProgress
    feedback: str | None = None


class PracticeAttemptRecord(BaseModel):
    id: int
    round_number: int
    target_student_id: int
    target_name: str
    chosen_name: str
    correct_name: str
    is_correct: bool
    created_at: datetime


class PracticeSessionSummary(BaseModel):
    id: int
    class_name: str | None
    status: str
    round_number: int
    mastered: int
    total_students: int
    wrong_count: int
    attempts: list[PracticeAttemptRecord]
