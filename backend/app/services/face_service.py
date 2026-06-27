from dataclasses import dataclass

import cv2
import numpy as np
import onnxruntime as ort
from insightface.app import FaceAnalysis
from sqlalchemy.orm import Session

from app.config import FACES_DIR, PROJECT_ROOT, settings


@dataclass
class FaceResult:
    bbox: list[float]
    embedding: np.ndarray


@dataclass
class MatchResult:
    bbox: list[float]
    name: str
    student_id: int | None
    confidence: float


class FaceService:
    def __init__(self) -> None:
        self._app: FaceAnalysis | None = None
        self.provider = "CPUExecutionProvider"
        self.gpu = False
        self._last_inference_ms: float | None = None

    @property
    def model_loaded(self) -> bool:
        return self._app is not None

    def load_model(self) -> None:
        if self._app is not None:
            return

        available = ort.get_available_providers()
        providers: list[str] = []
        if "CUDAExecutionProvider" in available:
            providers.append("CUDAExecutionProvider")
            self.gpu = True
            self.provider = "CUDAExecutionProvider"
        providers.append("CPUExecutionProvider")
        if not self.gpu:
            self.provider = "CPUExecutionProvider"

        ctx_id = 0 if self.gpu else -1
        self._app = FaceAnalysis(name="buffalo_l", providers=providers)
        self._app.prepare(ctx_id=ctx_id, det_size=(640, 640))

    def decode_image(self, data: bytes) -> np.ndarray:
        arr = np.frombuffer(data, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Invalid image data")
        return image

    def decode_base64_image(self, b64: str) -> np.ndarray:
        import base64

        if "," in b64:
            b64 = b64.split(",", 1)[1]
        data = base64.b64decode(b64)
        return self.decode_image(data)

    def detect_and_embed(self, image: np.ndarray) -> list[FaceResult]:
        if self._app is None:
            self.load_model()

        import time

        start = time.perf_counter()
        faces = self._app.get(image)
        self._last_inference_ms = (time.perf_counter() - start) * 1000

        results: list[FaceResult] = []
        for face in faces:
            bbox = face.bbox.astype(float).tolist()
            results.append(FaceResult(bbox=bbox, embedding=face.normed_embedding.copy()))
        return results

    @staticmethod
    def _embedding_to_bytes(embedding: np.ndarray) -> bytes:
        return embedding.astype(np.float32).tobytes()

    @staticmethod
    def _bytes_to_embedding(data: bytes) -> np.ndarray:
        return np.frombuffer(data, dtype=np.float32)

    @staticmethod
    def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        return float(np.dot(a, b))

    def enroll(self, db: Session, student_id: int, images: list[np.ndarray]) -> int:
        from app.models.student import FaceEmbedding

        count = 0
        student_dir = FACES_DIR / str(student_id)
        student_dir.mkdir(parents=True, exist_ok=True)

        for idx, image in enumerate(images):
            faces = self.detect_and_embed(image)
            if not faces:
                continue
            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
            image_path = student_dir / f"enroll_{idx}.jpg"
            cv2.imwrite(str(image_path), image)
            db.add(
                FaceEmbedding(
                    student_id=student_id,
                    embedding=self._embedding_to_bytes(face.embedding),
                    source_image_path=str(image_path.relative_to(PROJECT_ROOT)),
                )
            )
            count += 1

        db.commit()
        return count

    def recognize(self, db: Session, image: np.ndarray) -> tuple[list[MatchResult], float]:
        from app.models.student import FaceEmbedding, Student

        faces = self.detect_and_embed(image)
        inference_ms = self._last_inference_ms or 0.0

        rows = (
            db.query(FaceEmbedding, Student)
            .join(Student, FaceEmbedding.student_id == Student.id)
            .all()
        )

        known: list[tuple[int, str, np.ndarray]] = [
            (student.id, student.name, self._bytes_to_embedding(row.embedding))
            for row, student in rows
        ]

        matches: list[MatchResult] = []
        for face in faces:
            best_id: int | None = None
            best_name = "未知"
            best_score = 0.0

            for student_id, name, embedding in known:
                score = self.cosine_similarity(face.embedding, embedding)
                if score > best_score:
                    best_score = score
                    best_id = student_id
                    best_name = name

            if best_score >= settings.face_match_threshold:
                matches.append(
                    MatchResult(
                        bbox=face.bbox,
                        name=best_name,
                        student_id=best_id,
                        confidence=best_score,
                    )
                )
            else:
                matches.append(
                    MatchResult(
                        bbox=face.bbox,
                        name="未知",
                        student_id=None,
                        confidence=best_score,
                    )
                )

        return matches, inference_ms


face_service = FaceService()
