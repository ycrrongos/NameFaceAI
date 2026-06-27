import re
from dataclasses import dataclass

import cv2
import numpy as np

from app.config import settings
from app.services.face_service import face_service

_NOISE_PATTERN = re.compile(
    r"(姓名|名字|学号|编号|班级|Name|NAME|name)[:：\s]*",
    re.IGNORECASE,
)
_CLASS_SPLIT = re.compile(r"^(.+?)[\s·,，/|]+(.+班.*)$")
_CHINESE_CHARS = re.compile(r"[\u4e00-\u9fff·]{2,8}")
_DIGIT_ONLY = re.compile(r"^\d+$")


@dataclass
class OcrLine:
    text: str
    confidence: float
    source: str


@dataclass
class NameTagResult:
    name: str | None
    class_name: str | None
    confidence: float
    raw_text: str | None
    face_detected: bool
    face_bbox: list[float] | None


class OcrService:
    def __init__(self) -> None:
        self._engine = None

    @property
    def model_loaded(self) -> bool:
        return self._engine is not None

    def load_model(self) -> None:
        if self._engine is not None:
            return
        from rapidocr_onnxruntime import RapidOCR

        self._engine = RapidOCR()

    def _preprocess(self, image: np.ndarray) -> np.ndarray:
        if image.size == 0:
            return image
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        h, w = enhanced.shape[:2]
        if max(h, w) < 320:
            scale = 320 / max(h, w)
            enhanced = cv2.resize(enhanced, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)

    def _name_tag_roi(self, image: np.ndarray, face_bbox: list[float]) -> np.ndarray | None:
        h, w = image.shape[:2]
        x1, y1, x2, y2 = face_bbox
        face_w = max(x2 - x1, 1.0)
        face_h = max(y2 - y1, 1.0)
        cx = (x1 + x2) / 2.0

        roi_y1 = int(min(max(y2, 0), h - 1))
        roi_y2 = int(min(y2 + face_h * settings.name_tag_roi_height_ratio, h))
        roi_x1 = int(max(0, cx - face_w * settings.name_tag_roi_width_ratio))
        roi_x2 = int(min(w, cx + face_w * settings.name_tag_roi_width_ratio))

        if roi_y2 - roi_y1 < 20 or roi_x2 - roi_x1 < 20:
            return None
        return image[roi_y1:roi_y2, roi_x1:roi_x2].copy()

    def _run_ocr(self, image: np.ndarray, source: str) -> list[OcrLine]:
        if self._engine is None:
            self.load_model()

        processed = self._preprocess(image)
        result, _ = self._engine(processed, text_score=settings.ocr_text_score)
        if not result:
            return []

        lines: list[OcrLine] = []
        for _box, text, score in result:
            cleaned = str(text).strip()
            if not cleaned:
                continue
            try:
                confidence = float(score)
            except (TypeError, ValueError):
                confidence = 0.0
            lines.append(OcrLine(text=cleaned, confidence=confidence, source=source))
        return lines

    @staticmethod
    def _clean_text(text: str) -> str:
        cleaned = _NOISE_PATTERN.sub("", text).strip()
        cleaned = re.sub(r"\s+", "", cleaned)
        return cleaned

    @classmethod
    def _parse_name_and_class(cls, text: str) -> tuple[str | None, str | None]:
        normalized = _NOISE_PATTERN.sub("", text).strip()
        normalized = re.sub(r"\s+", " ", normalized)
        if not normalized or _DIGIT_ONLY.match(normalized.replace(" ", "")):
            return None, None

        class_match = _CLASS_SPLIT.match(normalized)
        if class_match:
            name = cls._clean_text(class_match.group(1))
            class_name = class_match.group(2).strip()
            if name and not _DIGIT_ONLY.match(name):
                return name, class_name or None

        cleaned = cls._clean_text(normalized)
        if not cleaned:
            return None, None

        if _CHINESE_CHARS.fullmatch(cleaned):
            return cleaned, None

        segments = _CHINESE_CHARS.findall(cleaned)
        if not segments:
            return None, None

        best = max(segments, key=len)
        if len(best) >= 2:
            return best, None
        return None, None

    @classmethod
    def _pick_best_name(cls, lines: list[OcrLine]) -> NameTagResult:
        if not lines:
            return NameTagResult(
                name=None,
                class_name=None,
                confidence=0.0,
                raw_text=None,
                face_detected=False,
                face_bbox=None,
            )

        candidates: list[tuple[str, str | None, float, str]] = []
        for line in lines:
            name, class_name = cls._parse_name_and_class(line.text)
            if name:
                candidates.append((name, class_name, line.confidence, line.text))

        if not candidates:
            raw = " ".join(line.text for line in lines)
            return NameTagResult(
                name=None,
                class_name=None,
                confidence=max(line.confidence for line in lines),
                raw_text=raw or None,
                face_detected=False,
                face_bbox=None,
            )

        name, class_name, confidence, raw = max(candidates, key=lambda item: (item[2], len(item[0])))
        return NameTagResult(
            name=name,
            class_name=class_name,
            confidence=confidence,
            raw_text=raw,
            face_detected=False,
            face_bbox=None,
        )

    def detect_name_tag(self, image: np.ndarray) -> NameTagResult:
        faces = face_service.detect_and_embed(image)
        face_bbox: list[float] | None = None
        lines: list[OcrLine] = []

        if faces:
            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
            face_bbox = face.bbox
            roi = self._name_tag_roi(image, face_bbox)
            if roi is not None:
                lines.extend(self._run_ocr(roi, "chest_roi"))

        lines.extend(self._run_ocr(image, "full_image"))
        result = self._pick_best_name(lines)
        result.face_detected = bool(faces)
        result.face_bbox = face_bbox
        return result

    def detect_name_tag_from_base64(self, b64: str) -> NameTagResult:
        image = face_service.decode_base64_image(b64)
        return self.detect_name_tag(image)


ocr_service = OcrService()
