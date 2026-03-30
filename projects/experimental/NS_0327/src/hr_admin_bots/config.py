from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class BotConfig:
    token: str
    enabled: bool = True


@dataclass
class SmtpConfig:
    host: str
    port: int
    user: str
    password: str


@dataclass
class Config:
    bots: dict[str, BotConfig]
    google_sheet_id: str
    google_credentials_file: str
    smtp: SmtpConfig
    hr_email: str
    webhooks: list[str] = field(default_factory=list)

    @classmethod
    def from_env(cls) -> "Config":
        """從環境變數建立 Config。所有欄位必須存在，否則 KeyError。"""
        bots = {}
        bot_env_map = {
            "onboarding": "HR_BOT_ONBOARDING_TOKEN",
            "work_permit": "HR_BOT_WORK_PERMIT_TOKEN",
            "leave": "HR_BOT_LEAVE_TOKEN",
            "offboarding": "HR_BOT_OFFBOARDING_TOKEN",
        }
        for name, env_key in bot_env_map.items():
            token = os.environ.get(env_key)
            if token:
                bots[name] = BotConfig(token=token)

        smtp = SmtpConfig(
            host=os.environ["HR_SMTP_HOST"],
            port=int(os.environ["HR_SMTP_PORT"]),
            user=os.environ["HR_SMTP_USER"],
            password=os.environ["HR_SMTP_PASSWORD"],
        )

        return cls(
            bots=bots,
            google_sheet_id=os.environ["HR_GOOGLE_SHEET_ID"],
            google_credentials_file=os.environ["HR_GOOGLE_CREDENTIALS_FILE"],
            smtp=smtp,
            hr_email=os.environ["HR_EMAIL"],
            webhooks=[],
        )

    @classmethod
    def from_json(cls, path: str | Path) -> "Config":
        """優先從 JSON 讀取；缺少的欄位 fallback 到環境變數。"""
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # bots — JSON 優先，不存在的 bot 從環境變數取 token
        bot_env_map = {
            "onboarding": "HR_BOT_ONBOARDING_TOKEN",
            "work_permit": "HR_BOT_WORK_PERMIT_TOKEN",
            "leave": "HR_BOT_LEAVE_TOKEN",
            "offboarding": "HR_BOT_OFFBOARDING_TOKEN",
        }
        bots_data = data.get("bots", {})
        bots = {}
        for name, env_key in bot_env_map.items():
            if name in bots_data:
                cfg = bots_data[name]
                bots[name] = BotConfig(
                    token=cfg["token"],
                    enabled=cfg.get("enabled", True),
                )
            else:
                token = os.environ.get(env_key)
                if token:
                    bots[name] = BotConfig(token=token)

        smtp_data = data.get("smtp", {})
        smtp = SmtpConfig(
            host=smtp_data.get("host") or os.environ["HR_SMTP_HOST"],
            port=int(smtp_data.get("port") or os.environ["HR_SMTP_PORT"]),
            user=smtp_data.get("user") or os.environ["HR_SMTP_USER"],
            password=smtp_data.get("password") or os.environ["HR_SMTP_PASSWORD"],
        )

        return cls(
            bots=bots,
            google_sheet_id=data.get("google_sheet_id") or os.environ["HR_GOOGLE_SHEET_ID"],
            google_credentials_file=data.get("google_credentials_file") or os.environ["HR_GOOGLE_CREDENTIALS_FILE"],
            smtp=smtp,
            hr_email=data.get("hr_email") or os.environ["HR_EMAIL"],
            webhooks=data.get("webhooks", []),
        )

    def get_bot(self, name: str) -> Optional[BotConfig]:
        return self.bots.get(name)
