from pydantic import BaseModel


class DiscoveryResponse(BaseModel):
    service_id: str
    service_name: str
    version: str
    tcp_recognize_port: int
    frontend_ports: list[int]
