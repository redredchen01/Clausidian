import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Vault } from '../src/vault.mjs';

const TMP = join(import.meta.dirname, '..', 'tmp', 'test-vault');

describe('Vault', () => {
  let vault;

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    mkdirSync(join(TMP, 'ideas'), { recursive: true });

    writeFileSync(join(TMP, 'projects', 'build-api.md'), `---
title: "Build API"
type: project
tags: [backend, api]
created: 2026-03-27
updated: 2026-03-27
status: active
summary: "Build the core API"
related: []
---

# Build API
`);

    writeFileSync(join(TMP, 'ideas', 'vector-search.md'), `---
title: "Vector Search"
type: idea
tags: [search, ai]
created: 2026-03-27
updated: 2026-03-27
status: draft
summary: "Use vectors for retrieval"
related: []
---

# Vector Search
`);

    vault = new Vault(TMP);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('path resolves correctly', () => {
    assert.ok(vault.path('projects', 'build-api.md').endsWith('projects/build-api.md'));
  });

  it('exists checks files', () => {
    assert.equal(vault.exists('projects', 'build-api.md'), true);
    assert.equal(vault.exists('projects', 'nope.md'), false);
  });

  it('read returns content or null', () => {
    const content = vault.read('projects', 'build-api.md');
    assert.ok(content.includes('Build API'));
    assert.equal(vault.read('projects', 'nope.md'), null);
  });

  it('write creates files and directories', () => {
    vault.write('areas', 'test-area.md', '# Test');
    assert.equal(vault.exists('areas', 'test-area.md'), true);
    assert.ok(vault.read('areas', 'test-area.md').includes('# Test'));
  });

  it('parseFrontmatter extracts YAML', () => {
    const content = vault.read('projects', 'build-api.md');
    const fm = vault.parseFrontmatter(content);
    assert.equal(fm.title, 'Build API');
    assert.equal(fm.type, 'project');
    assert.deepEqual(fm.tags, ['backend', 'api']);
    assert.equal(fm.status, 'active');
  });

  it('scanNotes finds all notes', () => {
    const notes = vault.scanNotes();
    assert.ok(notes.length >= 2);
    const apiNote = notes.find(n => n.file === 'build-api');
    assert.ok(apiNote);
    assert.equal(apiNote.type, 'project');
  });

  it('search finds by keyword', () => {
    const results = vault.search('API');
    assert.ok(results.length >= 1);
    assert.equal(results[0].file, 'build-api');
  });

  it('search filters by type', () => {
    const results = vault.search('API', { type: 'idea' });
    assert.equal(results.length, 0);
  });

  it('findRelated returns scored matches', () => {
    const related = vault.findRelated('API backend', ['backend']);
    assert.ok(related.length >= 1);
    assert.equal(related[0].file, 'build-api');
  });

  it('typeDir maps correctly', () => {
    assert.equal(vault.typeDir('project'), 'projects');
    assert.equal(vault.typeDir('area'), 'areas');
    assert.equal(vault.typeDir('idea'), 'ideas');
    assert.equal(vault.typeDir('journal'), 'journal');
  });
});
