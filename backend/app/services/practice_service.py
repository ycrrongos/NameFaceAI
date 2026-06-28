import base64
import json
import random
from collections import Counter

from sqlalchemy.orm import Session, joinedload

from app.config import PROJECT_ROOT
from app.models.practice import PracticeAttempt, PracticeSession
from app.models.student import Student
from app.schemas.practice import (
    PracticeAnswerResponse,
    PracticeAttemptRecord,
    PracticeProgress,
    PracticeQuestionResponse,
    PracticeSessionSummary,
)
from app.services.face_service import face_service


def _json_loads(raw: str, default: list | dict | None = None):
    if default is None:
        default = []
    try:
        return json.loads(raw) if raw else default
    except json.JSONDecodeError:
        return default


def _json_dumps(value: list | dict) -> str:
    return json.dumps(value, ensure_ascii=False)


class PracticeService:
    def _eligible_students(self, db: Session, class_name: str | None) -> list[Student]:
        query = (
            db.query(Student)
            .options(joinedload(Student.embeddings))
            .order_by(Student.name)
        )
        if class_name:
            query = query.filter(Student.class_name == class_name)
        students = query.all()
        return [s for s in students if len(s.embeddings) > 0]

    def _student_photo_base64(self, student: Student) -> str | None:
        if not student.embeddings:
            return None
        path_str = student.embeddings[0].source_image_path
        if not path_str:
            return None
        path = PROJECT_ROOT / path_str
        if not path.is_file():
            return None
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        return f"data:image/jpeg;base64,{encoded}"

    def _error_stats(self, db: Session, student_ids: set[int]) -> dict[int, Counter[str]]:
        """target_student_id -> counter of wrongly chosen names."""
        if not student_ids:
            return {}
        rows = (
            db.query(PracticeAttempt)
            .filter(
                PracticeAttempt.is_correct.is_(False),
                PracticeAttempt.target_student_id.in_(student_ids),
            )
            .all()
        )
        stats: dict[int, Counter[str]] = {}
        for row in rows:
            stats.setdefault(row.target_student_id, Counter())[row.chosen_name] += 1
        return stats

    def _student_error_counts(self, db: Session, student_ids: set[int]) -> Counter[int]:
        if not student_ids:
            return Counter()
        rows = (
            db.query(PracticeAttempt.target_student_id)
            .filter(
                PracticeAttempt.is_correct.is_(False),
                PracticeAttempt.target_student_id.in_(student_ids),
            )
            .all()
        )
        return Counter(r[0] for r in rows)

    @staticmethod
    def _name_similarity(a: str, b: str) -> float:
        if a == b:
            return 1.0
        score = 0.0
        if a and b and a[0] == b[0]:
            score += 0.45
        shared = set(a) & set(b)
        score += min(len(shared) * 0.12, 0.36)
        if abs(len(a) - len(b)) <= 1:
            score += 0.1
        return score

    def _face_similarity_map(
        self, db: Session, target: Student, candidates: list[Student]
    ) -> dict[int, float]:
        if not target.embeddings:
            return {}
        target_emb = face_service._bytes_to_embedding(target.embeddings[0].embedding)
        scores: dict[int, float] = {}
        for other in candidates:
            if other.id == target.id or not other.embeddings:
                continue
            other_emb = face_service._bytes_to_embedding(other.embeddings[0].embedding)
            scores[other.id] = face_service.cosine_similarity(target_emb, other_emb)
        return scores

    def _pick_distractors(
        self,
        db: Session,
        target: Student,
        roster: list[Student],
        option_count: int,
        error_stats: dict[int, Counter[str]],
    ) -> list[Student]:
        need = max(1, option_count - 1)
        others = [s for s in roster if s.id != target.id]
        if not others:
            return []

        chosen: list[Student] = []
        chosen_ids: set[int] = set()

        # Prioritize names the teacher previously picked wrongly for this student.
        for wrong_name, _ in error_stats.get(target.id, Counter()).most_common():
            match = next((s for s in others if s.name == wrong_name and s.id not in chosen_ids), None)
            if match:
                chosen.append(match)
                chosen_ids.add(match.id)
            if len(chosen) >= need:
                return chosen[:need]

        face_scores = self._face_similarity_map(db, target, others)
        name_ranked = sorted(
            others,
            key=lambda s: (
                self._name_similarity(target.name, s.name),
                face_scores.get(s.id, 0.0),
            ),
            reverse=True,
        )
        face_ranked = sorted(
            others,
            key=lambda s: face_scores.get(s.id, 0.0),
            reverse=True,
        )

        for source in (face_ranked, name_ranked):
            for student in source:
                if student.id in chosen_ids:
                    continue
                chosen.append(student)
                chosen_ids.add(student.id)
                if len(chosen) >= need:
                    return chosen[:need]

        return chosen[:need]

    def _build_options(
        self,
        db: Session,
        target: Student,
        roster: list[Student],
        error_stats: dict[int, Counter[str]],
    ) -> tuple[list[str], list[str]]:
        option_count = random.randint(2, min(5, len(roster)))
        distractors = self._pick_distractors(db, target, roster, option_count, error_stats)
        options = [target.name] + [s.name for s in distractors]
        random.shuffle(options)
        distractor_names = [s.name for s in distractors]
        return options, distractor_names

    def _adaptation_hint(
        self, target: Student, error_stats: dict[int, Counter[str]], distractor_names: list[str]
    ) -> str | None:
        past = error_stats.get(target.id)
        if not past:
            if distractor_names:
                return "本题加入了长相或姓名相近的同学作为干扰项。"
            return None
        top_wrong, count = past.most_common(1)[0]
        return f"你曾 {count} 次把 TA 认成「{top_wrong}」，这题优先用了相似干扰项。"

    def _progress(
        self,
        db: Session,
        session: PracticeSession,
        pool_ids: set[int],
        mastered_ids: set[int],
    ) -> PracticeProgress:
        queue = _json_loads(session.round_queue, [])
        pending = _json_loads(session.pending_question, None)
        round_answered = (
            db.query(PracticeAttempt)
            .filter(
                PracticeAttempt.session_id == session.id,
                PracticeAttempt.round_number == session.round_number,
            )
            .count()
        )
        round_total = round_answered + len(queue) + (1 if pending else 0)
        return PracticeProgress(
            round=session.round_number,
            round_answered=round_answered,
            round_total=max(round_total, 1),
            mastered=len(mastered_ids),
            remaining=len(queue),
            session_total=len(pool_ids),
        )

    def start_session(self, db: Session, class_name: str | None) -> PracticeSession:
        students = self._eligible_students(db, class_name)
        if len(students) < 2:
            raise ValueError("至少需要 2 名已录入人脸的学生才能开始练习")

        error_counts = self._student_error_counts(db, {s.id for s in students})
        queue = sorted(
            [s.id for s in students],
            key=lambda sid: (error_counts.get(sid, 0), random.random()),
            reverse=True,
        )

        session = PracticeSession(
            class_name=class_name,
            status="active",
            round_number=1,
            mastered_student_ids=_json_dumps([]),
            round_queue=_json_dumps(queue),
            pending_question=None,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    def get_question(self, db: Session, session_id: int) -> PracticeQuestionResponse:
        session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()
        if not session:
            raise LookupError("练习会话不存在")
        if session.status == "completed":
            raise LookupError("本次练习已全部完成")

        roster = self._eligible_students(db, session.class_name)
        roster_by_id = {s.id: s for s in roster}
        pool_ids = set(roster_by_id)
        mastered_ids = set(_json_loads(session.mastered_student_ids, []))

        pending = _json_loads(session.pending_question, None)
        if pending:
            target = roster_by_id.get(pending["target_student_id"])
            if target:
                return PracticeQuestionResponse(
                    session_id=session.id,
                    target_student_id=target.id,
                    photo_base64=self._student_photo_base64(target),
                    options=pending["options"],
                    round=session.round_number,
                    progress=self._progress(db, session, pool_ids, mastered_ids),
                    adaptation_hint=pending.get("adaptation_hint"),
                )

        queue = [sid for sid in _json_loads(session.round_queue, []) if sid in pool_ids]
        queue = [sid for sid in queue if sid not in mastered_ids]
        if not queue:
            self._advance_round(db, session, pool_ids, mastered_ids)
            db.refresh(session)
            if session.status == "completed":
                raise LookupError("本次练习已全部完成")
            queue = _json_loads(session.round_queue, [])

        target_id = queue[0]
        target = roster_by_id[target_id]
        error_stats = self._error_stats(db, pool_ids)
        options, distractor_names = self._build_options(db, target, roster, error_stats)
        hint = self._adaptation_hint(target, error_stats, distractor_names)

        session.pending_question = _json_dumps(
            {
                "target_student_id": target.id,
                "options": options,
                "distractor_names": distractor_names,
                "adaptation_hint": hint,
            }
        )
        db.commit()

        return PracticeQuestionResponse(
            session_id=session.id,
            target_student_id=target.id,
            photo_base64=self._student_photo_base64(target),
            options=options,
            round=session.round_number,
            progress=self._progress(db, session, pool_ids, mastered_ids),
            adaptation_hint=hint,
        )

    def _advance_round(
        self,
        db: Session,
        session: PracticeSession,
        pool_ids: set[int],
        mastered_ids: set[int],
    ) -> None:
        remaining = sorted(pool_ids - mastered_ids)
        if not remaining:
            session.status = "completed"
            session.completed_at = session.completed_at or __import__("datetime").datetime.utcnow()
            session.round_queue = _json_dumps([])
            session.pending_question = None
            return

        error_counts = self._student_error_counts(db, set(remaining))
        queue = sorted(
            remaining,
            key=lambda sid: (error_counts.get(sid, 0), random.random()),
            reverse=True,
        )
        session.round_number += 1
        session.round_queue = _json_dumps(queue)
        session.pending_question = None

    def submit_answer(
        self, db: Session, session_id: int, target_student_id: int, chosen_name: str
    ) -> PracticeAnswerResponse:
        session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()
        if not session:
            raise LookupError("练习会话不存在")
        if session.status == "completed":
            raise LookupError("本次练习已全部完成")

        pending = _json_loads(session.pending_question, None)
        if not pending or pending.get("target_student_id") != target_student_id:
            raise ValueError("题目已过期，请刷新当前题目")

        roster = self._eligible_students(db, session.class_name)
        roster_by_id = {s.id: s for s in roster}
        target = roster_by_id.get(target_student_id)
        if not target:
            raise ValueError("学生不存在")

        pool_ids = set(roster_by_id)
        mastered_ids = set(_json_loads(session.mastered_student_ids, []))
        chosen_name = chosen_name.strip()
        correct = chosen_name == target.name

        db.add(
            PracticeAttempt(
                session_id=session.id,
                round_number=session.round_number,
                target_student_id=target.id,
                chosen_name=chosen_name,
                correct_name=target.name,
                is_correct=correct,
                distractor_names=_json_dumps(pending.get("distractor_names", [])),
            )
        )

        queue = _json_loads(session.round_queue, [])
        if queue and queue[0] == target_student_id:
            queue = queue[1:]
        else:
            queue = [sid for sid in queue if sid != target_student_id]

        if correct:
            mastered_ids.add(target.id)
            session.mastered_student_ids = _json_dumps(sorted(mastered_ids))

        session.round_queue = _json_dumps(queue)
        session.pending_question = None

        round_complete = len(queue) == 0
        if round_complete:
            self._advance_round(db, session, pool_ids, mastered_ids)

        db.commit()
        db.refresh(session)

        feedback = None
        if not correct:
            feedback = f"正确答案：{target.name}"
            if pending.get("distractor_names"):
                similar = "、".join(pending["distractor_names"][:3])
                feedback += f"。本题干扰项：{similar}"

        return PracticeAnswerResponse(
            correct=correct,
            correct_name=target.name,
            chosen_name=chosen_name,
            round_complete=round_complete,
            session_complete=session.status == "completed",
            progress=self._progress(db, session, pool_ids, mastered_ids),
            feedback=feedback,
        )

    def get_summary(self, db: Session, session_id: int) -> PracticeSessionSummary:
        session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()
        if not session:
            raise LookupError("练习会话不存在")

        roster = self._eligible_students(db, session.class_name)
        attempts = (
            db.query(PracticeAttempt)
            .filter(PracticeAttempt.session_id == session_id)
            .order_by(PracticeAttempt.created_at)
            .all()
        )
        roster_by_id = {s.id: s for s in roster}
        records = [
            PracticeAttemptRecord(
                id=a.id,
                round_number=a.round_number,
                target_student_id=a.target_student_id,
                target_name=roster_by_id[a.target_student_id].name
                if a.target_student_id in roster_by_id
                else "?",
                chosen_name=a.chosen_name,
                correct_name=a.correct_name,
                is_correct=a.is_correct,
                created_at=a.created_at,
            )
            for a in attempts
        ]
        mastered = len(_json_loads(session.mastered_student_ids, []))
        wrong_count = sum(1 for a in attempts if not a.is_correct)

        return PracticeSessionSummary(
            id=session.id,
            class_name=session.class_name,
            status=session.status,
            round_number=session.round_number,
            mastered=mastered,
            total_students=len(roster),
            wrong_count=wrong_count,
            attempts=records,
        )


practice_service = PracticeService()
