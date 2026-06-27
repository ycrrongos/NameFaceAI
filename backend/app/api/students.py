from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.student import FaceEmbedding, Student
from app.schemas.student import EnrollRequest, StudentCreate, StudentResponse, StudentUpdate
from app.services.face_service import face_service

router = APIRouter(prefix="/students", tags=["students"])


def _to_response(student: Student) -> StudentResponse:
    return StudentResponse(
        id=student.id,
        name=student.name,
        class_name=student.class_name,
        notes=student.notes,
        created_at=student.created_at,
        face_count=len(student.embeddings),
    )


@router.get("", response_model=list[StudentResponse])
def list_students(db: Session = Depends(get_db)) -> list[StudentResponse]:
    students = db.query(Student).order_by(Student.created_at.desc()).all()
    return [_to_response(s) for s in students]


@router.get("/{student_id}", response_model=StudentResponse)
def get_student(student_id: int, db: Session = Depends(get_db)) -> StudentResponse:
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="学生不存在")
    return _to_response(student)


@router.post("", response_model=StudentResponse, status_code=201)
def create_student(payload: StudentCreate, db: Session = Depends(get_db)) -> StudentResponse:
    student = Student(name=payload.name, class_name=payload.class_name, notes=payload.notes)
    db.add(student)
    db.commit()
    db.refresh(student)
    return _to_response(student)


@router.post("/enroll", response_model=StudentResponse, status_code=201)
def enroll_student(payload: EnrollRequest, db: Session = Depends(get_db)) -> StudentResponse:
    student = Student(name=payload.name, class_name=payload.class_name, notes=payload.notes)
    db.add(student)
    db.commit()
    db.refresh(student)

    images = [face_service.decode_base64_image(img) for img in payload.images]
    count = face_service.enroll(db, student.id, images)
    if count == 0:
        db.delete(student)
        db.commit()
        raise HTTPException(status_code=400, detail="未检测到有效人脸，请重新拍照")

    db.refresh(student)
    return _to_response(student)


@router.post("/{student_id}/enroll", response_model=StudentResponse)
def reenroll_student(
    student_id: int, payload: EnrollRequest, db: Session = Depends(get_db)
) -> StudentResponse:
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="学生不存在")

    if payload.name:
        student.name = payload.name
    if payload.class_name is not None:
        student.class_name = payload.class_name
    if payload.notes is not None:
        student.notes = payload.notes

    db.query(FaceEmbedding).filter(FaceEmbedding.student_id == student_id).delete()
    images = [face_service.decode_base64_image(img) for img in payload.images]
    count = face_service.enroll(db, student.id, images)
    if count == 0:
        raise HTTPException(status_code=400, detail="未检测到有效人脸，请重新拍照")

    db.commit()
    db.refresh(student)
    return _to_response(student)


@router.put("/{student_id}", response_model=StudentResponse)
def update_student(
    student_id: int, payload: StudentUpdate, db: Session = Depends(get_db)
) -> StudentResponse:
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="学生不存在")

    if payload.name is not None:
        student.name = payload.name
    if payload.class_name is not None:
        student.class_name = payload.class_name
    if payload.notes is not None:
        student.notes = payload.notes

    db.commit()
    db.refresh(student)
    return _to_response(student)


@router.delete("/{student_id}", status_code=204)
def delete_student(student_id: int, db: Session = Depends(get_db)) -> None:
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="学生不存在")
    db.delete(student)
    db.commit()
