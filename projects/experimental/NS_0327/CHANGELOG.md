# Changelog

## [0.5.0] - 2026-03-27
### Added
- SmartAssistant: leave type/reason suggestions, anomaly detection, monthly reports
- 2 new MCP tools: hr_detect_anomalies, hr_monthly_report
- CLI `report` subcommand

### Fixed
- 2 CRITICAL: Telegram binding bypass, update.get_bot() crash
- 4 HIGH: MCP version, scheduler timing, LEAVE_QUOTA duplication, test collision
- update_cell now raises ValueError on missing column

## [0.4.0] - 2026-03-27
### Added
- ReminderScheduler: auto-remind pending requests
- AuditLogger: operation audit trail
- /stats command: monthly HR statistics
- Dockerfile + docker-compose.yml
- Health check endpoint (:8080)

## [0.3.0] - 2026-03-27
### Added
- MCP Server: 8 HR tools over JSON-RPC 2.0
- CLI subcommands: serve/mcp/lookup/balance/status/version
- WebhookNotifier: HTTP POST to any endpoint

## [0.2.0] - 2026-03-27
### Added
- Manager Telegram approval (InlineKeyboard)
- Telegram user binding
- /status, /balance commands
- Environment variable config fallback

## [0.1.0] - 2026-03-27
### Added
- Initial release: 4 Telegram bots
- Shared foundation: auth, sheets, notifier
- Unified bot manager
