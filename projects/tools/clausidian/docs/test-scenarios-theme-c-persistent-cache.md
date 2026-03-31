---
title: Clausidian v3.1.0 Theme C — Persistent Cache Test Scenarios
type: test-plan
status: active
created: 2026-03-30
updated: 2026-03-30
tags: [cache, persistence, test, integration, theme-c]
---

# Clausidian v3.1.0 Theme C — Persistent Cache Test Scenarios

> **測試文檔組：** [執行摘要](TEST-SCENARIOS-SUMMARY.md) · [快速參考](test-scenarios-quick-reference.md) · **完整場景定義**（此文件）· [v3.1.0 計劃](plans/2026-03-30-001-feat-clausidian-v3-1-0-mvp-plan.md)

## 概述

本文檔為 Clausidian v3.1.0 Theme C 持久搜尋快取架構提供完整的測試場景清單。目標是讓實現者直接使用具體的測試輸入、動作和預期輸出，無需額外的設計工作。

**架構核心**：
- SearchCache：TTL 快取層，追蹤 hit/miss 統計
- ClusterCache：vault 版本感知的包裝層
- PersistenceLayer：磁碟序列化（`.clausidian/cache.json`）
- 自動失效：vault.write() → invalidateCache()

---

## 1. Happy Path 測試

### Scenario 1.1：新建快取並保存到磁碟

**前置條件**：
- vault path: `/tmp/test-vault-001`
- vault 包含 5 個筆記（area/project/idea 混合）
- SearchCache 未初始化

**測試輸入**：
```javascript
const vault = new Vault('/tmp/test-vault-001', { searchCache: new SearchCache() });
const results1 = vault.search('api');
const results2 = vault.search('api');
```

**預期動作**：
1. 第一次搜尋 `vault.search('api')` → 執行完整掃描 + 快取結果
2. 第二次搜尋同樣關鍵字 → 命中快取
3. 快取統計：hitCount = 1, missCount = 1

**預期輸出**：
```javascript
// 快取統計
const stats = vault.searchCache.stats();
assert.equal(stats.hits, 1);           // 第二次搜尋命中
assert.equal(stats.misses, 1);         // 第一次搜尋未命中
assert.equal(stats.hitRate, 50);       // 50% 命中率
assert.equal(stats.validEntries, 1);   // 1 個有效快取項
assert.ok(stats.totalEntries > 0);
```

**驗證方式**：
- [ ] 快取統計數字準確
- [ ] hit/miss 計數正確
- [ ] hitRate 計算正確 (hits/(hits+misses)*100)

---

### Scenario 1.2：進程重啟後恢復快取

**前置條件**：
- vault path: `/tmp/test-vault-002`
- vault 已經過一輪搜尋，快取儲存至 `.clausidian/cache.json`
- ProcessA 已結束，ProcessB 即將啟動

**測試輸入**：
```javascript
// ProcessA
const vault1 = new Vault('/tmp/test-vault-002');
vault1.search('vector');
// cache.json 已在磁碟上，包含 'vector' 的搜尋結果

// ProcessB (new process)
const vault2 = new Vault('/tmp/test-vault-002');
await vault2._clusterCache.loadFromDisk();
const results = vault2.search('vector');
```

**預期動作**：
1. ProcessA 的快取儲存到 `.clausidian/cache.json`
2. ProcessB 載入快取 → vault 版本驗證通過
3. ProcessB 的搜尋命中磁碟快取（無需重新掃描）

**預期輸出**：
```javascript
// 驗證快取已載入且可命中
const stats2 = vault2._clusterCache.stats();
assert.equal(stats2.hits, 1);    // ProcessB 的搜尋命中
assert.equal(stats2.misses, 0);  // 無未命中
assert.ok(fs.existsSync('/tmp/test-vault-002/.clausidian/cache.json'));
```

**驗證方式**：
- [ ] `.clausidian/cache.json` 存在
- [ ] 檔案內容是有效的 JSON
- [ ] 進程重啟後快取成功載入
- [ ] hit/miss 統計反映磁碟恢復

---

### Scenario 1.3：快取命中和未命中統計

**前置條件**：
- vault path: `/tmp/test-vault-003`
- vault 包含 10 個筆記，各種類型和標籤

**測試輸入**：
```javascript
const vault = new Vault('/tmp/test-vault-003', { searchCache: new SearchCache() });

// 多次搜尋，混合命中/未命中
const r1 = vault.search('project');      // miss #1
const r2 = vault.search('project');      // hit #1
const r3 = vault.search('area');         // miss #2
const r4 = vault.search('project');      // hit #2
const r5 = vault.search('area');         // hit #1
const r6 = vault.search('idea');         // miss #3
```

**預期動作**：
- 每個不同的關鍵字首次搜尋為未命中（未命中計數 +1）
- 後續相同關鍵字搜尋為命中（命中計數 +1）
- 統計累積追蹤所有操作

**預期輸出**：
```javascript
const stats = vault.searchCache.stats();
assert.equal(stats.hits, 3);      // r2, r4, r5
assert.equal(stats.misses, 3);    // r1, r3, r6
assert.equal(stats.hitRate, 50);  // 3/(3+3) = 50%
assert.equal(stats.totalEntries, 3); // 3 個唯一快取項
```

**驗證方式**：
- [ ] 命中計數準確
- [ ] 未命中計數準確
- [ ] 命中率計算正確

---

## 2. Edge Cases

### Scenario 2.1：空快取

**前置條件**：
- vault path: `/tmp/test-vault-empty`
- 剛剛初始化的 SearchCache，尚未進行任何搜尋

**測試輸入**：
```javascript
const cache = new SearchCache();
const stats = cache.stats();
const result = cache.get('anykey', {});
```

**預期動作**：
- 快取 get() 返回 null
- stats() 返回零統計

**預期輸出**：
```javascript
assert.equal(result, null);
assert.equal(stats.hits, 0);
assert.equal(stats.misses, 0);
assert.equal(stats.validEntries, 0);
assert.equal(stats.totalEntries, 0);
assert.equal(stats.hitRate, 0);
```

**驗證方式**：
- [ ] 空快取不返回虛假結果
- [ ] 統計正確反映空狀態

---

### Scenario 2.2：TTL 過期的 entries

**前置條件**：
- SearchCache 初始化，TTL = 100ms（短 TTL 用於測試）
- 快取中存在一個 entry，其時間戳記設為 150ms 前

**測試輸入**：
```javascript
const cache = new SearchCache(100); // 100ms TTL
cache.set('test', {}, ['result1']);
// 等待 150ms
await sleep(150);
const result = cache.get('test', {});
```

**預期動作**：
1. entry 於 150ms 後取得時，計算 age = now - timestamp = 150ms
2. age (150ms) > TTL (100ms) → 過期
3. entry 被刪除，返回 null
4. misses 計數增加

**預期輸出**：
```javascript
assert.equal(result, null);
const stats = cache.stats();
assert.equal(stats.hits, 0);
assert.equal(stats.misses, 1);
assert.equal(stats.validEntries, 0);
```

**驗證方式**：
- [ ] 過期 entry 正確偵測
- [ ] TTL 檢查精度 ±50ms
- [ ] 過期後自動刪除

---

### Scenario 2.3：Vault 版本不匹配

**前置條件**：
- vault path: `/tmp/test-vault-version`
- cache.json 存在，記錄的 vaultVersion = 'sha256:abc123...'
- 但當前 vault 的 _tags.md 或 _graph.md 已修改，新版本 = 'sha256:xyz789...'

**測試輸入**：
```javascript
// 載入舊快取，版本不符
const cached = loadCacheFromDisk('/tmp/test-vault-version/.clausidian/cache.json');
// cached.vaultVersion = 'sha256:abc123'

const currentVaultVersion = computeVaultVersion('/tmp/test-vault-version');
// currentVaultVersion = 'sha256:xyz789'

const shouldUseCache = cached.vaultVersion === currentVaultVersion;
```

**預期動作**：
- 版本不符 → 拒絕快取
- 快取被視為過期，重新掃描 vault

**預期輸出**：
```javascript
assert.notEqual(cached.vaultVersion, currentVaultVersion);
assert.equal(shouldUseCache, false);
// 新的搜尋執行完整掃描，結果被快取到新版本
```

**驗證方式**：
- [ ] 版本檢查正確比較
- [ ] 版本不符時快取被忽略
- [ ] 新搜尋使用當前版本

---

## 3. Error Paths

### Scenario 3.1：I/O 錯誤 — 磁碟滿

**前置條件**：
- vault path: `/tmp/test-vault-disk-full`
- 磁碟已滿（模擬：使用 mock fs 或限制分區大小）
- 快取嘗試寫入 `.clausidian/cache.json`

**測試輸入**：
```javascript
// 模擬磁碟滿
const mockFs = {
  writeFileSync: () => {
    throw new Error('ENOSPC: no space left on device');
  }
};

const cache = new SearchCache();
cache.set('test', {}, ['result']);
cache.saveToDisk('/tmp/test-vault-disk-full', mockFs);
```

**預期動作**：
1. saveToDisk() 嘗試寫入
2. 捕捉 ENOSPC 錯誤
3. 記錄警告，不拋出異常
4. 搜尋功能不受影響（快取在記憶體中仍可用）

**預期輸出**：
```javascript
// 磁碟寫入失敗，但搜尋仍可用
const result = cache.get('test', {});
assert.ok(result); // 記憶體中的快取仍存在
// 警告已記錄（檢查 console.warn 或 logger）
```

**驗證方式**：
- [ ] I/O 錯誤被正確捕捉
- [ ] 搜尋功能不被中斷
- [ ] 錯誤被記錄（調試用）

---

### Scenario 3.2：I/O 錯誤 — 權限不足

**前置條件**：
- vault path: `/tmp/test-vault-no-perm`
- `.clausidian/` 目錄權限為 r-x 只讀（無寫權限）

**測試輸入**：
```javascript
// 目錄無寫權限
fs.chmodSync('/tmp/test-vault-no-perm/.clausidian', 0o555);

const cache = new SearchCache();
cache.saveToDisk('/tmp/test-vault-no-perm');
```

**預期動作**：
1. writeFileSync 拋出 EACCES 錯誤
2. 錯誤被捕捉並記錄
3. 搜尋繼續使用記憶體快取

**預期輸出**：
```javascript
// 應當看到類似的日誌或統計
const stats = cache.stats();
assert.ok(stats.hits >= 0); // 快取功能完整
```

**驗證方式**：
- [ ] EACCES 錯誤被正確處理
- [ ] 快取在記憶體中仍可用
- [ ] 錯誤消息可讀

---

### Scenario 3.3：損壞的快取檔案 — 無效 JSON

**前置條件**：
- vault path: `/tmp/test-vault-corrupt`
- `.clausidian/cache.json` 包含無效的 JSON：`{ "version": 1, "invalid": }`

**測試輸入**：
```javascript
const corruptCacheFile = '/tmp/test-vault-corrupt/.clausidian/cache.json';
fs.writeFileSync(corruptCacheFile, '{ "version": 1, "invalid": }');

const cache = new SearchCache();
await cache.loadFromDisk(corruptCacheFile);
```

**預期動作**：
1. JSON.parse() 拋出 SyntaxError
2. 錯誤被捕捉
3. 快取初始化為空（清新開始）
4. 不拋出異常

**預期輸出**：
```javascript
const stats = cache.stats();
assert.equal(stats.totalEntries, 0);
assert.equal(stats.hits, 0);
assert.equal(stats.misses, 0);
// 搜尋可正常進行，從頭開始建立快取
```

**驗證方式**：
- [ ] JSON 解析錯誤被捕捉
- [ ] 快取安全地初始化為空
- [ ] 不發生級聯失敗

---

### Scenario 3.4：磁碟讀寫失敗 — 檔案鎖定

**前置條件**：
- vault path: `/tmp/test-vault-locked`
- `.clausidian/cache.json` 被另一進程持有（模擬）

**測試輸入**：
```javascript
// 模擬檔案被鎖定
const mockFs = {
  readFileSync: () => {
    throw new Error('EAGAIN: resource temporarily unavailable');
  }
};

const cache = new SearchCache();
cache.loadFromDisk('/tmp/test-vault-locked/.clausidian/cache.json', mockFs);
```

**預期動作**：
1. readFileSync 拋出 EAGAIN
2. 錯誤被捕捉
3. 快取降級為空，搜尋繼續

**預期輸出**：
```javascript
// 快取無法載入，但不影響搜尋
const result = await vault.search('test');
assert.ok(Array.isArray(result)); // 搜尋成功
```

**驗證方式**：
- [ ] 鎖定錯誤被正確處理
- [ ] 降級行為符合預期

---

## 4. Integration Scenarios

### Scenario 4.1：vault.write() 觸發快取失效

**前置條件**：
- vault 初始化，快取中已有搜尋結果
- 筆記列表：[api.md, utils.md, test.md]
- 快取中包含 'api' 的搜尋結果

**測試輸入**：
```javascript
const vault = new Vault('/tmp/test-vault-integration-1');
const cache = new SearchCache();
vault.searchCache = cache;

// 第一次搜尋
const r1 = vault.search('api');
assert.equal(cache.stats().misses, 1);

// 寫入新筆記
vault.write('projects', 'new-feature.md', '---\ntitle: New Feature\n---\n# Content');

// 第二次搜尋相同關鍵字
const r2 = vault.search('api');
```

**預期動作**：
1. vault.write() 完成 → 呼叫 invalidateCache()
2. invalidateCache() 清空 _notesCache 和搜尋快取
3. 後續的 search() 執行完整掃描（使用更新的筆記列表）
4. 搜尋結果可能不同（因為筆記數量改變）

**預期輸出**：
```javascript
const r2 = vault.search('api');
const stats = cache.stats();
assert.equal(stats.misses, 2); // 第二次搜尋也是未命中（因為已清空）
assert.equal(stats.hits, 0);   // 無命中
```

**驗證方式**：
- [ ] write() 後快取被正確清空
- [ ] 後續搜尋未命中（視為新搜尋）
- [ ] 快取統計更新

---

### Scenario 4.2：SelectiveInvalidation hook 整合

**前置條件**：
- vault 包含多個筆記
- 快取中存在多個搜尋結果

**測試輸入**：
```javascript
const vault = new Vault('/tmp/test-vault-integration-2');
const cache = new SearchCache();

// 快取多個搜尋
vault.search('project');  // miss #1
vault.search('project');  // hit #1
vault.search('api');      // miss #2
vault.search('api');      // hit #2

// 現在快取有 2 個 entry，stats: hits=2, misses=2

// 選擇性失效：只清除 'project' 相關的快取
vault._selectiveInvalidate(['project']);
```

**預期動作**：
1. 'project' 的快取 entry 被刪除
2. 'api' 的快取 entry 保留
3. 下次搜尋 'project' 未命中，搜尋 'api' 命中

**預期輸出**：
```javascript
const r1 = vault.search('project'); // miss → stats.misses = 3
const r2 = vault.search('api');     // hit → stats.hits = 3

const stats = cache.stats();
assert.equal(stats.hits, 3);
assert.equal(stats.misses, 3);
```

**驗證方式**：
- [ ] 選擇性失效正確識別受影響的項
- [ ] 其他快取項保留
- [ ] 統計準確反映操作

---

### Scenario 4.3：cache stats/clear 命令正常運作

**前置條件**：
- vault 已進行多輪搜尋
- 快取已保存到磁碟

**測試輸入**：
```javascript
// CLI: clausidian cache stats
const statsOutput = execSync('clausidian cache stats --vault /tmp/test-vault').toString();

// 預期輸出為有效 JSON
const stats = JSON.parse(statsOutput);
```

**預期動作**：
1. cache stats 命令執行
2. 從磁碟或記憶體讀取快取統計
3. 返回 JSON 格式的統計

**預期輸出**：
```javascript
assert.ok(stats.totalEntries >= 0);
assert.ok(stats.hits >= 0);
assert.ok(stats.misses >= 0);
assert.ok(typeof stats.hitRate === 'number');
assert.ok(stats.vaultVersion);
```

**驗證方式**：
- [ ] cache stats 返回有效 JSON
- [ ] 所有欄位存在且類型正確
- [ ] 統計數字一致

---

### Scenario 4.4：cache clear 命令清空磁碟快取

**前置條件**：
- `.clausidian/cache.json` 存在，包含快取數據

**測試輸入**：
```javascript
// 驗證檔案存在
assert.ok(fs.existsSync('/tmp/test-vault/.clausidian/cache.json'));

// CLI: clausidian cache clear
execSync('clausidian cache clear --vault /tmp/test-vault');

// 驗證檔案已刪除或清空
const fileExists = fs.existsSync('/tmp/test-vault/.clausidian/cache.json');
```

**預期動作**：
1. cache clear 執行
2. `.clausidian/cache.json` 被刪除或清空
3. 下次搜尋建立新快取

**預期輸出**：
```javascript
assert.equal(fileExists, false); // 檔案已刪除
// 或者
const content = fs.readFileSync('/tmp/test-vault/.clausidian/cache.json', 'utf8');
assert.equal(content, '{}'); // 內容已清空
```

**驗證方式**：
- [ ] cache clear 成功刪除/清空檔案
- [ ] 命令返回成功狀態
- [ ] 下次搜尋從空快取開始

---

## 5. Performance & Load Tests

### Scenario 5.1：大型 vault 的快取效能

**前置條件**：
- vault 包含 500 個筆記
- 快取 TTL = 5 分鐘

**測試輸入**：
```javascript
const vault = new Vault('/tmp/large-vault');
const cache = new SearchCache(300000); // 5 min TTL

console.time('first-search');
const r1 = vault.search('test');
console.timeEnd('first-search');

console.time('cached-search');
const r2 = vault.search('test');
console.timeEnd('cached-search');
```

**預期動作**：
- 第一次搜尋掃描所有 500 筆記，耗時 ~100-500ms
- 第二次搜尋命中快取，耗時 <1ms

**預期輸出**：
```
first-search: 250ms
cached-search: 0.5ms
```

**驗證方式**：
- [ ] 第一次搜尋耗時在合理範圍 (<500ms)
- [ ] 快取命中耗時 <1ms
- [ ] 性能提升至少 100 倍

---

### Scenario 5.2：快取寫入不阻塞搜尋

**前置條件**：
- 快取使用非同步 saveToDisk()
- vault path: `/tmp/test-vault-async`

**測試輸入**：
```javascript
const cache = new SearchCache();
const largeResults = new Array(1000).fill({ file: 'note', type: 'project' });

const startTime = Date.now();
cache.set('bigquery', {}, largeResults);
cache.saveToDisk('/tmp/test-vault-async'); // 非同步，不等待
const endTime = Date.now();

console.log(`set + saveToDisk took ${endTime - startTime}ms`);
```

**預期動作**：
- saveToDisk() 非同步執行
- set() 立即返回，不等待磁碟 I/O

**預期輸出**：
```
set + saveToDisk took ~1-5ms  // 只包括記憶體操作
// 磁碟寫入在後台進行，不阻塞
```

**驗證方式**：
- [ ] set() 返回耗時 <5ms
- [ ] 磁碟寫入不阻塞主線程
- [ ] 搜尋响应時間不受磁碟寫入影響

---

## 6. Concurrency & Multi-Session Tests

### Scenario 6.1：多個搜尋同時進行

**前置條件**：
- vault 初始化
- SearchCache 實例

**測試輸入**：
```javascript
const vault = new Vault('/tmp/test-vault-concurrent');
const cache = new SearchCache();
vault.searchCache = cache;

// 同時發起多個搜尋
const promises = [
  Promise.resolve(vault.search('api')),
  Promise.resolve(vault.search('test')),
  Promise.resolve(vault.search('api')),   // 應命中
  Promise.resolve(vault.search('test')),  // 應命中
];

const results = await Promise.all(promises);
```

**預期動作**：
- 第 1、2 個搜尋未命中（執行掃描）
- 第 3、4 個搜尋命中（使用快取）
- 無競態條件或數據損壞

**預期輸出**：
```javascript
const stats = cache.stats();
assert.equal(stats.hits, 2);
assert.equal(stats.misses, 2);
assert.equal(stats.hitRate, 50);
```

**驗證方式**：
- [ ] 快取統計準確（無競態錯誤）
- [ ] 所有搜尋完成
- [ ] 無異常拋出

---

### Scenario 6.2：進程間快取共享（多進程場景）

**前置條件**：
- 兩個獨立進程訪問同一 vault
- `.clausidian/cache.json` 為共享檔案

**測試輸入**：
```javascript
// ProcessA
const vault1 = new Vault('/tmp/shared-vault');
vault1.search('feature');
// cache.json 被 ProcessA 寫入

// ProcessB
const vault2 = new Vault('/tmp/shared-vault');
vault2._clusterCache.loadFromDisk();
const result = vault2.search('feature');
```

**預期動作**：
1. ProcessA 建立快取，保存到磁碟
2. ProcessB 讀取磁碼快取，版本驗證
3. ProcessB 搜尋命中

**預期輸出**：
```javascript
// ProcessB 的統計
const stats2 = vault2._clusterCache.stats();
assert.equal(stats2.hits, 1);
assert.equal(stats2.misses, 0);
```

**驗證方式**：
- [ ] 磁碟快取可被多進程讀取
- [ ] 版本驗證避免過期數據
- [ ] 無檔案鎖定衝突

---

## 7. 版本追蹤 & 失效場景

### Scenario 7.1：vault 版本變化自動失效快取

**前置條件**：
- vault path: `/tmp/test-vault-version-change`
- 快取已建立，vaultVersion 已記錄

**測試輸入**：
```javascript
const vault = new Vault('/tmp/test-vault-version-change');
const initialVersion = vault._computeVaultVersion();

// 修改 _tags.md（模擬 sync 或 update）
vault.write('_tags.md', '...[modified content]...');
const newVersion = vault._computeVaultVersion();

// 版本已變化
assert.notEqual(initialVersion, newVersion);
```

**預期動作**：
1. vault 修改觸發版本變化
2. ClusterCache 偵測到版本不同
3. 快取被自動失效

**預期輸出**：
```javascript
// 嘗試讀取舊快取時被拒絕
const shouldUseOldCache = initialVersion === newVersion;
assert.equal(shouldUseOldCache, false);
```

**驗證方式**：
- [ ] 版本雜湊正確計算
- [ ] 版本變化被正確偵測
- [ ] 快取自動失效

---

### Scenario 7.2：只有部分 vault 文件更新

**前置條件**：
- vault path: `/tmp/test-vault-partial-update`
- 快取使用選擇性失效機制

**測試輸入**：
```javascript
const vault = new Vault('/tmp/test-vault-partial-update');

// 快取多個搜尋
vault.search('alpha');
vault.search('bravo');

// 只修改 'alpha' 相關的筆記
vault.write('areas', 'alpha-note.md', '...');

// alpha 相關的快取應失效，bravo 的應保留
const r1 = vault.search('alpha');   // miss
const r2 = vault.search('bravo');   // hit
```

**預期動作**：
1. 文件修改被追蹤（dirty tracking）
2. 只清除相關的快取 entry
3. 其他 entry 保留

**預期輸出**：
```javascript
const stats = cache.stats();
// stats 應反映：alpha 未命中，bravo 命中
```

**驗證方式**：
- [ ] 選擇性失效正常運作
- [ ] 其他快取項保留
- [ ] 效能較全量失效更佳

---

## 8. 邊界 & 限制情況

### Scenario 8.1：快取大小上限

**前置條件**：
- SearchCache 設置最大容量 = 100 entries

**測試輸入**：
```javascript
const cache = new SearchCache(300000, { maxEntries: 100 });

// 插入 150 個 entry
for (let i = 0; i < 150; i++) {
  cache.set(`keyword-${i}`, {}, [`result-${i}`]);
}

const stats = cache.stats();
```

**預期動作**：
- 超過上限的 entry 被清除（FIFO 或 LRU）
- 快取大小穩定在 100

**預期輸出**：
```javascript
assert.equal(stats.totalEntries, 100); // 上限限制
```

**驗證方式**：
- [ ] 快取大小不超過上限
- [ ] 清除策略清晰一致
- [ ] 性能不因大量 entry 而劣化

---

### Scenario 8.2：特殊字符和正則表達式搜尋

**前置條件**：
- vault 包含多個筆記
- 快取需要支持特殊字符作為 key

**測試輸入**：
```javascript
const cache = new SearchCache();

// 特殊字符搜尋
const r1 = vault.search('api.*', { regex: true });
const r2 = vault.search('api.*', { regex: true }); // 應命中

// 快取 key 應正確序列化
const key = cache._getCacheKey('api.*', { regex: true });
```

**預期動作**：
- 特殊字符被正確編碼為 cache key
- 相同的搜尋參數產生相同的 key
- 快取命中符合預期

**預期輸出**：
```javascript
const stats = cache.stats();
assert.equal(stats.hits, 1);
assert.equal(stats.misses, 1);
```

**驗證方式**：
- [ ] 特殊字符正確處理
- [ ] 正則表達式搜尋可快取
- [ ] key 生成一致

---

## 9. 恢復 & 降級場景

### Scenario 9.1：損壞快取的優雅降級

**前置條件**：
- `.clausidian/cache.json` 存在但內容損壞

**測試輸入**：
```javascript
// 損壞快取檔案
fs.writeFileSync('/tmp/test-vault/.clausidian/cache.json', 'not json');

const vault = new Vault('/tmp/test-vault');
const result = vault.search('test');
```

**預期動作**：
1. 載入快取時 JSON 解析失敗
2. 快取被忽略（不拋出異常）
3. 搜尋執行完整掃描
4. 搜尋結果正確

**預期輸出**：
```javascript
assert.ok(Array.isArray(result)); // 搜尋成功
assert.ok(result.length >= 0);    // 可能有結果
```

**驗證方式**：
- [ ] 損壞快取不導致搜尋失敗
- [ ] 結果正確（未使用損壞數據）
- [ ] 無異常拋出

---

### Scenario 9.2：快取缺失時的回退

**前置條件**：
- 新 vault 初始化，無 `.clausidian/` 目錄

**測試輸入**：
```javascript
const vault = new Vault('/tmp/brand-new-vault');
const result = vault.search('test');
```

**預期動作**：
1. loadFromDisk() 嘗試讀取不存在的檔案
2. 檔案不存在錯誤被捕捉
3. 快取初始化為空
4. 搜尋執行完整掃描

**預期輸出**：
```javascript
assert.ok(Array.isArray(result));
// 可能為空（如果 vault 無筆記）
```

**驗證方式**：
- [ ] 快取缺失被正確處理
- [ ] 搜尋功能無損
- [ ] 新快取自動建立

---

## 10. 文檔與管理場景

### Scenario 10.1：cache status 命令可讀輸出

**前置條件**：
- vault 已進行若干搜尋
- 快取已建立

**測試輸入**：
```bash
clausidian cache status --vault /tmp/test-vault
```

**預期輸出**：
```
Cache Status
═════════════════════════════════
  Cache Size: 5 entries
  Hit Rate: 60% (12 hits, 8 misses)
  Age: 45 seconds
  TTL: 5 minutes
  Vault Version: sha256:abc123...
  Last Updated: 2026-03-30T10:30:00Z
═════════════════════════════════
```

**驗證方式**：
- [ ] 輸出格式清晰易讀
- [ ] 所有統計信息呈現
- [ ] 時間戳記準確

---

### Scenario 10.2：MCP 快取命令可調用

**前置條件**：
- MCP 伺服器運行
- 快取命令已在 registry 中註冊

**測試輸入**：
```javascript
// MCP call: cache_stats
const result = await mcpClient.call('cache_stats', { vault: '/tmp/test-vault' });
```

**預期動作**：
- MCP 伺服器響應快取統計請求
- 返回 JSON 格式結果

**預期輸出**：
```javascript
assert.ok(result.totalEntries >= 0);
assert.ok(result.hitRate >= 0);
```

**驗證方式**：
- [ ] MCP 命令正確暴露
- [ ] 回應格式符合 schema
- [ ] MCP 可調用 cache 命令

---

## 執行順序與依賴

建議執行順序：

1. **基礎測試** (2.1, 2.2, 2.3)：驗證快取核心機制
2. **Happy Path** (1.1-1.3)：驗證正常工作流
3. **Error Paths** (3.1-3.4)：驗證錯誤處理
4. **Integration** (4.1-4.4)：驗證與 vault 的整合
5. **Performance** (5.1-5.2)：性能基線
6. **Concurrency** (6.1-6.2)：並行場景
7. **Advanced** (7-10)：高級功能

---

## 檢查清單

### 實現驗證
- [ ] SearchCache 類初始化無誤
- [ ] TTL 機制運作正確
- [ ] hit/miss 統計準確
- [ ] 磁碟 I/O 非同步且不阻塞
- [ ] 版本追蹤正確
- [ ] 錯誤處理優雅
- [ ] MCP 命令可調用
- [ ] CLI 命令輸出清晰

### 性能指標
- [ ] 第一次搜尋 <500ms（500 筆記）
- [ ] 快取命中 <1ms
- [ ] set() + saveToDisk() <5ms
- [ ] 快取大小 <10MB（典型 vault）

### 持久性
- [ ] 進程重啟後快取恢復
- [ ] 版本變化時快取失效
- [ ] 損壞快取優雅降級
- [ ] 磁碟滿等 I/O 錯誤不中斷搜尋

---

## 相關檔案

- `src/search-cache.mjs` — 快取實現
- `src/vault.mjs` — Vault 整合點
- `test/search-cache.test.mjs` — 單元測試
- `test/vault.test.mjs` — 整合測試
- `src/commands/cache.mjs` — 快取命令
- `.clausidian/cache.json` — 磁碟格式

---

**最後更新**：2026-03-30
**版本**：Clausidian v3.1.0 Theme C
