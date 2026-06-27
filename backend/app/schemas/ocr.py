from pydantic import BaseModel, Field


class NameTagOcrRequest(BaseModel):
    image: str = Field(description="Base64-encoded JPEG image")


class NameTagOcrResponse(BaseModel):
    name: str | None
    class_name: str | None
    confidence: float
    raw_text: str | None
    face_detected: bool
    face_bbox: list[float] | None = None
    ocr_lines: list[str] = Field(default_factory=list)


class NameTagEnrollRequest(BaseModel):
    images: list[str] = Field(min_length=1, description="Base64-encoded JPEG images")
    name: str | None = Field(default=None, min_length=1, max_length=100)
    class_name: str | None = None
    notes: str | None = None
