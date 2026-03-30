import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('embed-search', () => {
  it('embedStatus returns provider info', async () => {
    const { embedStatus } = await import('../src/commands/embed-search.mjs');
    const s = embedStatus();
    assert.ok('ollama' in s);
    assert.ok('openai' in s);
    assert.ok('active' in s);
  });

  it('falls back to BM25 when no provider available', async () => {
    const { embedSearch } = await import('../src/commands/embed-search.mjs');
    // Force provider off
    const { mkdirSync, rmSync, writeFileSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const TMP = join(__dirname, '..', 'tmp', 'test-embed');
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    mkdirSync(join(TMP, 'templates'), { recursive: true });
    writeFileSync(join(TMP, '_index.md'), '# Index\n');
    writeFileSync(join(TMP, 'projects', 'test.md'), `---
title: "Test Note"
type: project
tags: [test]
created: 2026-03-30
updated: 2026-03-30
status: active
summary: "A test note"
related: []
---

# Test Note
Some test content about API design.
`);

    const result = await embedSearch(TMP, 'API design', { provider: 'off' });
    // Should fallback to BM25 and still return results
    assert.ok(result.query === 'API design');
    assert.ok(Array.isArray(result.results));
    rmSync(TMP, { recursive: true, force: true });
  });
});
