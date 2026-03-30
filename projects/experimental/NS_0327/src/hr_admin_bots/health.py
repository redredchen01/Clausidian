"""Simple HTTP health check endpoint for Docker/k8s."""
from __future__ import annotations

import json
import logging
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

logger = logging.getLogger(__name__)

_start_time = time.time()


class HealthHandler(BaseHTTPRequestHandler):
    """處理 GET / 回傳 JSON 健康狀態。"""

    # 共用狀態字典，由 manager 更新
    status: dict = {"healthy": True, "bots_running": 0, "uptime_seconds": 0}

    def do_GET(self) -> None:
        self.status["uptime_seconds"] = int(time.time() - _start_time)
        code = 200 if self.status.get("healthy", False) else 503
        body = json.dumps(self.status).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:  # suppress access logs
        pass


def start_health_server(port: int = 8080) -> HTTPServer:
    """在背景執行緒啟動健康檢查伺服器，回傳 HTTPServer 實例。"""
    server = HTTPServer(("0.0.0.0", port), HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("Health check server started on port %d", port)
    return server


def update_health_status(bots_running: int, healthy: bool = True) -> None:
    """更新 HealthHandler 的共用狀態（由 manager 呼叫）。"""
    HealthHandler.status["healthy"] = healthy
    HealthHandler.status["bots_running"] = bots_running
    HealthHandler.status["uptime_seconds"] = int(time.time() - _start_time)
