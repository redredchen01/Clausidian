/**
 * Performance test for incremental sync
 * Verifies that sync completes <500ms with 100 unchanged notes
 */
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Vault } from '../src/vault.mjs';
import { IndexManager } from '../src/index-manager.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'perf-incremental');

console.log('Performance Test: Incremental Sync\n');

// Setup: Create 100 test notes
rmSync(TMP, { recursive: true, force: true });
mkdirSync(join(TMP, 'projects'), { recursive: true });

for (let i = 1; i <= 100; i++) {
  writeFileSync(join(TMP, 'projects', `note-${i.toString().padStart(3, '0')}.md`), `---
title: "Note ${i}"
type: project
tags: [tag-a, tag-b, tag-${i % 5}]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Test note ${i}"
related: ["[[note-${i > 1 ? i - 1 : 1}]]"]
---

# Note ${i}

Content for note ${i}.
`);
}

const vault = new Vault(TMP);
const idx = new IndexManager(vault);

// First sync: establishes cache
console.log('1. First sync (builds cache)...');
const t1Start = performance.now();
const result1 = idx.sync();
const t1End = performance.now();
console.log(`   Time: ${(t1End - t1Start).toFixed(2)}ms`);
console.log(`   Result: ${result1.notes} notes processed\n`);

// Second sync: no changes (should be fast)
console.log('2. Second sync (no changes, cache hit)...');
const t2Start = performance.now();
const result2 = idx.sync();
const t2End = performance.now();
const t2Duration = t2End - t2Start;
console.log(`   Time: ${t2Duration.toFixed(2)}ms`);
console.log(`   Result: unchanged=${result2.unchanged}, total=${result2.total}`);

// Verify performance target
const targetMs = 500;
if (t2Duration < targetMs) {
  console.log(`   ✓ PASS: <${targetMs}ms (${t2Duration.toFixed(2)}ms)\n`);
} else {
  console.log(`   ✗ FAIL: >=${targetMs}ms (${t2Duration.toFixed(2)}ms)\n`);
}

// Third sync: modify 1 note
console.log('3. Modify one note, sync again...');
writeFileSync(join(TMP, 'projects', 'note-050.md'), `---
title: "Note 50 Modified"
type: project
tags: [tag-a, tag-modified]
created: 2026-03-27
updated: 2026-03-28
status: active
summary: "Modified note 50"
related: []
---

# Note 50 Modified
`);
vault.invalidateCache();

const t3Start = performance.now();
const result3 = idx.sync();
const t3End = performance.now();
console.log(`   Time: ${(t3End - t3Start).toFixed(2)}ms`);
console.log(`   Result: changed=${result3.changed}\n`);

// Cleanup
rmSync(TMP, { recursive: true, force: true });

console.log('Performance Test Complete');
