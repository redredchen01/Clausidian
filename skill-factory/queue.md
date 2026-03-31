# Skill Factory Queue

每日由 `/skx` 自動更新。`/sfx` 從此隊列消費並生成 skill。

## 格式
```
- [ ] YYYY-MM-DD | P1 | /skill-name | 描述 | vault-idea-note (可選)
- [x] YYYY-MM-DD | P1 | /skill-name | 描述 | built: YYYY-MM-DD
```

---

## Pending

<!-- 隊列清空 -->

## Built

- [x] 2026-03-31 | P1 | /site-doctor-skill | 一鍵全套站點診斷，整合 Lighthouse + SEO + 斷鏈 + CrUX + SSL | site-doctor-skill | built: 2026-03-31
- [x] 2026-03-31 | P1 | /competitor-intel-skill | 競品情報自動簡報，定期監控、趨勢識別、週報推送 | competitor-intel-skill | built: 2026-03-31

- [x] 2026-03-31 | P1 | /api-aggregation-notifier | 通用框架：多源 API 數據聚合 → 轉換表格 → Slack dispatch | api-aggregation-framework | built: 2026-03-31
- [x] 2026-03-30 | P1 | /pypi-publish | 消除手動 twine upload，一鍵打包+上傳 PyPI | pypi-auto-publish | built: 2026-03-30
- [x] 2026-03-30 | P1 | /agent-trace | append-only JSONL agent 操作追蹤，查詢+周報整合 | agent-trace-system | built: 2026-03-30
- [x] 2026-03-30 | P1 | /site-doctor | 複合站點診斷：可用性+SEO+效能+競品對標 | site-doctor-skill | built: 2026-03-30
- [x] 2026-03-30 | P2 | /prompt-audit | 掃描所有 skill/prompt 找反模式，A/B 框架建議 | built: 2026-03-30
- [x] 2026-03-30 | P2 | /launchd-health | 列出 24 個 LaunchAgent 狀態+失敗告警 | built: 2026-03-30
- [x] 2026-03-31 | P1 | /linear-slack-reporter | 自動查詢 Linear bug、整理成表格、發 Slack 通知 | linear-slack-bug-reporter | built: 2026-03-31

