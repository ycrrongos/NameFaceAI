from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    round_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    mastered_student_ids: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    round_queue: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    pending_question: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    attempts: Mapped[list["PracticeAttempt"]] = relationship(
        "PracticeAttempt", back_populates="session", cascade="all, delete-orphan"
    )


class PracticeAttempt(Base):
    __tablename__ = "practice_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("practice_sessions.id"), nullable=False)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    target_student_id: Mapped[int] = mapped_column(Integer, ForeignKey("students.id"), nullable=False)
    chosen_name: Mapped[str] = mapped_column(String(100), nullable=False)
    correct_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    distractor_names: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["PracticeSession"] = relationship("PracticeSession", back_populates="attempts")
