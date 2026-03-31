---
title: Clausidian v3.1.0 Theme C — Test Scenarios Quick Reference
type: reference
status: active
created: 2026-03-30
updated: 2026-03-30
tags: [cache, test, quick-ref, theme-c]
---

# Theme C 持久快取測試場景快速參考

簡明表格版本，便於快速查找和執行。

---

## 測試場景總覽

| # | 分類 | 場景 | 輸入 | 預期結果 | 驗證點 | 優先級 |
|---|------|------|------|---------|--------|--------|
| 1.1 | Happy Path | 新建快取並保存 | vault.search('api') x2 | hits=1, misses=1, hitRate=50% | 統計準確 | P0 |
| 1.2 | Happy Path | 進程重啟後恢復 | loadFromDisk() → search() | 命中磁碟快取 | 快取跨進程恢復 | P0 |
| 1.3 | Happy Path | 混合命中/未命中 | 6 次搜尋，3 不同關鍵字 | hits=3, misses=3, hitRate=50% | 統計累積 | P0 |
| 2.1 | Edge Case | 空快取 | cache.get() on empty | 返回 null，stats=0 | 無虛假結果 | P1 |
| 2.2 | Edge Case | TTL 過期 | set → wait 150ms (TTL=100) | get() 返回 null | 過期檢測準確 | P0 |
| 2.3 | Edge Case | vault 版本不匹配 | vaultVersion != current | 快取被拒絕 | 版本檢查正常 | P0 |
| 3.1 | Error Path | 磁碟滿 | saveToDisk() with ENOSPC | 錯誤被捕捉，搜尋繼續 | I/O 錯誤處理 | P1 |
| 3.2 | Error Path | 權限不足 | chmod 555 → saveToDisk() | 錯誤被捕捉，搜尋繼續 | 權限檢查 | P1 |
| 3.3 | Error Path | 無效 JSON | cache.json = "invalid" | 快取清空初始化，無異常 | 損壞恢復 | P0 |
| 3.4 | Error Path | 檔案鎖定 | readFileSync() with EAGAIN | 快取降級為空 | 鎖定錯誤處理 | P2 |
| 4.1 | Integration | vault.write() 失效快取 | write() → search() | 搜尋未命中（快取清空） | 失效機制 | P0 |
| 4.2 | Integration | SelectiveInvalidation | invalidate(['project']) | 其他快取保留 | 選擇性清除 | P2 |
| 4.3 | Integration | cache stats 命令 | `cache stats` | 返回有效 JSON | MCP 暴露 | P1 |
| 4.4 | Integration | cache clear 命令 | `cache clear` | cache.json 刪除 | 清空機制 | P1 |
| 5.1 | Performance | 大型 vault 效能 | 500 筆記，search x2 | 第一次 <500ms，第二次 <1ms | 性能基線 | P1 |
| 5.2 | Performance | 非同步寫入 | set() + saveToDisk() | 返回耗時 <5ms | I/O 非阻塞 | P1 |
| 6.1 | Concurrency | 多重搜尋 | Promise.all([4 searches]) | hits/misses 準確 | 無競態錯誤 | P1 |
| 6.2 | Concurrency | 進程間共享 | ProcessA write → ProcessB read | ProcessB 命中快取 | 跨進程讀取 | P2 |
| 7.1 | Version | vault 版本變化 | write() → vaultVersion ≠ old | 快取失效 | 版本偵測 | P0 |
| 7.2 | Version | 部分更新 | write(file) → dirty tracking | 只清除相關快取 | 選擇性失效 | P2 |
| 8.1 | Boundary | 快取大小上限 | insert 150 entries (max=100) | totalEntries = 100 | 上限執行 | P2 |
| 8.2 | Boundary | 特殊字符搜尋 | search('api.*', regex=true) | 快取正常，命中準確 | 特殊字符處理 | P1 |
| 9.1 | Fallback | 損壞快取降級 | load corrupted json | 快取初始化為空，搜尋成功 | 優雅降級 | P1 |
| 9.2 | Fallback | 快取缺失 | no cache.json | 搜尋執行掃描，新快取建立 | 初始化 | P0 |
| 10.1 | Admin | cache status 命令 | `cache status` | 可讀輸出，包含所有指標 | CLI 輸出 | P2 |
| 10.2 | Admin | MCP 快取命令 | MCP call cache_stats | 返回有效 JSON | MCP 集成 | P1 |

---

## 優先級定義

- **P0**（Critical）：功能必須運作，無此項測試無法驗收
- **P1**（High）：功能重要，應納入測試套件
- **P2**（Medium）：良好特性，可後續新增

---

## 測試數據準備模板

### 小型 Vault（測試用）
```javascript
// 位置：/tmp/test-vault-xxx
// 包含：5 個筆記，2 種類型

mkdir -p /tmp/test-vault/projects /tmp/test-vault/ideas

cat > /tmp/test-vault/projects/api.md << 'EOF'
---
title: API Design
type: project
tags: [backend, api]
status: active
summary: Core API implementation
created: 2026-03-30
updated: 2026-03-30
---
# API Design
REST endpoints for data access
EOF

cat > /tmp/test-vault/ideas/vector-db.md << 'EOF'
---
title: Vector Database
type: idea
tags: [db, search, ai]
status: draft
summary: Integration with vector DB
created: 2026-03-30
updated: 2026-03-30
---
# Vector Database
Using embeddings for similarity search
EOF
```

### 中型 Vault（效能測試）
```bash
# 自動生成 100 個筆記
for i in {1..100}; do
  mkdir -p /tmp/large-vault/projects
  cat > /tmp/large-vault/projects/note-$i.md << EOF
---
title: Note $i
type: project
tags: [test, gen]
status: active
summary: Generated note $i
---
# Note $i
Content for note $i
EOF
done
```

---

## 執行檢查清單

### 前置準備
- [ ] Node.js v18.13.0+ 已安裝
- [ ] npm 依賴已安裝：`npm install`
- [ ] 測試框架可用：`node --test test/*.test.mjs`
- [ ] 臨時目錄可寫：`mkdir -p /tmp/clausidian-tests`

### Happy Path 測試
```bash
# 執行 1.1：新建快取
npm test -- test/search-cache.test.mjs --grep "cache hit"

# 執行 1.2：進程重啟
npm test -- test/search-cache.test.mjs --grep "persist"

# 執行 1.3：統計
npm test -- test/search-cache.test.mjs --grep "stats"
```

### Edge Case 測試
```bash
# 執行所有 edge case
npm test -- test/search-cache.test.mjs --grep "edge|ttl|empty|version"
```

### Error Path 測試
```bash
# 執行 I/O 錯誤場景
npm test -- test/search-cache.test.mjs --grep "error|io|corrupt|permission"
```

### Integration 測試
```bash
# 執行 vault 整合
npm test -- test/vault.test.mjs --grep "cache|search"
npm test -- test/commands.test.mjs --grep "cache"
```

### 全量測試
```bash
npm test
# 預期：≥450 tests pass, 0 failures
```

---

## 常見故障排除

| 問題 | 症狀 | 解決方式 |
|------|------|---------|
| 快取未命中 | stats.hits = 0 | 檢查 TTL 是否已過期；驗證 cache key 生成 |
| 磁碟寫入失敗 | .clausidian/cache.json 不存在 | 檢查目錄權限；驗證 saveToDisk() 被正確呼叫 |
| 進程間快取失效 | ProcessB 未讀取 ProcessA 的快取 | 驗證版本雜湊計算；檢查檔案路徑一致性 |
| 統計不準確 | hitRate != expected | 驗證 hits/misses 計數邏輯；檢查快取清空是否正確重置計數 |
| 搜尋速度未改善 | 快取命中但搜尋仍慢 | 檢查 search() 是否真的使用快取（非同步阻塞）；驗證結果序列化開銷 |

---

## 效能基準

| 操作 | 預期耗時 | 測試方法 |
|------|---------|---------|
| 首次搜尋（500 筆記） | <500ms | `console.time('search'); vault.search('test'); console.timeEnd('search');` |
| 快取命中搜尋 | <1ms | 相同搜尋第二次執行 |
| set() + saveToDisk() | <5ms | 測量記憶體側 set()，saveToDisk() 非同步 |
| cache stats | <10ms | 計算統計不應掃描 vault |
| 磁碟載入 | <50ms | loadFromDisk() 耗時 |

---

## 快取統計格式

```javascript
{
  totalEntries: 5,           // 快取中的項數
  validEntries: 4,           // 未過期的項數
  expiredEntries: 1,         // 已過期但未刪除的項數
  ttlMs: 300000,             // TTL 毫秒數
  hits: 12,                  // 命中計數
  misses: 8,                 // 未命中計數
  hitRate: 60.0,             // 百分比 (hits/(hits+misses)*100)
  vaultVersion: "sha256...", // vault 版本雜湊
  savedAt: 1711864200000,    // 最後儲存的時間戳記
  size: 2048                 // 快取大小（字節）
}
```

---

## 磁碟快取檔案格式

位置：`<vault-root>/.clausidian/cache.json`

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
        { "file": "api-design", "type": "project", "status": "active" }
      ],
      "timestamp": 1711864200000
    }
  ],
  "savedAt": 1711864200000
}
```

---

## 版本雜湊計算

```javascript
// computeVaultVersion() 應使用：
const fs = require('fs');
const path = require('path');

function computeVaultVersion(vaultPath) {
  // 檢查 _tags.md 和 _graph.md 的 mtime
  const tagsPath = path.join(vaultPath, '_tags.md');
  const graphPath = path.join(vaultPath, '_graph.md');

  const tagsMtime = fs.existsSync(tagsPath)
    ? fs.statSync(tagsPath).mtimeMs
    : 0;
  const graphMtime = fs.existsSync(graphPath)
    ? fs.statSync(graphPath).mtimeMs
    : 0;

  // 簡單組合（或使用 crypto.createHash('sha256')）
  return `version:${tagsMtime}:${graphMtime}`;
}
```

---

## MCP 命令暴露

在 `registry.mjs` 中註冊：

```javascript
{
  name: 'cache',
  description: 'Manage search cache',
  subcommands: [
    {
      name: 'stats',
      mcpName: 'cache_stats',
      description: 'Show cache statistics as JSON',
      async run(root, flags) {
        const vault = new Vault(root);
        return vault._clusterCache.stats();
      }
    },
    {
      name: 'clear',
      mcpName: 'cache_clear',
      description: 'Clear all cache entries',
      async run(root, flags) {
        const vault = new Vault(root);
        vault._clusterCache.clear();
        return { success: true };
      }
    },
    {
      name: 'status',
      mcpName: 'cache_status',
      description: 'Show human-readable cache status',
      async run(root, flags) {
        const vault = new Vault(root);
        const stats = vault._clusterCache.stats();
        // 格式化為可讀字符串
        return `Cache Size: ${stats.totalEntries}, Hit Rate: ${stats.hitRate}%`;
      }
    }
  ]
}
```

---

## 測試驗證工具

### 快取統計驗證函數
```javascript
function assertCacheStats(actual, expected) {
  assert.equal(actual.hits, expected.hits, 'hits mismatch');
  assert.equal(actual.misses, expected.misses, 'misses mismatch');
  assert.equal(actual.hitRate, expected.hitRate, 'hitRate mismatch');
  assert.equal(actual.totalEntries, expected.totalEntries, 'totalEntries mismatch');
}

// 使用
assertCacheStats(cache.stats(), { hits: 1, misses: 1, hitRate: 50, totalEntries: 1 });
```

### 快取一致性驗證
```javascript
function verifyCacheConsistency(cache, vault) {
  const stats = cache.stats();
  const validLimit = stats.hits + stats.misses;
  assert.ok(validLimit >= 0, 'hit/miss counters invalid');
  assert.equal(stats.totalEntries, cache.cache.size, 'entry count mismatch');
}
```

### 磁碟快取驗證
```javascript
function verifyCacheFile(filePath) {
  assert.ok(fs.existsSync(filePath), 'cache file not found');
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  assert.ok(data.version, 'version field missing');
  assert.ok(data.vaultVersion, 'vaultVersion field missing');
  assert.ok(Array.isArray(data.entries), 'entries is not array');
}
```

---

## 效能測試模板

```javascript
import { Vault } from '../src/vault.mjs';
import { SearchCache } from '../src/search-cache.mjs';

describe('Performance — Theme C Persistent Cache', () => {
  let vault;
  let tmpDir;

  before(() => {
    tmpDir = createLargeVault(500); // 500 筆記
    vault = new Vault(tmpDir, { searchCache: new SearchCache() });
  });

  it('first search completes in <500ms', () => {
    const start = performance.now();
    vault.search('test');
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 500, `search took ${elapsed}ms, expected <500ms`);
  });

  it('cached search completes in <1ms', () => {
    const start = performance.now();
    vault.search('test'); // 命中快取
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 1, `cached search took ${elapsed}ms, expected <1ms`);
  });

  it('cache persistence does not block search', () => {
    const start = performance.now();
    vault.search('feature');
    const elapsed = performance.now() - start;
    // saveToDisk() 應非同步，不應影響主線程
    assert.ok(elapsed < 5, `search with async save took ${elapsed}ms`);
  });
});
```

---

## 集成測試模板

```javascript
describe('Integration — Vault + Cache', () => {
  it('write invalidates search cache', () => {
    const cache = new SearchCache();
    const vault = new Vault(tmpDir, { searchCache: cache });

    // 預熱快取
    vault.search('api');
    assert.equal(cache.stats().misses, 1);

    // 寫入新筆記
    vault.write('projects', 'new.md', '---\ntitle: New\n---\n');

    // 快取應被清空
    assert.equal(cache.stats().totalEntries, 0);

    // 搜尋應未命中（視為新搜尋）
    vault.search('api');
    assert.equal(cache.stats().misses, 2);
  });

  it('process restart restores disk cache', async () => {
    // Process A
    let vault = new Vault(tmpDir, { searchCache: new SearchCache() });
    vault.search('feature');
    await vault._clusterCache.saveToDisk();

    // Process B（模擬新進程）
    vault = new Vault(tmpDir, { searchCache: new SearchCache() });
    await vault._clusterCache.loadFromDisk();

    // 應命中磁碟快取
    const statsB = vault._clusterCache.stats();
    assert.equal(statsB.hits, 1);
  });
});
```

---

## 相關資源

| 資源 | 位置 | 用途 |
|------|------|------|
| 完整規劃 | `docs/plans/2026-03-30-001-feat-clausidian-v3-1-0-mvp-plan.md` | 詳細設計 |
| 詳細場景 | `docs/test-scenarios-theme-c-persistent-cache.md` | 完整測試清單 |
| 代碼實現 | `src/search-cache.mjs` | 快取類 |
| 測試套件 | `test/search-cache.test.mjs` | 單元測試 |
| 命令實現 | `src/commands/cache.mjs` | 快取命令 |

---

**最後更新**：2026-03-30
**版本**：Clausidian v3.1.0 Theme C
**測試覆蓋**：26 個場景，分 4 個優先級
