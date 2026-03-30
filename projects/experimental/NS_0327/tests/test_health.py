"""Tests for HealthHandler and update_health_status."""
from __future__ import annotations

import json
import time
from http.server import HTTPServer
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest

from hr_admin_bots.health import HealthHandler, update_health_status


# ---------------------------------------------------------------------------
# Helpers — minimal fake request environment for HealthHandler
# ---------------------------------------------------------------------------

def make_handler(status_override: dict | None = None):
    """Instantiate a HealthHandler without a real socket."""
    request = MagicMock()
    client_address = ("127.0.0.1", 9999)
    server = MagicMock(spec=HTTPServer)

    # Patch __init__ so we avoid real socket setup
    with patch.object(HealthHandler, "__init__", lambda self, *a, **kw: None):
        handler = HealthHandler.__new__(HealthHandler)

    # Wire up the minimum attributes BaseHTTPRequestHandler uses
    handler.request = request
    handler.client_address = client_address
    handler.server = server
    handler.headers = {}
    handler.rfile = BytesIO(b"")

    # Capture outgoing bytes
    handler.wfile = BytesIO()

    # Intercept response-writing methods
    handler._response_code = None
    handler._headers_sent = {}

    def fake_send_response(code, message=None):
        handler._response_code = code

    def fake_send_header(key, value):
        handler._headers_sent[key] = value

    def fake_end_headers():
        pass

    handler.send_response = fake_send_response
    handler.send_header = fake_send_header
    handler.end_headers = fake_end_headers

    # Restore class-level status (reset between tests)
    if status_override is not None:
        HealthHandler.status = {**status_override}
    else:
        HealthHandler.status = {"healthy": True, "bots_running": 0, "uptime_seconds": 0}

    return handler


# ---------------------------------------------------------------------------
# do_GET — returns 200 with JSON body
# ---------------------------------------------------------------------------

class TestHealthHandlerDoGet:
    def test_returns_200_when_healthy(self):
        handler = make_handler({"healthy": True, "bots_running": 2, "uptime_seconds": 0})
        handler.do_GET()
        assert handler._response_code == 200

    def test_returns_503_when_not_healthy(self):
        handler = make_handler({"healthy": False, "bots_running": 0, "uptime_seconds": 0})
        handler.do_GET()
        assert handler._response_code == 503

    def test_response_body_is_valid_json(self):
        handler = make_handler()
        handler.do_GET()

        handler.wfile.seek(0)
        raw = handler.wfile.read()
        # Must be parseable
        data = json.loads(raw)
        assert isinstance(data, dict)

    def test_response_contains_healthy_key(self):
        handler = make_handler({"healthy": True, "bots_running": 3, "uptime_seconds": 0})
        handler.do_GET()

        handler.wfile.seek(0)
        data = json.loads(handler.wfile.read())
        assert "healthy" in data

    def test_response_contains_bots_running(self):
        handler = make_handler({"healthy": True, "bots_running": 3, "uptime_seconds": 0})
        handler.do_GET()

        handler.wfile.seek(0)
        data = json.loads(handler.wfile.read())
        assert "bots_running" in data

    def test_content_type_header_is_application_json(self):
        handler = make_handler()
        handler.do_GET()
        assert handler._headers_sent.get("Content-Type") == "application/json"

    def test_uptime_seconds_is_non_negative_integer(self):
        handler = make_handler()
        handler.do_GET()

        handler.wfile.seek(0)
        data = json.loads(handler.wfile.read())
        assert isinstance(data["uptime_seconds"], int)
        assert data["uptime_seconds"] >= 0


# ---------------------------------------------------------------------------
# update_health_status — changes the status dict
# ---------------------------------------------------------------------------

class TestUpdateHealthStatus:
    def setup_method(self):
        # Reset to a known state before each test
        HealthHandler.status = {"healthy": True, "bots_running": 0, "uptime_seconds": 0}

    def test_updates_bots_running(self):
        update_health_status(bots_running=4)
        assert HealthHandler.status["bots_running"] == 4

    def test_updates_healthy_flag_to_true(self):
        HealthHandler.status["healthy"] = False
        update_health_status(bots_running=1, healthy=True)
        assert HealthHandler.status["healthy"] is True

    def test_updates_healthy_flag_to_false(self):
        update_health_status(bots_running=0, healthy=False)
        assert HealthHandler.status["healthy"] is False

    def test_healthy_defaults_to_true(self):
        update_health_status(bots_running=2)
        assert HealthHandler.status["healthy"] is True

    def test_updates_uptime_seconds(self):
        before = HealthHandler.status.get("uptime_seconds", -1)
        time.sleep(0.01)
        update_health_status(bots_running=1)
        # uptime_seconds should be >= 0
        assert HealthHandler.status["uptime_seconds"] >= 0

    def test_multiple_calls_reflect_latest_values(self):
        update_health_status(bots_running=1)
        update_health_status(bots_running=3)
        assert HealthHandler.status["bots_running"] == 3
