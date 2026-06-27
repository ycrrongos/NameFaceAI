from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.student import Student
from app.schemas.attendance import (
    AttendanceBulkRequest,
    AttendanceMarkAllRequest,
    AttendanceMarkRequest,
    AttendanceSheetResponse,
)
from app.services.attendance_service import attendance_service

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.get("", response_model=AttendanceSheetResponse)
def get_attendance_sheet(
    attendance_date: date = Query(alias="date"),
    class_name: str | None = None,
    db: Session = Depends(get_db),
) -> AttendanceSheetResponse:
    return attendance_service.get_sheet(db, attendance_date, class_name)


@router.post("/mark", response_model=AttendanceSheetResponse)
def mark_attendance(payload: AttendanceMarkRequest, db: Session = Depends(get_db)) -> AttendanceSheetResponse:
    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="学生不存在")

    attendance_service.upsert(
        db,
        payload.student_id,
        payload.date,
        payload.status,
        source="manual",
        notes=payload.notes,
    )
    return attendance_service.get_sheet(db, payload.date)


@router.put("/bulk", response_model=AttendanceSheetResponse)
def bulk_mark_attendance(payload: AttendanceBulkRequest, db: Session = Depends(get_db)) -> AttendanceSheetResponse:
    for record in payload.records:
        student = db.query(Student).filter(Student.id == record.student_id).first()
        if not student:
            raise HTTPException(status_code=404, detail=f"学生不存在: {record.student_id}")
        attendance_service.upsert(
            db,
            record.student_id,
            payload.date,
            record.status,
            source="manual",
            notes=record.notes,
        )
    return attendance_service.get_sheet(db, payload.date)


@router.post("/mark-all", response_model=AttendanceSheetResponse)
def mark_all_attendance(
    payload: AttendanceMarkAllRequest, db: Session = Depends(get_db)
) -> AttendanceSheetResponse:
    attendance_service.mark_all(db, payload.date, payload.status)
    return attendance_service.get_sheet(db, payload.date)
