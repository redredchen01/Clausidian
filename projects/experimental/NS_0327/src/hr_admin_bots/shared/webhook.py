"""Webhook notifier — sends HR events to arbitrary HTTP endpoints.

Supports Slack incoming webhooks, Microsoft Teams connectors,
and any endpoint that accepts a POST with JSON body.
"""
from __future__ import annotations

import asyncio
import json
import logging
import urllib.error
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)


class WebhookNotifier:
    """Send notifications to arbitrary HTTP endpoints (Slack, Teams, etc.)."""

    def __init__(self, webhook_urls: list[str]) -> None:
        self.urls = webhook_urls

    def send(self, event_type: str, data: dict[str, Any]) -> list[bool]:
        """POST JSON payload to all configured webhook URLs.

        Returns a list of booleans (one per URL) indicating success.
        Uses only stdlib urllib — no extra deps.
        """
        payload = json.dumps({"event_type": event_type, "data": data}).encode("utf-8")
        results: list[bool] = []

        for url in self.urls:
            try:
                req = urllib.request.Request(
                    url,
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    status = resp.status
                    ok = 200 <= status < 300
                    if not ok:
                        logger.warning("Webhook %s returned HTTP %s", url, status)
                    results.append(ok)
            except urllib.error.URLError as e:
                logger.error("Webhook send failed for %s: %s", url, e)
                results.append(False)
            except Exception as e:
                logger.error("Unexpected webhook error for %s: %s", url, e)
                results.append(False)

        return results

    async def send_async(self, event_type: str, data: dict[str, Any]) -> list[bool]:
        """Non-blocking webhook send via asyncio.to_thread."""
        return await asyncio.to_thread(self.send, event_type, data)
