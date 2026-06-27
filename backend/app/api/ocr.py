from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.ocr import NameTagEnrollRequest, NameTagOcrRequest, NameTagOcrResponse
from app.schemas.student import StudentResponse
from app.services.face_service import face_service
from app.services.ocr_service import ocr_service

router = APIRouter(prefix="/ocr", tags=["ocr"])


def _to_ocr_response(result) -> NameTagOcrResponse:
    return NameTagOcrResponse(
        name=result.name,
        class_name=result.class_name,
        confidence=result.confidence,
        raw_text=result.raw_text,
        face_detected=result.face_detected,
        face_bbox=result.face_bbox,
        ocr_lines=result.ocr_lines,
    )


@router.post("/name-tag", response_model=NameTagOcrResponse)
def detect_name_tag(payload: NameTagOcrRequest) -> NameTagOcrResponse:
    try:
        result = ocr_service.detect_name_tag_from_base64(payload.image)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"名牌识别失败: {exc}") from exc
    return _to_ocr_response(result)


@router.post("/enroll-nametag", response_model=StudentResponse, status_code=201)
def enroll_from_name_tag(payload: NameTagEnrollRequest, db: Session = Depends(get_db)) -> StudentResponse:
    from app.models.student import Student

    images = [face_service.decode_base64_image(img) for img in payload.images]

    name = payload.name.strip() if payload.name else None
    class_name = payload.class_name
    ocr_confidence = 0.0

    if not name:
        try:
            ocr_result = ocr_service.detect_name_tag(images[0])
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"名牌识别失败: {exc}") from exc

        if not ocr_result.name:
            detail = "未能从名牌识别出姓名"
            if ocr_result.raw_text:
                detail += f"（识别到：{ocr_result.raw_text}）"
            raise HTTPException(status_code=400, detail=detail)

        name = ocr_result.name
        ocr_confidence = ocr_result.confidence
        if not class_name and ocr_result.class_name:
            class_name = ocr_result.class_name

    notes = payload.notes
    if ocr_confidence > 0 and not payload.notes:
        notes = f"名牌 OCR 置信度 {ocr_confidence:.0%}"

    student = Student(name=name, class_name=class_name, notes=notes)
    db.add(student)
    db.commit()
    db.refresh(student)

    count = face_service.enroll(db, student.id, images)
    if count == 0:
        db.delete(student)
        db.commit()
        raise HTTPException(status_code=400, detail="未检测到有效人脸，请重新拍照")

    db.refresh(student)
    return StudentResponse(
        id=student.id,
        name=student.name,
        class_name=student.class_name,
        notes=student.notes,
        created_at=student.created_at,
        face_count=len(student.embeddings),
    )
