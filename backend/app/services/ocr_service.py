import re
from dataclasses import dataclass, field

import cv2
import numpy as np

from app.config import settings
from app.services.face_service import face_service

_NOISE_PATTERN = re.compile(
    r"(姓名|名字|学号|编号|班级|Name|NAME|name)[:：\s]*",
    re.IGNORECASE,
)
_CLASS_SPLIT = re.compile(r"^(.+?)[\s·,，/|]+(.+班.*)$")
_CHINESE_CHARS = re.compile(r"[\u4e00-\u9fff·]{1,8}")
_CHINESE_NAME = re.compile(r"^[\u4e00-\u9fff·]{2,8}$")
_DIGIT_ONLY = re.compile(r"^\d+$")


@dataclass
class OcrLine:
    text: str
    confidence: float
    source: str
    box: list[list[float]] | None = None


@dataclass
class NameTagResult:
    name: str | None
    class_name: str | None
    confidence: float
    raw_text: str | None
    face_detected: bool
    face_bbox: list[float] | None
    ocr_lines: list[str] = field(default_factory=list)


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

    def _preprocess_clahe(self, image: np.ndarray) -> np.ndarray:
        if image.size == 0:
            return image
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        h, w = enhanced.shape[:2]
        if max(h, w) < 480:
            scale = 480 / max(h, w)
            enhanced = cv2.resize(enhanced, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)

    def _preprocess_binary(self, image: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (3, 3), 0)
        binary = cv2.adaptiveThreshold(
            blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 8
        )
        h, w = binary.shape[:2]
        if max(h, w) < 480:
            scale = 480 / max(h, w)
            binary = cv2.resize(binary, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)

    @staticmethod
    def _box_center(box: list[list[float]]) -> tuple[float, float]:
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        return sum(xs) / len(xs), sum(ys) / len(ys)

    def _merge_box_lines(self, items: list[tuple[list[list[float]], str, float]]) -> list[OcrLine]:
        if not items:
            return []

        enriched = []
        for box, text, score in items:
            cx, cy = self._box_center(box)
            enriched.append((cy, cx, text.strip(), float(score), box))

        enriched.sort(key=lambda row: (row[0], row[1]))
        rows: list[list[tuple]] = []
        for item in enriched:
            if not rows or abs(item[0] - rows[-1][0][0]) > 40:
                rows.append([item])
            else:
                rows[-1].append(item)

        merged: list[OcrLine] = []
        for row in rows:
            row.sort(key=lambda r: r[1])
            text = "".join(part[2] for part in row)
            text = re.sub(r"\s+", "", text)
            if not text:
                continue
            avg_conf = sum(part[3] for part in row) / len(row)
            merged.append(OcrLine(text=text, confidence=avg_conf, source="merged", box=row[0][4]))
        return merged

    def _run_ocr(self, image: np.ndarray, source: str) -> list[OcrLine]:
        if self._engine is None:
            self.load_model()

        lines: list[OcrLine] = []
        for score_thresh in (settings.ocr_text_score, 0.35, 0.25):
            result, _ = self._engine(image, text_score=score_thresh)
            if not result:
                continue

            raw_items = [(box, str(text).strip(), score) for box, text, score in result if str(text).strip()]
            if not raw_items:
                continue

            for merged in self._merge_box_lines(raw_items):
                merged.source = source
                lines.append(merged)

            for box, text, score in raw_items:
                try:
                    confidence = float(score)
                except (TypeError, ValueError):
                    confidence = 0.0
                lines.append(
                    OcrLine(text=str(text).strip(), confidence=confidence, source=source, box=box)
                )
            break

        return lines

    def _scan_image(self, image: np.ndarray, source: str) -> list[OcrLine]:
        if image.size == 0:
            return []
        lines: list[OcrLine] = []
        variants = (
            ("clahe", self._preprocess_clahe(image)),
            ("binary", self._preprocess_binary(image)),
            ("original", image),
        )
        for tag, variant in variants:
            lines.extend(self._run_ocr(variant, f"{source}:{tag}"))
        return lines

    def _name_tag_roi(self, image: np.ndarray, face_bbox: list[float]) -> np.ndarray | None:
        h, w = image.shape[:2]
        x1, y1, x2, y2 = face_bbox
        face_w = max(x2 - x1, 1.0)
        face_h = max(y2 - y1, 1.0)
        cx = (x1 + x2) / 2.0

        roi_y1 = int(min(max(y2 - face_h * 0.2, 0), h - 1))
        roi_y2 = int(min(y2 + face_h * settings.name_tag_roi_height_ratio, h))
        roi_x1 = int(max(0, cx - face_w * settings.name_tag_roi_width_ratio))
        roi_x2 = int(min(w, cx + face_w * settings.name_tag_roi_width_ratio))

        if roi_y2 - roi_y1 < 20 or roi_x2 - roi_x1 < 20:
            return None
        return image[roi_y1:roi_y2, roi_x1:roi_x2].copy()

    def _center_roi(self, image: np.ndarray) -> np.ndarray:
        h, w = image.shape[:2]
        y1, y2 = int(h * 0.25), int(h * 0.85)
        x1, x2 = int(w * 0.1), int(w * 0.9)
        return image[y1:y2, x1:x2].copy()

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
            if name and _CHINESE_NAME.match(name):
                return name, class_name or None

        cleaned = cls._clean_text(normalized)
        if not cleaned:
            return None, None

        if _CHINESE_NAME.match(cleaned):
            return cleaned, None

        segments = _CHINESE_CHARS.findall(cleaned)
        if not segments:
            return None, None

        joined = "".join(segments)
        if _CHINESE_NAME.match(joined):
            return joined, None

        best = max(segments, key=len)
        if len(best) >= 2:
            return best, None
        return None, None

    @classmethod
    def _score_candidate(cls, name: str, confidence: float, source: str) -> float:
        score = confidence
        if _CHINESE_NAME.match(name):
            score += 0.15
        if 2 <= len(name) <= 4:
            score += 0.1
        if "chest_roi" in source or "center" in source:
            score += 0.05
        return score

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

        seen_text: set[str] = set()
        candidates: list[tuple[str, str | None, float, str, float]] = []
        all_texts: list[str] = []

        for line in lines:
            if line.text in seen_text:
                continue
            seen_text.add(line.text)
            all_texts.append(line.text)
            name, class_name = cls._parse_name_and_class(line.text)
            if name:
                rank = cls._score_candidate(name, line.confidence, line.source)
                candidates.append((name, class_name, line.confidence, line.text, rank))

        if not candidates:
            raw = " / ".join(all_texts)
            return NameTagResult(
                name=None,
                class_name=None,
                confidence=max((line.confidence for line in lines), default=0.0),
                raw_text=raw or None,
                face_detected=False,
                face_bbox=None,
                ocr_lines=all_texts,
            )

        name, class_name, confidence, raw, _ = max(candidates, key=lambda item: (item[4], item[2], len(item[0])))
        return NameTagResult(
            name=name,
            class_name=class_name,
            confidence=confidence,
            raw_text=raw,
            face_detected=False,
            face_bbox=None,
            ocr_lines=all_texts,
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
                lines.extend(self._scan_image(roi, "chest_roi"))

        lines.extend(self._scan_image(self._center_roi(image), "center"))
        lines.extend(self._scan_image(image, "full_image"))

        result = self._pick_best_name(lines)
        result.face_detected = bool(faces)
        result.face_bbox = face_bbox
        return result

    def detect_name_tag_from_base64(self, b64: str) -> NameTagResult:
        image = face_service.decode_base64_image(b64)
        return self.detect_name_tag(image)


ocr_service = OcrService()
