import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Vault } from '../src/vault.mjs';
import { IndexManager } from '../src/index-manager.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'test-index');

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
    assert.ok(content.includes('| nav |'));
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

describe('Incremental Sync', () => {
  let vault, idx;

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    mkdirSync(join(TMP, 'journal'), { recursive: true });

    // Create 5 test notes
    for (let i = 1; i <= 5; i++) {
      writeFileSync(join(TMP, 'projects', `note-${i}.md`), `---
title: "Note ${i}"
type: project
tags: [tag-a, tag-b]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Test note ${i}"
related: []
---

# Note ${i}
`);
    }

    vault = new Vault(TMP);
    idx = new IndexManager(vault);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('no changes detected when notes unchanged', () => {
    // First sync to build cache
    idx.sync();

    // Second sync: no changes expected
    const changes = vault.detectChanges();
    assert.strictEqual(changes.created.length, 0);
    assert.strictEqual(changes.modified.length, 0);
    assert.strictEqual(changes.deleted.length, 0);
    assert.strictEqual(changes.unchanged, 5);
  });

  it('detects modified notes', () => {
    idx.sync();

    // Modify one note
    const notePath = join(TMP, 'projects', 'note-1.md');
    const content = `---
title: "Note 1 Modified"
type: project
tags: [tag-a, tag-c]
created: 2026-03-27
updated: 2026-03-28
status: active
summary: "Test note 1 modified"
related: []
---

# Note 1 Modified
`;
    writeFileSync(notePath, content);
    vault.invalidateCache();

    // Detect change
    const changes = vault.detectChanges();
    assert.ok(changes.modified.length > 0);
    assert.ok(changes.modified.some(p => p.includes('note-1')));
  });

  it('detects newly created notes', () => {
    idx.sync();

    // Add a new note
    writeFileSync(join(TMP, 'projects', 'note-new.md'), `---
title: "Note New"
type: project
tags: [tag-x]
created: 2026-03-28
updated: 2026-03-28
status: active
summary: "New note"
related: []
---

# Note New
`);
    vault.invalidateCache();

    const changes = vault.detectChanges();
    assert.ok(changes.created.length > 0);
    assert.ok(changes.created.some(p => p.includes('note-new')));
  });

  it('detects deleted notes', () => {
    idx.sync();

    // Delete a note
    rmSync(join(TMP, 'projects', 'note-2.md'));
    vault.invalidateCache();

    const changes = vault.detectChanges();
    assert.ok(changes.deleted.length > 0);
    assert.ok(changes.deleted.some(p => p.includes('note-2')));
  });

  it('hash cache persists to .clausidian/hashes.json', () => {
    vault.detectChanges();

    const cacheFile = join(TMP, '.clausidian', 'hashes.json');
    assert.ok(existsSync(cacheFile), 'Cache file should exist');

    const cacheData = JSON.parse(readFileSync(cacheFile, 'utf8'));
    assert.ok(Object.keys(cacheData).length > 0, 'Cache should contain file hashes');
  });

  it('degraded gracefully when cache corrupted', () => {
    // Corrupt the cache
    mkdirSync(join(TMP, '.clausidian'), { recursive: true });
    writeFileSync(join(TMP, '.clausidian', 'hashes.json'), '{invalid json}');

    vault.invalidateCache();

    // Should not throw, should return valid changes
    const changes = vault.detectChanges();
    assert.ok(typeof changes.created === 'object');
    assert.ok(typeof changes.modified === 'object');
    assert.ok(typeof changes.deleted === 'object');
  });

  it('sync includes unchanged count in result', () => {
    vault.invalidateCache();
    const result = idx.sync();

    assert.ok('unchanged' in result || 'total' in result);
  });
});
