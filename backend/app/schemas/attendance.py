from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

AttendanceStatus = Literal["present", "absent", "late", "excused"]


class AttendanceRow(BaseModel):
    student_id: int
    name: str
    class_name: str | None
    status: AttendanceStatus | None = None
    source: Literal["manual", "auto"] | None = None
    notes: str | None = None
    marked_at: datetime | None = None


class AttendanceSummary(BaseModel):
    total: int
    present: int
    absent: int
    late: int
    excused: int
    unmarked: int


class AttendanceSheetResponse(BaseModel):
    date: date
    rows: list[AttendanceRow]
    summary: AttendanceSummary


class AttendanceMarkRequest(BaseModel):
    student_id: int
    date: date
    status: AttendanceStatus
    notes: str | None = None


class AttendanceRecordInput(BaseModel):
    student_id: int
    status: AttendanceStatus
    notes: str | None = None


class AttendanceBulkRequest(BaseModel):
    date: date
    records: list[AttendanceRecordInput] = Field(min_length=1)


class AttendanceMarkAllRequest(BaseModel):
    date: date
    status: AttendanceStatus
