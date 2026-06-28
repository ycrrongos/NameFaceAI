from fastapi import APIRouter

from app.config import settings
from app.schemas.discovery import DiscoveryResponse

router = APIRouter(tags=["discovery"])

FRONTEND_PORTS = [5173, 5174]


@router.get("/discovery", response_model=DiscoveryResponse)
def discovery() -> DiscoveryResponse:
    """Lightweight LAN identity probe for Rokid glasses auto-discovery."""
    return DiscoveryResponse(
        service_id=settings.service_id,
        service_name="NameFaceAI",
        version="1.0.0",
        tcp_recognize_port=settings.tcp_recognize_port,
        frontend_ports=FRONTEND_PORTS,
    )
