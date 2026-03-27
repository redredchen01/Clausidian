from __future__ import annotations

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from hr_admin_bots.config import SmtpConfig

logger = logging.getLogger(__name__)


class EmailNotifier:
    """Sends plain-text email notifications via SMTP."""

    def __init__(self, config) -> None:
        self._smtp: SmtpConfig = config.smtp
        self._hr_email: str = config.hr_email

    @property
    def hr_email(self) -> str:
        return self._hr_email

    def send(self, to: str, subject: str, body: str) -> bool:
        """Send an email. Returns False on any failure."""
        msg = MIMEMultipart()
        msg["From"] = self._smtp.user
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain", "utf-8"))

        try:
            with smtplib.SMTP(self._smtp.host, self._smtp.port) as server:
                server.ehlo()
                server.starttls()
                server.login(self._smtp.user, self._smtp.password)
                server.sendmail(self._smtp.user, to, msg.as_string())
            return True
        except smtplib.SMTPException as e:
            logger.error("SMTP error sending to %s: %s", to, e)
            return False
        except Exception as e:
            logger.error("Unexpected error sending email to %s: %s", to, e)
            return False

    def notify_hr(self, subject: str, body: str) -> bool:
        """Send notification to the HR email defined in config."""
        return self.send(self._hr_email, subject, body)

    def notify_manager(self, manager_email: str, subject: str, body: str) -> bool:
        """Send notification to a specific manager."""
        return self.send(manager_email, subject, body)
