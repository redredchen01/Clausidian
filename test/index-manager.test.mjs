import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Vault } from '../src/vault.mjs';
import { IndexManager } from '../src/index-manager.mjs';

const TMP = join(import.meta.dirname, '..', 'tmp', 'test-index');

describe('IndexManager', () => {
  let vault, idx;

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    mkdirSync(join(TMP, 'journal'), { recursive: true });

    writeFileSync(join(TMP, 'projects', 'my-project.md'), `---
title: "My Project"
type: project
tags: [backend, api]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "A test project"
related: ["[[other-note]]"]
---

# My Project
`);

    writeFileSync(join(TMP, 'journal', '2026-03-27.md'), `---
title: "2026-03-27"
type: journal
tags: [daily]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: ""
related: []
---

# 2026-03-27
`);

    vault = new Vault(TMP);
    idx = new IndexManager(vault);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('rebuildTags creates _tags.md', () => {
    const result = idx.rebuildTags();
    assert.ok(result.tags > 0);
    assert.ok(result.notes > 0);
    const content = vault.read('_tags.md');
    assert.ok(content.includes('### backend'));
    assert.ok(content.includes('[[my-project]]'));
  });

  it('rebuildGraph creates _graph.md', () => {
    const result = idx.rebuildGraph();
    assert.ok(result.relationships > 0);
    const content = vault.read('_graph.md');
    assert.ok(content.includes('[[my-project]]'));
    assert.ok(content.includes('nav-prev'));
  });

  it('updateDirIndex creates/updates index', () => {
    idx.updateDirIndex('projects', 'my-project', 'A test project');
    const content = vault.read('projects', '_index.md');
    assert.ok(content.includes('[[my-project]]'));
    assert.ok(content.includes('A test project'));
  });

  it('sync rebuilds all indices', () => {
    const result = idx.sync();
    assert.ok(result.tags >= 0);
    assert.ok(result.notes >= 0);
    assert.ok(result.relationships >= 0);
  });
});
