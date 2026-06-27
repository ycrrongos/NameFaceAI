from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
FACES_DIR = DATA_DIR / "faces"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = f"sqlite:///{DATA_DIR / 'nameface.db'}"
    # Balanced long-range: buffalo_l (SCRFD-10G + ResNet50) @ det 960 (~30ms GPU)
    # Max accuracy slower: antelopev2 @ det 1280 (~60ms)
    # Lightweight close-range: buffalo_sc + det 320
    face_model_name: str = "buffalo_l"
    face_det_size: int = 960
    face_det_thresh: float = 0.35
    face_min_image_size: int = 720
    face_max_image_size: int = 1280
    face_match_threshold: float = 0.45
    ocr_text_score: float = 0.4
    name_tag_roi_height_ratio: float = 1.8
    name_tag_roi_width_ratio: float = 1.2
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    tcp_recognize_port: int = 8001

    llm_provider: str = ""
    dashscope_api_key: str = ""
    dashscope_model: str = "qwen-plus"
    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"


settings = Settings()

DATA_DIR.mkdir(parents=True, exist_ok=True)
FACES_DIR.mkdir(parents=True, exist_ok=True)
