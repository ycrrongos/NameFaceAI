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


class RecognizeResponse(BaseModel):
    faces: list[FaceMatch]
    inference_ms: float


class HealthResponse(BaseModel):
    status: str
    gpu: bool
    provider: str
    inference_ms: float | None
    model_loaded: bool
    llm_provider: str | None


class LLMChatRequest(BaseModel):
    messages: list[dict[str, str]]


class LLMChatResponse(BaseModel):
    reply: str
    provider: str
