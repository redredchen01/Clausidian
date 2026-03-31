---
title: Clausidian v3.1.0 Theme C — Test Scenarios 執行摘要
type: summary
status: complete
created: 2026-03-30
updated: 2026-03-30
tags: [test-plan, theme-c, cache, summary]
---

# Clausidian v3.1.0 Theme C — Test Scenarios 執行摘要

## 文檔交付清單

已生成 **3 份完整文檔**，涵蓋 Clausidian v3.1.0 Theme C 持久搜尋快取架構的所有測試場景。

### 交付物

| 文檔 | 行數 | 大小 | 用途 |
|------|------|------|------|
| `test-scenarios-theme-c-persistent-cache.md` | 1,061 | 25KB | **完整測試場景清單** — 10 個分類、26 個場景，包含詳細的輸入、動作、預期輸出 |
| `test-scenarios-quick-reference.md` | 439 | 13KB | **快速參考表** — 優先級、故障排除、效能基準、驗證工具 |
| `TEST-SCENARIOS-SUMMARY.md` | 此文檔 | — | **執行指南** — 如何使用這些文檔，測試執行流程 |

**總計**：1,500+ 行文檔，可直接用於開發和測試。

---

## 測試覆蓋概覽

### 按分類分布

```
Happy Path (3 scenarios)
├─ 1.1 新建快取並保存到磁碟
├─ 1.2 進程重啟後恢復快取
└─ 1.3 快取命中和未命中統計

Edge Cases (3 scenarios)
├─ 2.1 空快取
├─ 2.2 TTL 過期的 entries
└─ 2.3 Vault 版本不匹配

Error Paths (4 scenarios)
├─ 3.1 I/O 錯誤 — 磁碟滿
├─ 3.2 I/O 錯誤 — 權限不足
├─ 3.3 損壞的快取檔案 — 無效 JSON
└─ 3.4 磁碟讀寫失敗 — 檔案鎖定

Integration Scenarios (4 scenarios)
├─ 4.1 vault.write() 觸發快取失效
├─ 4.2 SelectiveInvalidation hook 整合
├─ 4.3 cache stats 命令正常運作
└─ 4.4 cache clear 命令清空磁碟快取

Performance & Load Tests (2 scenarios)
├─ 5.1 大型 vault 的快取效能
└─ 5.2 快取寫入不阻塞搜尋

Concurrency & Multi-Session (2 scenarios)
├─ 6.1 多個搜尋同時進行
└─ 6.2 進程間快取共享

版本追蹤 & 失效 (2 scenarios)
├─ 7.1 vault 版本變化自動失效快取
└─ 7.2 只有部分 vault 文件更新

邊界 & 限制 (2 scenarios)
├─ 8.1 快取大小上限
└─ 8.2 特殊字符和正則表達式搜尋

恢復 & 降級 (2 scenarios)
├─ 9.1 損壞快取的優雅降級
└─ 9.2 快取缺失時的回退

文檔與管理 (2 scenarios)
├─ 10.1 cache status 命令可讀輸出
└─ 10.2 MCP 快取命令可調用

──────────────────────
總計：26 個場景
優先級分布：P0 (9), P1 (11), P2 (6)
```

---

## 測試優先級分類

### P0 — Critical（9 個）必須驗收

不可或缺的核心功能，缺一不可：

1. ✅ 1.1 — 新建快取並保存
2. ✅ 1.2 — 進程重啟後恢復
3. ✅ 1.3 — 快取命中/未命中統計
4. ✅ 2.2 — TTL 過期檢測
5. ✅ 2.3 — Vault 版本不匹配處理
6. ✅ 3.3 — 損壞快取恢復
7. ✅ 4.1 — vault.write() 失效機制
8. ✅ 7.1 — vault 版本變化失效
9. ✅ 9.2 — 快取缺失回退

**驗收條件**：所有 P0 測試必須 pass，才能發佈 v3.1.0

### P1 — High（11 個）應納入測試

重要功能，強烈建議包含：

1. 2.1 — 空快取
2. 3.1 — 磁碟滿錯誤
3. 3.2 — 權限不足錯誤
4. 4.3 — cache stats 命令
5. 4.4 — cache clear 命令
6. 5.1 — 大型 vault 效能
7. 5.2 — 非同步寫入不阻塞
8. 6.1 — 並行搜尋
9. 8.2 — 特殊字符搜尋
10. 9.1 — 優雅降級
11. 10.2 — MCP 命令

**驗收條件**：≥90% P1 測試 pass，v3.1.0 可發佈

### P2 — Medium（6 個）可延後

良好特性，可在 v3.1.1+ 加入：

1. 3.4 — 檔案鎖定錯誤
2. 4.2 — SelectiveInvalidation
3. 6.2 — 進程間共享
4. 7.2 — 部分更新
5. 8.1 — 快取大小上限
6. 10.1 — cache status 命令

**驗收條件**：可選，不影響 v3.1.0 發佈

---

## 使用指南

### 1. 讀者類別和推薦閱讀順序

#### 🧑‍💼 產品經理 / QA 工程師
1. 本文檔（此摘要）
2. [test-scenarios-quick-reference.md](test-scenarios-quick-reference.md) — § 測試場景總覽 + § 優先級定義
3. [test-scenarios-theme-c-persistent-cache.md](test-scenarios-theme-c-persistent-cache.md) — § 1（Happy Path）+ § 4（Integration）

#### 🧑‍💻 開發人員
1. [test-scenarios-theme-c-persistent-cache.md](test-scenarios-theme-c-persistent-cache.md) — 全文（設計參考）
2. [test-scenarios-quick-reference.md](test-scenarios-quick-reference.md) — § 執行檢查清單 + § 效能基準
3. 本文檔 — § 測試執行流程 + § 實施檢查清單

#### 🧪 測試工程師
1. [test-scenarios-quick-reference.md](test-scenarios-quick-reference.md) — 優先級表 + 快速檢查清單
2. [test-scenarios-theme-c-persistent-cache.md](test-scenarios-theme-c-persistent-cache.md) — 詳細場景
3. 在實際環境運行測試，參考故障排除表

---

### 2. 測試執行流程

#### 階段 1：環境準備（1 小時）
```bash
# 檢查前置條件
[ ] Node.js v18.13.0+ 已安裝
[ ] npm install 已執行
[ ] 臨時目錄 /tmp/clausidian-tests 可寫
[ ] 測試數據準備完成

# 準備測試數據
npm run setup:test-data  # 或手動執行文檔中的 bash 命令
```

#### 階段 2：P0 測試（2 小時）
```bash
# 執行核心功能測試
npm test -- test/search-cache.test.mjs --grep "persist|stats|empty"

# 驗證輸出
✓ 所有 P0 測試應 pass
✓ 快取統計準確
✓ 進程重啟恢復正常
```

#### 階段 3：P1 測試（3 小時）
```bash
# 執行重要功能測試
npm test -- test/search-cache.test.mjs --grep "error|io|corrupt"
npm test -- test/commands.test.mjs --grep "cache"

# 效能基準
npm test -- test/performance.test.mjs
```

#### 階段 4：P2 測試（2 小時，可選）
```bash
# 高級特性測試
npm test -- test/integration.test.mjs --grep "selective|concurrent|version"
```

#### 階段 5：全量驗收（1 小時）
```bash
# 執行完整測試套件
npm test

# 預期結果
✓ Total tests: ≥450
✓ Failures: 0
✓ Coverage: 保持 ≥95%
```

**總計耗時**：8-9 小時

---

### 3. 快速檢查清單

#### 快取功能檢查
- [ ] `new SearchCache()` 初始化無誤
- [ ] `cache.set()` 和 `cache.get()` 正常
- [ ] `cache.stats()` 返回正確格式
- [ ] TTL 過期檢測精度 ±50ms
- [ ] 磁碟 I/O 非同步且不阻塞

#### 失效機制檢查
- [ ] `vault.write()` 觸發 `invalidateCache()`
- [ ] 版本變化時快取被清空
- [ ] 損壞快取被優雅降級
- [ ] 快取缺失時進程不崩潰

#### 命令功能檢查
- [ ] `cache stats` 返回有效 JSON
- [ ] `cache clear` 刪除快取檔案
- [ ] `cache status` 輸出可讀
- [ ] MCP 命令可調用

#### 效能檢查
- [ ] 首次搜尋 (500 筆記) <500ms
- [ ] 快取命中 <1ms
- [ ] set() + saveToDisk() <5ms
- [ ] 磁碟載入 <50ms

---

## 實施檢查清單

### 代碼實現清單

#### SearchCache 實現
- [ ] `class SearchCache` 基本框架
- [ ] `_getCacheKey()` — 確定性 key 生成
- [ ] `get()` — TTL 檢查、hit/miss 計數
- [ ] `set()` — 儲存結果和時間戳記
- [ ] `invalidate()` — 清空指定快取
- [ ] `clear()` — 全量清空、重置計數
- [ ] `stats()` — 返回統計對象

#### ClusterCache 實現
- [ ] 包裝 SearchCache
- [ ] 版本追蹤（vault 版本雜湊）
- [ ] 版本不匹配時自動清空
- [ ] `loadFromDisk()` — 從磁碟恢復
- [ ] `saveToDisk()` — 非同步保存

#### Vault 整合
- [ ] 在 constructor 初始化 `_clusterCache`
- [ ] 在 `search()` 中檢查快取
- [ ] 在 `invalidateCache()` 中清除快取
- [ ] `write()` 後自動呼叫 invalidate

#### 命令實現
- [ ] `cache stats` — 返回 JSON
- [ ] `cache clear` — 刪除檔案
- [ ] `cache status` — 可讀輸出
- [ ] Registry 中註冊所有命令
- [ ] MCP schema 完整暴露

#### 測試文件
- [ ] `test/search-cache.test.mjs` (10 tests)
- [ ] `test/cluster-cache.test.mjs` (8 tests)
- [ ] `test/vault-selective-invalidation.test.mjs` (8 tests)
- [ ] `test/file-hasher.test.mjs` (6 tests)
- [ ] `test/args-parser.test.mjs` (5 tests)
- [ ] `test/vault-validator.test.mjs` (5 tests)

### 驗收標準

| 項目 | 標準 | 驗證方法 |
|------|------|---------|
| 功能正確性 | 所有 P0、P1 測試 pass | `npm test` 無失敗 |
| 效能 | 命中 <1ms，首次 <500ms | 執行 performance.test.mjs |
| 持久性 | 進程重啟後快取恢復 | integration test |
| 健壯性 | 錯誤優雅處理，無崩潰 | error path 測試 |
| 代碼質量 | 無 linting 錯誤，覆蓋度 ≥95% | eslint + c8 |
| 文檔完整性 | CHANGELOG、JSDoc、help 完整 | 手動檢查 |

---

## 性能基準

### 測試環境
- 硬件：MacBook Pro 2023（M3, 16GB RAM）
- 軟件：Node.js v18.13.0, macOS 14.3
- Vault 大小：500 筆記（測試用）

### 測量結果

| 操作 | 預期 | 實現目標 | 備註 |
|------|------|---------|------|
| 首次搜尋 (500 notes) | <500ms | <300ms | 全掃描，無快取 |
| 快取命中搜尋 | <1ms | <0.5ms | 記憶體查詢 |
| set() 耗時 | <1ms | <0.5ms | 記憶體操作 |
| saveToDisk() 耗時 | 非同步 | <5ms 同步部分 | 非同步不阻塞 |
| loadFromDisk() 耗時 | <50ms | <30ms | 進程啟動 |
| cache stats 耗時 | <10ms | <5ms | 計算統計 |

### 效能測試方法

```javascript
import { performance } from 'perf_hooks';

// 測量首次搜尋
const start1 = performance.now();
vault.search('test');
const elapsed1 = performance.now() - start1;
console.log(`First search: ${elapsed1.toFixed(2)}ms`);

// 測量快取命中
const start2 = performance.now();
vault.search('test');
const elapsed2 = performance.now() - start2;
console.log(`Cached search: ${elapsed2.toFixed(2)}ms`);

// 效能提升比
const improvement = (elapsed1 / elapsed2).toFixed(1);
console.log(`Improvement: ${improvement}x faster`);
```

---

## 磁碟快取檔案結構

### 位置
```
<vault-root>/
├── projects/
├── areas/
├── ...
└── .clausidian/
    └── cache.json        ← 持久快取檔案
```

### 格式 (JSON)
```json
{
  "version": "1",
  "vaultVersion": "sha256:abc123def456...",
  "ttl": 300000,
  "hits": 42,
  "misses": 8,
  "entries": [
    {
      "key": "[\"api\",{\"type\":\"project\"}]",
      "results": [
        {
          "file": "api-design",
          "type": "project",
          "status": "active",
          "tags": ["backend"],
          "summary": "..."
        }
      ],
      "timestamp": 1711864200000
    }
  ],
  "savedAt": 1711864200000
}
```

### 說明
- `version`：快取格式版本（向後兼容）
- `vaultVersion`：vault 狀態雜湊，版本不符時快取失效
- `ttl`：TTL 毫秒數，age > ttl 時過期
- `hits/misses`：統計計數器
- `entries`：快取項陣列
  - `key`：搜尋參數 JSON 序列化（確定性）
  - `results`：搜尋結果
  - `timestamp`：項建立時間
- `savedAt`：檔案最後保存時間

---

## 故障排除快速指南

| 症狀 | 可能原因 | 解決方式 |
|------|---------|---------|
| 快取無法命中 | TTL 已過期 | 檢查 `cache.stats()` 的 `expiredEntries`；驗證時間戳記 |
| 磁碟檔案不存在 | saveToDisk() 未被呼叫 | 確認 `vault.search()` 包含快取邏輯；檢查 `.clausidian/` 目錄權限 |
| 進程重啟後快取丟失 | 版本不符 | 檢查 `vaultVersion` 計算；確認 _tags.md 和 _graph.md 時間戳記 |
| 統計數字異常 | 計數邏輯錯誤 | 驗證 hits/misses 遞增；檢查 clear() 是否重置計數 |
| 搜尋性能未改善 | 快取未被使用 | 檢查 `search()` 是否呼叫 `cache.get()`；驗證 cache key 一致性 |
| JSON 解析失敗 | cache.json 損壞 | 執行 `cache clear`；驗證 JSON 格式；檢查編碼（應為 UTF-8） |

---

## 相關檔案索引

| 文檔 | 位置 | 相關性 |
|------|------|--------|
| 本摘要 | [TEST-SCENARIOS-SUMMARY.md](TEST-SCENARIOS-SUMMARY.md) | 執行指南 |
| 完整場景 | [test-scenarios-theme-c-persistent-cache.md](test-scenarios-theme-c-persistent-cache.md) | 詳細規格 |
| 快速參考 | [test-scenarios-quick-reference.md](test-scenarios-quick-reference.md) | 速查表 |
| 完整規劃 | [2026-03-30-001-feat-clausidian-v3-1-0-mvp-plan.md](plans/2026-03-30-001-feat-clausidian-v3-1-0-mvp-plan.md) | 設計文檔 |
| 架構設計 | [ARCHITECTURE.md](../ARCHITECTURE.md) | 系統架構 |
| 實現代碼 | `src/search-cache.mjs` | SearchCache 類 |
| 實現代碼 | `src/vault.mjs` | Vault 整合 |
| 實現代碼 | `src/commands/cache.mjs` | 快取命令 |
| 測試代碼 | `test/search-cache.test.mjs` | 單元測試 |
| 註冊表 | `src/registry.mjs` | 命令暴露 |

---

## 常見問題 (FAQ)

### Q1：快取會導致搜尋結果過期嗎？

**A**：不會。快取包含 vault 版本雜湊，當 vault 內容變化（via `vault.write()`）時，版本會更新，快取自動失效。舊數據無法洩漏。

### Q2：進程間會有快取衝突嗎？

**A**：不會。磁碟快取是 atomic（原子性）的，使用臨時檔案和重命名策略避免部分寫入。多進程讀寫同一檔案時，最新的版本勝出。

### Q3：快取會無限增長嗎？

**A**：不會。在 P0 實現中，快取按 TTL 過期後被清理。可選的 P2 功能是實現 max-size 限制和 LRU 清逐。

### Q4：如果磁碟寫入失敗，搜尋會中斷嗎？

**A**：不會。saveToDisk() 失敗是「fail-open」設計：磁碟失敗被記錄但不拋出異常。搜尋仍可用，快取僅存於記憶體，進程重啟後喪失。

### Q5：MCP 快取命令何時使用？

**A**：當 agent 需要：
- 監控搜尋性能：`cache_stats` 查看命中率
- 排除故障：`cache_clear` 重置快取，驗證搜尋是否正常
- 檢查狀態：`cache_status` 查看快取年齡和大小

### Q6：能否自訂 TTL？

**A**：可以。在 Vault 初始化時傳入選項：`new SearchCache(600000)` 設置 10 分鐘 TTL。默認 5 分鐘。

---

## 下一步

### 對於實現者
1. 參考 `test-scenarios-theme-c-persistent-cache.md` 的每個場景
2. 按 Happy Path → Edge Cases → Error Paths → Integration 順序開發
3. 每個場景實現後，執行對應的測試驗證
4. 全量測試 pass 後，提交 PR

### 對於測試工程師
1. 準備測試環境（見 § 測試執行流程）
2. 使用快速參考表逐個運行測試
3. 記錄性能基準（每個環境一次）
4. 檔案失敗場景供產品檢查

### 對於產品
1. P0 測試 100% pass → 可進入 beta
2. P1 測試 ≥90% pass → 可發佈 v3.1.0
3. P2 測試完成 → 可計劃 v3.1.1+

---

## 版本歷史

| 版本 | 日期 | 變更 |
|------|------|------|
| 1.0 | 2026-03-30 | 初始版本，26 個測試場景 |

---

## 聯絡方式

- 文檔作者：Claude (Anthropic)
- 相關版本：Clausidian v3.1.0 Theme C
- 最後更新：2026-03-30

---

## 附錄：快速命令參考

### 測試命令
```bash
# 執行所有測試
npm test

# 執行特定測試文件
npm test -- test/search-cache.test.mjs

# 執行特定測試案例
npm test -- test/search-cache.test.mjs --grep "persist"

# 顯示詳細輸出
npm test -- --reporter spec

# 性能測試
npm run test:perf
```

### 快取管理命令
```bash
# 查看快取統計
clausidian cache stats --vault /path/to/vault

# 清空快取
clausidian cache clear --vault /path/to/vault

# 查看快取狀態
clausidian cache status --vault /path/to/vault

# 幫助信息
clausidian help cache
```

### 開發命令
```bash
# lint 代碼
npm run lint

# 格式化代碼
npm run fmt

# 產生覆蓋率報告
npm run test:coverage

# 監視模式（開發時自動重新執行）
npm test -- --watch
```

---

**文檔完整。可直接用於開發、測試和驗收。**
