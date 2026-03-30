/**
 * smart-search — BM25 ranked search across vault notes
 *
 * Unlike basic keyword search, this uses BM25 relevance ranking:
 * - Multi-word queries work naturally ("API design patterns")
 * - Term frequency saturation (3 mentions ≈ 30 mentions)
 * - Document length normalization (short and long notes compete fairly)
 * - Field weighting (title 3×, tags 2×, summary 2×, body 1×)
 */

import { Vault } from '../vault.mjs';
import { BM25Index } from '../bm25.mjs';

export function smartSearch(vaultRoot, query, opts = {}) {
  if (!query) throw new Error('Usage: clausidian smart-search <query>');

  const vault = new Vault(vaultRoot);
  const notes = vault.scanNotes({ includeBody: true });

  const index = new BM25Index();
  index.build(notes);

  const results = index.search(query, {
    type: opts.type,
    tag: opts.tag,
    status: opts.status,
    limit: opts.limit || 20,
  });

  if (results.length === 0) {
    console.log(`No results for "${query}"`);
    return { query, results: [] };
  }

  console.log(`\nFound ${results.length} result(s) for "${query}" (BM25 ranked):\n`);
  console.log('| File | Type | Score | Summary |');
  console.log('|------|------|-------|---------|');
  for (const r of results) {
    console.log(`| [[${r.file.replace(/\.md$/, '')}]] | ${r.type} | ${r.score} | ${r.summary || '-'} |`);
  }

  return { query, results };
}
