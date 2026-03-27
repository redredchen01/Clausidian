"""Tests for EmailNotifier with mocked smtplib.SMTP."""
from __future__ import annotations

import smtplib
from unittest.mock import MagicMock, patch, call

import pytest

from hr_admin_bots.config import SmtpConfig
from hr_admin_bots.shared.notifier import EmailNotifier


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def make_config(hr_email: str = "hr@company.com"):
    cfg = MagicMock()
    cfg.smtp = SmtpConfig(host="smtp.test.com", port=587, user="bot@test.com", password="secret")
    cfg.hr_email = hr_email
    return cfg


def make_notifier(hr_email: str = "hr@company.com") -> EmailNotifier:
    return EmailNotifier(make_config(hr_email))


# ---------------------------------------------------------------------------
# hr_email property
# ---------------------------------------------------------------------------

class TestHrEmailProperty:
    def test_returns_configured_hr_email(self):
        notifier = make_notifier("hr@acme.com")
        assert notifier.hr_email == "hr@acme.com"

    def test_hr_email_reflects_config_value(self):
        notifier = make_notifier("people@corp.io")
        assert notifier.hr_email == "people@corp.io"


# ---------------------------------------------------------------------------
# send — success path
# ---------------------------------------------------------------------------

class TestSendSuccess:
    def test_returns_true_on_success(self):
        notifier = make_notifier()
        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_server = MagicMock()
            mock_smtp_cls.return_value.__enter__.return_value = mock_server

            result = notifier.send("recipient@test.com", "Subject", "Body text")

        assert result is True

    def test_calls_smtp_with_configured_host_port(self):
        notifier = make_notifier()
        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_server = MagicMock()
            mock_smtp_cls.return_value.__enter__.return_value = mock_server

            notifier.send("r@test.com", "S", "B")

        mock_smtp_cls.assert_called_once_with("smtp.test.com", 587)

    def test_calls_ehlo_starttls_login_sendmail_in_order(self):
        notifier = make_notifier()
        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_server = MagicMock()
            mock_smtp_cls.return_value.__enter__.return_value = mock_server

            notifier.send("r@test.com", "Subj", "Body")

        mock_server.ehlo.assert_called_once()
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with("bot@test.com", "secret")
        mock_server.sendmail.assert_called_once()
        # verify sendmail from-address
        args = mock_server.sendmail.call_args
        assert args[0][0] == "bot@test.com"
        assert args[0][1] == "r@test.com"

    def test_message_contains_subject_and_to(self):
        notifier = make_notifier()
        captured = {}
        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_server = MagicMock()
            mock_smtp_cls.return_value.__enter__.return_value = mock_server
            mock_server.sendmail.side_effect = lambda f, t, msg: captured.update({"msg": msg})

            notifier.send("target@test.com", "Hello Subject", "Hello Body")

        raw = captured["msg"]
        assert "Hello Subject" in raw
        assert "target@test.com" in raw


# ---------------------------------------------------------------------------
# send — failure paths
# ---------------------------------------------------------------------------

class TestSendFailure:
    def test_returns_false_on_smtp_exception(self):
        notifier = make_notifier()
        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_server = MagicMock()
            mock_smtp_cls.return_value.__enter__.return_value = mock_server
            mock_server.sendmail.side_effect = smtplib.SMTPException("send failed")

            result = notifier.send("r@test.com", "S", "B")

        assert result is False

    def test_returns_false_on_connection_error(self):
        notifier = make_notifier()
        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.side_effect = ConnectionRefusedError("connection refused")

            result = notifier.send("r@test.com", "S", "B")

        assert result is False

    def test_returns_false_on_login_failure(self):
        notifier = make_notifier()
        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_server = MagicMock()
            mock_smtp_cls.return_value.__enter__.return_value = mock_server
            mock_server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"auth failed")

            result = notifier.send("r@test.com", "S", "B")

        assert result is False

    def test_does_not_raise_on_any_exception(self):
        notifier = make_notifier()
        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.side_effect = RuntimeError("unexpected")

            # must not propagate
            result = notifier.send("r@test.com", "S", "B")

        assert result is False


# ---------------------------------------------------------------------------
# notify_hr
# ---------------------------------------------------------------------------

class TestNotifyHr:
    def test_sends_to_hr_email(self):
        notifier = make_notifier("hr@company.com")
        with patch.object(notifier, "send", return_value=True) as mock_send:
            result = notifier.notify_hr("HR Subject", "HR Body")

        mock_send.assert_called_once_with("hr@company.com", "HR Subject", "HR Body")
        assert result is True

    def test_returns_false_when_send_fails(self):
        notifier = make_notifier()
        with patch.object(notifier, "send", return_value=False):
            result = notifier.notify_hr("S", "B")

        assert result is False


# ---------------------------------------------------------------------------
# notify_manager
# ---------------------------------------------------------------------------

class TestNotifyManager:
    def test_sends_to_manager_email(self):
        notifier = make_notifier()
        with patch.object(notifier, "send", return_value=True) as mock_send:
            result = notifier.notify_manager("mgr@company.com", "Mgr Subject", "Mgr Body")

        mock_send.assert_called_once_with("mgr@company.com", "Mgr Subject", "Mgr Body")
        assert result is True

    def test_notify_manager_different_from_hr(self):
        notifier = make_notifier("hr@company.com")
        sent_to = []
        with patch.object(notifier, "send", side_effect=lambda to, s, b: sent_to.append(to) or True):
            notifier.notify_manager("boss@company.com", "S", "B")

        assert sent_to == ["boss@company.com"]

    def test_returns_false_when_send_fails(self):
        notifier = make_notifier()
        with patch.object(notifier, "send", return_value=False):
            result = notifier.notify_manager("mgr@company.com", "S", "B")

        assert result is False
