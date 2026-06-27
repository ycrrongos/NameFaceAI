from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.student import Student
from app.schemas.attendance import AttendanceRow, AttendanceSheetResponse, AttendanceSummary


@dataclass
class CheckInResult:
    checked_in: bool
    newly_marked: bool
    source: str | None = None


class AttendanceService:
    def get_sheet(
        self, db: Session, attendance_date: date, class_name: str | None = None
    ) -> AttendanceSheetResponse:
        student_query = db.query(Student).order_by(Student.class_name.nulls_last(), Student.name)
        if class_name:
            student_query = student_query.filter(Student.class_name == class_name)
        students = student_query.all()

        records = {
            row.student_id: row
            for row in db.query(Attendance).filter(Attendance.attendance_date == attendance_date).all()
        }

        rows: list[AttendanceRow] = []
        summary = AttendanceSummary(
            total=len(students), present=0, absent=0, late=0, excused=0, unmarked=0
        )

        for student in students:
            record = records.get(student.id)
            if record is None:
                summary.unmarked += 1
                rows.append(
                    AttendanceRow(
                        student_id=student.id,
                        name=student.name,
                        class_name=student.class_name,
                    )
                )
                continue

            summary_field = record.status
            if summary_field == "present":
                summary.present += 1
            elif summary_field == "absent":
                summary.absent += 1
            elif summary_field == "late":
                summary.late += 1
            elif summary_field == "excused":
                summary.excused += 1

            rows.append(
                AttendanceRow(
                    student_id=student.id,
                    name=student.name,
                    class_name=student.class_name,
                    status=record.status,  # type: ignore[arg-type]
                    source=record.source,  # type: ignore[arg-type]
                    notes=record.notes,
                    marked_at=record.marked_at,
                )
            )

        return AttendanceSheetResponse(date=attendance_date, rows=rows, summary=summary)

    def upsert(
        self,
        db: Session,
        student_id: int,
        attendance_date,
        status: str,
        source: str = "manual",
        notes: str | None = None,
    ) -> Attendance:
        from datetime import datetime

        record = (
            db.query(Attendance)
            .filter(
                Attendance.student_id == student_id,
                Attendance.attendance_date == attendance_date,
            )
            .first()
        )
        now = datetime.utcnow()
        if record:
            record.status = status
            record.source = source
            record.notes = notes
            record.marked_at = now
            record.updated_at = now
        else:
            record = Attendance(
                student_id=student_id,
                attendance_date=attendance_date,
                status=status,
                source=source,
                notes=notes,
                marked_at=now,
                updated_at=now,
            )
            db.add(record)
        db.commit()
        db.refresh(record)
        return record

    def mark_all(
        self, db: Session, attendance_date: date, status: str, class_name: str | None = None
    ) -> int:
        student_query = db.query(Student)
        if class_name:
            student_query = student_query.filter(Student.class_name == class_name)
        students = student_query.all()

        count = 0
        for student in students:
            self.upsert(db, student.id, attendance_date, status, source="manual")
            count += 1
        return count

    def _today_record(self, db: Session, student_id: int) -> Attendance | None:
        return (
            db.query(Attendance)
            .filter(
                Attendance.student_id == student_id,
                Attendance.attendance_date == date.today(),
            )
            .first()
        )

    def get_checkin_status(self, db: Session, student_id: int) -> CheckInResult:
        record = self._today_record(db, student_id)
        if record and record.status == "present":
            return CheckInResult(checked_in=True, newly_marked=False, source=record.source)
        return CheckInResult(checked_in=False, newly_marked=False, source=record.source if record else None)

    def process_auto_checkin(self, db: Session, student_id: int) -> CheckInResult:
        record = self._today_record(db, student_id)
        if record and record.source == "manual" and record.status != "present":
            return CheckInResult(checked_in=False, newly_marked=False, source="manual")
        if record and record.status == "present":
            return CheckInResult(checked_in=True, newly_marked=False, source=record.source)

        self.upsert(db, student_id, date.today(), "present", source="auto")
        return CheckInResult(checked_in=True, newly_marked=True, source="auto")

    def try_auto_mark_present(self, db: Session, student_id: int) -> bool:
        return self.process_auto_checkin(db, student_id).newly_marked


attendance_service = AttendanceService()
