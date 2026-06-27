import threading
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from insightface.app import FaceAnalysis
from insightface.utils import ensure_available
from sqlalchemy.orm import Session

from app.config import FACES_DIR, PROJECT_ROOT, settings

# Discrete GPU → integrated GPU → CPU
_PROVIDER_PRIORITY: list[tuple[str, str]] = [
    ("CUDAExecutionProvider", "gpu"),  # NVIDIA discrete
    ("ROCMExecutionProvider", "gpu"),  # AMD discrete
    ("OpenVINOExecutionProvider", "igpu"),  # Intel integrated
    ("DmlExecutionProvider", "igpu"),  # Windows GPU (integrated or discrete)
]


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
        self._loaded_key: tuple[str, int, float] | None = None
        self._lock = threading.RLock()
        self.provider = "CPUExecutionProvider"
        self.accelerator = "cpu"  # gpu | igpu | cpu
        self.gpu = False
        self._last_inference_ms: float | None = None

    @property
    def model_loaded(self) -> bool:
        return self._app is not None

    @staticmethod
    def _ensure_model_pack(name: str) -> None:
        """Fix nested antelopev2.zip layout (models/antelopev2/antelopev2/*.onnx)."""
        model_dir = Path(ensure_available("models", name, root="~/.insightface")).resolve()
        nested = model_dir / name
        if not nested.is_dir():
            return
        if any(model_dir.glob("*.onnx")):
            return
        for item in nested.iterdir():
            target = model_dir / item.name
            if not target.exists():
                item.rename(target)
        try:
            nested.rmdir()
        except OSError:
            pass

    def _model_key(self) -> tuple[str, int, float]:
        return (settings.face_model_name, settings.face_det_size, settings.face_det_thresh)

    def _try_load_with_provider(self, provider: str) -> bool:
        if provider == "CPUExecutionProvider":
            providers = ["CPUExecutionProvider"]
            ctx_id = -1
        else:
            providers = [provider, "CPUExecutionProvider"]
            ctx_id = 0

        try:
            self._ensure_model_pack(settings.face_model_name)
            app = FaceAnalysis(
                name=settings.face_model_name,
                providers=providers,
                allowed_modules=["detection", "recognition"],
            )
            det = settings.face_det_size
            app.prepare(
                ctx_id=ctx_id,
                det_size=(det, det),
                det_thresh=settings.face_det_thresh,
            )
            active = app.models["detection"].session.get_providers()[0]
            if active != provider:
                return False
            self._app = app
            self.provider = provider
            return True
        except Exception:
            return False

    def load_model(self) -> None:
        with self._lock:
            key = self._model_key()
            if self._app is not None and self._loaded_key == key:
                return
            self._app = None
            self._loaded_key = None

            available = set(ort.get_available_providers())
            for provider, accelerator in _PROVIDER_PRIORITY:
                if provider not in available:
                    continue
                if self._try_load_with_provider(provider):
                    self.accelerator = accelerator
                    self.gpu = True
                    self._loaded_key = key
                    return

            if not self._try_load_with_provider("CPUExecutionProvider"):
                raise RuntimeError("Failed to load face recognition model on any execution provider")
            self.accelerator = "cpu"
            self.gpu = False
            self.provider = "CPUExecutionProvider"
            self._loaded_key = key

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

    def _prepare_for_inference(self, image: np.ndarray) -> tuple[np.ndarray, float]:
        h, w = image.shape[:2]
        scale = 1.0

        min_size = settings.face_min_image_size
        if min_size > 0 and max(h, w) < min_size:
            up = min_size / max(h, w)
            image = cv2.resize(image, (int(w * up), int(h * up)), interpolation=cv2.INTER_LINEAR)
            scale *= up

        max_size = settings.face_max_image_size
        if max_size > 0 and max(image.shape[:2]) > max_size:
            down = max_size / max(image.shape[:2])
            nh, nw = image.shape[:2]
            image = cv2.resize(image, (int(nw * down), int(nh * down)), interpolation=cv2.INTER_AREA)
            scale *= down

        return image, scale

    def detect_and_embed(self, image: np.ndarray) -> list[FaceResult]:
        with self._lock:
            if self._app is None:
                self.load_model()

            import time

            image, scale = self._prepare_for_inference(image)
            start = time.perf_counter()
            faces = self._app.get(image)
            self._last_inference_ms = (time.perf_counter() - start) * 1000

            results: list[FaceResult] = []
            for face in faces:
                bbox = (face.bbox.astype(float) / scale).tolist()
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
