from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import attendance, discovery, health, llm, ocr, practice, preview, recognize, students
from app.config import settings
from app.database import init_db
from app.services.face_service import face_service
from app.services.tcp_recognize_server import run_tcp_recognize_server

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        face_service.load_model()
    except Exception:
        pass
    try:
        from app.services.ocr_service import ocr_service

        ocr_service.load_model()
    except Exception:
        pass

    tcp_server = None
    try:
        tcp_server = await run_tcp_recognize_server()
    except Exception:
        logger.exception("Failed to start TCP recognize server on port %s", settings.tcp_recognize_port)

    yield

    if tcp_server is not None:
        tcp_server.close()
        await tcp_server.wait_closed()


app = FastAPI(title="NameFaceAI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(discovery.router, prefix="/api")
app.include_router(students.router, prefix="/api")
app.include_router(attendance.router, prefix="/api")
app.include_router(ocr.router, prefix="/api")
app.include_router(preview.router)
app.include_router(recognize.router)
app.include_router(llm.router, prefix="/api")
app.include_router(practice.router, prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {"name": "NameFaceAI", "docs": "/docs"}
