from __future__ import annotations

import json
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

    @classmethod
    def from_json(cls, path: str | Path) -> "Config":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        bots = {
            name: BotConfig(
                token=cfg["token"],
                enabled=cfg.get("enabled", True),
            )
            for name, cfg in data["bots"].items()
        }

        smtp_data = data["smtp"]
        smtp = SmtpConfig(
            host=smtp_data["host"],
            port=smtp_data["port"],
            user=smtp_data["user"],
            password=smtp_data["password"],
        )

        return cls(
            bots=bots,
            google_sheet_id=data["google_sheet_id"],
            google_credentials_file=data["google_credentials_file"],
            smtp=smtp,
            hr_email=data["hr_email"],
        )

    def get_bot(self, name: str) -> Optional[BotConfig]:
        return self.bots.get(name)
