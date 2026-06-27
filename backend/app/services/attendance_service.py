from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.student import Student
from app.schemas.attendance import AttendanceRow, AttendanceSheetResponse, AttendanceSummary


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
        attendance_date: date,
        status: str,
        source: str = "manual",
        notes: str | None = None,
    ) -> Attendance:
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

    def try_auto_mark_present(self, db: Session, student_id: int) -> bool:
        today = date.today()
        record = (
            db.query(Attendance)
            .filter(
                Attendance.student_id == student_id,
                Attendance.attendance_date == today,
            )
            .first()
        )
        if record and record.source == "manual":
            return False
        if record and record.status == "present":
            return False

        self.upsert(db, student_id, today, "present", source="auto")
        return True


attendance_service = AttendanceService()
