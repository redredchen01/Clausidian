from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from hr_admin_bots.config import Config
from hr_admin_bots.bots.onboarding import OnboardingBot
from hr_admin_bots.bots.work_permit import WorkPermitBot
from hr_admin_bots.bots.leave import LeaveBot
from hr_admin_bots.bots.offboarding import OffboardingBot
from hr_admin_bots.shared.sheets import SheetsClient
from hr_admin_bots.shared.auth import EmployeeAuth
from hr_admin_bots.shared.notifier import EmailNotifier
from hr_admin_bots.shared.approval import ApprovalManager
from hr_admin_bots.shared.webhook import WebhookNotifier
from hr_admin_bots.shared.audit import AuditLogger
from hr_admin_bots.scheduler import ReminderScheduler
from hr_admin_bots.health import start_health_server, update_health_status
from hr_admin_bots.smart import SmartAssistant

logger = logging.getLogger(__name__)

# bot 名稱 -> 類別 對應
BOT_REGISTRY = {
    "onboarding": OnboardingBot,
    "work_permit": WorkPermitBot,
    "leave": LeaveBot,
    "offboarding": OffboardingBot,
}


class BotManager:
    """管理所有 HR Bot 的生命週期：載入設定、建立實例、並行執行。"""

    def __init__(
        self,
        config_path: str = "config.json",
        enable_scheduler: bool = True,
        health_port: Optional[int] = 8080,
    ) -> None:
        self.config = Config.from_json(config_path)
        self.enable_scheduler = enable_scheduler
        self.health_port = health_port

        # 共用 client 實例（各 bot 共享，避免重複連線）
        self.sheets_client: SheetsClient = SheetsClient(
            sheet_id=self.config.google_sheet_id,
            credentials_file=self.config.google_credentials_file,
        )
        self.auth: EmployeeAuth = EmployeeAuth(sheets_client=self.sheets_client)
        self.notifier: EmailNotifier = EmailNotifier(self.config)
        self.audit_logger: AuditLogger = AuditLogger(self.sheets_client)

        webhook_notifier = None
        if self.config.webhooks:
            webhook_notifier = WebhookNotifier(self.config.webhooks)
            logger.info("webhook notifier configured with %d URL(s)", len(self.config.webhooks))

        self.approval_manager: ApprovalManager = ApprovalManager(
            sheets_client=self.sheets_client,
            notifier=self.notifier,
            webhook_notifier=webhook_notifier,
            audit_logger=self.audit_logger,
        )

        self.scheduler: ReminderScheduler = ReminderScheduler(
            sheets_client=self.sheets_client,
            notifier=self.notifier,
            webhook_notifier=webhook_notifier,
        )

        self.smart: SmartAssistant = SmartAssistant(sheets_client=self.sheets_client)

        self.bots: list[Any] = self._create_bots()

    def _create_bots(self) -> list[Any]:
        """根據 config 建立所有已啟用的 bot 實例。"""
        instances = []
        for name, bot_cls in BOT_REGISTRY.items():
            bot_config = self.config.get_bot(name)
            if bot_config is None:
                logger.info("bot '%s' not found in config, skipping", name)
                continue
            if not bot_config.enabled:
                logger.info("bot '%s' is disabled, skipping", name)
                continue
            extra_kwargs: dict[str, Any] = {}
            if name == "leave":
                extra_kwargs["smart"] = self.smart
            instance = bot_cls(
                name=name,
                bot_config=bot_config,
                sheets_client=self.sheets_client,
                auth=self.auth,
                notifier=self.notifier,
                approval_manager=self.approval_manager,
                audit_logger=self.audit_logger,
                **extra_kwargs,
            )
            instances.append(instance)
            logger.info("bot '%s' created", name)
        return instances

    async def start_all(self) -> None:
        """並行啟動所有 bot（以及 scheduler），直到全部結束或其中一個發生例外。"""
        if not self.bots:
            logger.warning("no bots to start")
            return

        # 啟動 health check server（背景執行緒，不阻塞 event loop）
        if self.health_port is not None:
            try:
                start_health_server(self.health_port)
                update_health_status(bots_running=len(self.bots))
            except Exception as e:
                logger.warning("Failed to start health server: %s", e)

        applications = [bot.build_application() for bot in self.bots]

        async def run_app(app: Any) -> None:
            await app.initialize()
            await app.start()
            await app.updater.start_polling()
            # 保持執行直到被中斷
            await asyncio.Event().wait()

        # 組合任務：bots + scheduler（若啟用）
        tasks = [run_app(app) for app in applications]
        if self.enable_scheduler:
            tasks.append(self.scheduler.start())

        try:
            await asyncio.gather(*tasks)
        except (KeyboardInterrupt, SystemExit):
            logger.info("shutting down all bots")
            self.scheduler.stop()
            for app in applications:
                try:
                    await app.updater.stop()
                    await app.stop()
                    await app.shutdown()
                except Exception as e:
                    logger.error("error shutting down app: %s", e)

    def run(self) -> None:
        """同步入口，啟動 asyncio event loop 執行 start_all。"""
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        )
        asyncio.run(self.start_all())


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="HR Admin Bot Manager")
    parser.add_argument(
        "--config",
        default="config.json",
        help="Path to config JSON file (default: config.json)",
    )
    args = parser.parse_args()

    manager = BotManager(config_path=args.config)
    manager.run()


if __name__ == "__main__":
    main()
