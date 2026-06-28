from datetime import datetime

from pydantic import BaseModel, Field


class StudentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    class_name: str | None = None
    notes: str | None = None


class StudentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    class_name: str | None = None
    notes: str | None = None


class StudentResponse(BaseModel):
    id: int
    name: str
    class_name: str | None
    notes: str | None
    created_at: datetime
    face_count: int = 0

    model_config = {"from_attributes": True}


class EnrollRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    class_name: str | None = None
    notes: str | None = None
    images: list[str] = Field(min_length=1, description="Base64-encoded JPEG images")


class FaceMatch(BaseModel):
    bbox: list[float]
    name: str
    student_id: int | None
    confidence: float


class AttendanceCheckIn(BaseModel):
    student_id: int
    name: str
    checked_in: bool
    newly_marked: bool
    source: str | None = None


class RecognizeResponse(BaseModel):
    faces: list[FaceMatch]
    inference_ms: float
    attendance: list[AttendanceCheckIn] = []
    frame_width: int | None = None
    frame_height: int | None = None


class HealthResponse(BaseModel):
    status: str
    service_id: str = "nameface-ai"
    gpu: bool
    accelerator: str  # gpu | igpu | cpu
    accelerator_label: str
    accelerator_note: str | None = None
    provider: str
    inference_ms: float | None
    model_loaded: bool
    face_model_name: str | None = None
    face_det_size: int | None = None
    llm_provider: str | None


class LLMChatRequest(BaseModel):
    messages: list[dict[str, str]]


class LLMChatResponse(BaseModel):
    reply: str
    provider: str
