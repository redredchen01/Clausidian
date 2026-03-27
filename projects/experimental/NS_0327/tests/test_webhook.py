"""Tests for WebhookNotifier — send(), payload format, error handling."""
from __future__ import annotations

import json
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest

from hr_admin_bots.shared.webhook import WebhookNotifier


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_mock_response(status: int = 200):
    """Build a mock context-manager response for urlopen."""
    resp = MagicMock()
    resp.status = status
    resp.__enter__ = MagicMock(return_value=resp)
    resp.__exit__ = MagicMock(return_value=False)
    return resp


# ---------------------------------------------------------------------------
# send() — POSTs to all configured URLs
# ---------------------------------------------------------------------------

class TestWebhookSendPosts:
    def test_posts_to_single_url(self):
        notifier = WebhookNotifier(["https://hook.example.com/1"])
        resp = make_mock_response(200)

        with patch("urllib.request.urlopen", return_value=resp) as mock_open:
            notifier.send("test_event", {"key": "val"})

        mock_open.assert_called_once()

    def test_posts_to_all_urls(self):
        urls = ["https://hook.example.com/1", "https://hook.example.com/2"]
        notifier = WebhookNotifier(urls)
        resp = make_mock_response(200)

        with patch("urllib.request.urlopen", return_value=resp) as mock_open:
            notifier.send("test_event", {})

        assert mock_open.call_count == len(urls)

    def test_method_is_post(self):
        notifier = WebhookNotifier(["https://hook.example.com/1"])
        resp = make_mock_response(200)
        captured_reqs = []

        def capture_req(req, timeout=None):
            captured_reqs.append(req)
            return resp

        with patch("urllib.request.urlopen", side_effect=capture_req):
            notifier.send("ev", {})

        assert captured_reqs[0].get_method() == "POST"

    def test_content_type_header_is_json(self):
        notifier = WebhookNotifier(["https://hook.example.com/1"])
        resp = make_mock_response(200)
        captured_reqs = []

        def capture_req(req, timeout=None):
            captured_reqs.append(req)
            return resp

        with patch("urllib.request.urlopen", side_effect=capture_req):
            notifier.send("ev", {})

        assert captured_reqs[0].get_header("Content-type") == "application/json"


# ---------------------------------------------------------------------------
# send() — returns list of booleans
# ---------------------------------------------------------------------------

class TestWebhookSendReturnValues:
    def test_returns_list_of_booleans(self):
        notifier = WebhookNotifier(["https://hook.example.com/1"])
        resp = make_mock_response(200)

        with patch("urllib.request.urlopen", return_value=resp):
            result = notifier.send("ev", {})

        assert isinstance(result, list)
        assert all(isinstance(v, bool) for v in result)

    def test_returns_true_for_2xx_response(self):
        notifier = WebhookNotifier(["https://hook.example.com/1"])
        resp = make_mock_response(200)

        with patch("urllib.request.urlopen", return_value=resp):
            result = notifier.send("ev", {})

        assert result == [True]

    def test_returns_false_for_4xx_response(self):
        notifier = WebhookNotifier(["https://hook.example.com/1"])
        resp = make_mock_response(400)

        with patch("urllib.request.urlopen", return_value=resp):
            result = notifier.send("ev", {})

        assert result == [False]

    def test_one_result_per_url(self):
        urls = ["https://a.com", "https://b.com", "https://c.com"]
        notifier = WebhookNotifier(urls)
        resp = make_mock_response(200)

        with patch("urllib.request.urlopen", return_value=resp):
            result = notifier.send("ev", {})

        assert len(result) == len(urls)


# ---------------------------------------------------------------------------
# send() — handles connection errors gracefully
# ---------------------------------------------------------------------------

class TestWebhookSendConnectionErrors:
    def test_url_error_returns_false_does_not_crash(self):
        import urllib.error
        notifier = WebhookNotifier(["https://dead.example.com/hook"])

        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("connection refused")):
            result = notifier.send("ev", {})

        assert result == [False]

    def test_generic_exception_returns_false_does_not_crash(self):
        notifier = WebhookNotifier(["https://dead.example.com/hook"])

        with patch("urllib.request.urlopen", side_effect=RuntimeError("unexpected")):
            result = notifier.send("ev", {})

        assert result == [False]

    def test_one_failure_does_not_stop_other_urls(self):
        import urllib.error
        urls = ["https://fail.com/hook", "https://ok.com/hook"]
        notifier = WebhookNotifier(urls)
        resp = make_mock_response(200)
        call_count = [0]

        def selective_fail(req, timeout=None):
            call_count[0] += 1
            if "fail.com" in req.full_url:
                raise urllib.error.URLError("connection refused")
            return resp

        with patch("urllib.request.urlopen", side_effect=selective_fail):
            result = notifier.send("ev", {})

        assert result == [False, True]
        assert call_count[0] == 2


# ---------------------------------------------------------------------------
# send() — empty URL list
# ---------------------------------------------------------------------------

class TestWebhookSendEmptyUrls:
    def test_empty_url_list_returns_empty_list(self):
        notifier = WebhookNotifier([])

        with patch("urllib.request.urlopen") as mock_open:
            result = notifier.send("ev", {})

        assert result == []
        mock_open.assert_not_called()


# ---------------------------------------------------------------------------
# Payload format — event_type and data keys
# ---------------------------------------------------------------------------

class TestWebhookPayloadFormat:
    def test_payload_has_event_type_key(self):
        notifier = WebhookNotifier(["https://hook.example.com/1"])
        resp = make_mock_response(200)
        captured_bodies = []

        def capture(req, timeout=None):
            captured_bodies.append(req.data)
            return resp

        with patch("urllib.request.urlopen", side_effect=capture):
            notifier.send("leave_approved", {"employee": "E001"})

        payload = json.loads(captured_bodies[0])
        assert "event_type" in payload
        assert payload["event_type"] == "leave_approved"

    def test_payload_has_data_key(self):
        notifier = WebhookNotifier(["https://hook.example.com/1"])
        resp = make_mock_response(200)
        captured_bodies = []

        def capture(req, timeout=None):
            captured_bodies.append(req.data)
            return resp

        with patch("urllib.request.urlopen", side_effect=capture):
            notifier.send("leave_approved", {"employee": "E001"})

        payload = json.loads(captured_bodies[0])
        assert "data" in payload
        assert payload["data"] == {"employee": "E001"}

    def test_payload_is_utf8_encoded_json(self):
        notifier = WebhookNotifier(["https://hook.example.com/1"])
        resp = make_mock_response(200)
        captured_bodies = []

        def capture(req, timeout=None):
            captured_bodies.append(req.data)
            return resp

        with patch("urllib.request.urlopen", side_effect=capture):
            notifier.send("ev", {"name": "測試員工"})

        # Must be bytes, valid JSON
        raw = captured_bodies[0]
        assert isinstance(raw, bytes)
        payload = json.loads(raw.decode("utf-8"))
        assert payload["data"]["name"] == "測試員工"
