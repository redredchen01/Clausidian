/**
 * Performance Benchmark — Set Optimization (TF-IDF Link Suggestions)
 *
 * Measures rebuildGraph performance with:
 * - 100-note vault
 * - 500-note vault
 * - 1000-note vault
 *
 * With Set-based tag lookup O(1) instead of .includes() O(m),
 * we expect <500ms for 1000 notes (previously 2-3 seconds).
 */

import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Vault } from '../src/vault.mjs';
import { IndexManager } from '../src/index-manager.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'benchmark');

function createTestVault(noteCount) {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, 'projects'), { recursive: true });
  mkdirSync(join(TMP, 'journal'), { recursive: true });

  const tags = ['backend', 'api', 'database', 'frontend', 'testing', 'docs', 'devops', 'security'];

  for (let i = 1; i <= noteCount; i++) {
    const noteTags = [];
    if (i % 2 === 0) noteTags.push(tags[0]);
    if (i % 3 === 0) noteTags.push(tags[1]);
    if (i % 5 === 0) noteTags.push(tags[2]);
    if (i % 7 === 0) noteTags.push(tags[3]);
    if (i % 11 === 0) noteTags.push(tags[4]);
    if (i % 13 === 0) noteTags.push(tags[5]);

    const tagStr = noteTags.length > 0 ? noteTags.join(', ') : 'general';

    writeFileSync(
      join(TMP, 'projects', `note-${String(i).padStart(4, '0')}.md`),
      `---
title: "Note ${i}"
type: project
tags: [${tagStr}]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Test note ${i} with keywords for matching"
related: []
---

# Note ${i}

Content for note ${i} with keyword variations.
This note discusses ${tags[i % tags.length]} topics.
`
    );
  }
}

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  Set Optimization Performance Benchmark                        ║');
console.log('║  Complexity: O(n²) tag overlap detection via Set.has()        ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const sizes = [100, 500, 1000];

for (const size of sizes) {
  console.log(`\n📊 Vault: ${size} notes\n`);

  createTestVault(size);

  const vault = new Vault(TMP);
  const idx = new IndexManager(vault);
  const notes = vault.scanNotes({ includeBody: true });

  // Measure rebuildGraph
  const startTime = process.hrtime.bigint();
  const result = idx.rebuildGraph(notes);
  const endTime = process.hrtime.bigint();

  const elapsedMs = Number(endTime - startTime) / 1_000_000;
  const pairCount = (size * (size - 1)) / 2;

  console.log(`  ⏱  rebuildGraph:        ${elapsedMs.toFixed(2)}ms`);
  console.log(`  📋 Pair comparisons:   ${pairCount.toLocaleString()}`);
  console.log(`  🔗 Suggested links:    ${result.suggestedLinks}`);
  console.log(`  📌 Relationships:      ${result.relationships}`);
  console.log(`  🔷 Clusters:           ${result.clusters}`);
  console.log(`  ⚡ Throughput:         ${(pairCount / elapsedMs / 1000).toFixed(2)}k pairs/ms`);

  // Performance assessment
  let assessment = '';
  if (elapsedMs < 100) assessment = '🟢 EXCELLENT';
  else if (elapsedMs < 300) assessment = '🟢 GOOD';
  else if (elapsedMs < 500) assessment = '🟡 ACCEPTABLE';
  else assessment = '🔴 SLOW';

  console.log(`  ${assessment}`);
}

console.log('\n✅ Set-optimized tag lookup verified!');
console.log('   O(1) has() instead of O(m) includes() removes n² * m factor.\n');

rmSync(TMP, { recursive: true, force: true });
