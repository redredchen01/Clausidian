import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'test-base');

describe('yaml-lite', () => {
  it('parses simple key-value pairs', async () => {
    const { parseYaml } = await import('../src/yaml-lite.mjs');
    const result = parseYaml('name: hello\ncount: 42\nactive: true');
    assert.strictEqual(result.name, 'hello');
    assert.strictEqual(result.count, 42);
    assert.strictEqual(result.active, true);
  });

  it('parses flow arrays', async () => {
    const { parseYaml } = await import('../src/yaml-lite.mjs');
    const result = parseYaml('tags: [a, b, c]');
    assert.deepEqual(result.tags, ['a', 'b', 'c']);
  });

  it('parses block arrays', async () => {
    const { parseYaml } = await import('../src/yaml-lite.mjs');
    const result = parseYaml('items:\n  - one\n  - two\n  - three');
    assert.deepEqual(result.items, ['one', 'two', 'three']);
  });

  it('parses nested objects', async () => {
    const { parseYaml } = await import('../src/yaml-lite.mjs');
    const result = parseYaml('outer:\n  inner: value\n  count: 5');
    assert.strictEqual(result.outer.inner, 'value');
    assert.strictEqual(result.outer.count, 5);
  });

  it('serializes to YAML', async () => {
    const { toYaml } = await import('../src/yaml-lite.mjs');
    const yaml = toYaml({ name: 'test', count: 42, tags: ['a', 'b'] });
    assert.ok(yaml.includes('name: test'));
    assert.ok(yaml.includes('count: 42'));
    assert.ok(yaml.includes('[a, b]'));
  });

  it('round-trips simple objects', async () => {
    const { parseYaml, toYaml } = await import('../src/yaml-lite.mjs');
    const original = { name: 'test', active: true, count: 5 };
    const yaml = toYaml(original);
    const parsed = parseYaml(yaml);
    assert.deepEqual(parsed, original);
  });
});

describe('base commands', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    mkdirSync(join(TMP, 'areas'), { recursive: true });
    mkdirSync(join(TMP, 'templates'), { recursive: true });
    writeFileSync(join(TMP, '_index.md'), '# Index\n');
    writeFileSync(join(TMP, 'projects', 'api-service.md'), `---
title: "API Service"
type: project
tags: [api, backend]
created: 2026-03-30
updated: 2026-03-30
status: active
summary: "REST API service"
related: []
---
# API Service
`);
    writeFileSync(join(TMP, 'projects', 'old-project.md'), `---
title: "Old Project"
type: project
tags: [legacy]
created: 2026-01-01
updated: 2026-01-15
status: archived
summary: "Deprecated project"
related: []
---
# Old Project
`);
    writeFileSync(join(TMP, 'areas', 'backend.md'), `---
title: "Backend"
type: area
tags: [backend]
created: 2026-03-01
updated: 2026-03-30
status: active
summary: "Backend development area"
related: []
---
# Backend
`);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('creates a base file', async () => {
    const { baseCreate } = await import('../src/commands/base.mjs');
    const result = baseCreate(TMP, 'projects-view');
    assert.strictEqual(result.status, 'created');
    assert.ok(existsSync(join(TMP, 'projects-view.base')));
  });

  it('detects existing base', async () => {
    const { baseCreate } = await import('../src/commands/base.mjs');
    const result = baseCreate(TMP, 'projects-view');
    assert.strictEqual(result.status, 'exists');
  });

  it('reads a base file', async () => {
    const { baseRead } = await import('../src/commands/base.mjs');
    const data = baseRead(TMP, 'projects-view');
    assert.ok(data.views);
    assert.ok(Array.isArray(data.views));
  });

  it('queries vault with base filters', async () => {
    const { toYaml } = await import('../src/yaml-lite.mjs');
    // Create a base with filters
    writeFileSync(join(TMP, 'active-projects.base'), toYaml({
      filters: {
        and: ['status == "active"', 'file.hasTag("backend")'],
      },
      views: [{ type: 'table', name: 'Active Backend' }],
    }));

    const { baseQuery } = await import('../src/commands/base.mjs');
    const result = baseQuery(TMP, 'active-projects');
    assert.ok(result.count >= 1);
    // All results should be active + have backend tag
    for (const n of result.results) {
      assert.strictEqual(n.status, 'active');
      assert.ok(n.tags.includes('backend'));
    }
  });

  it('filters with != operator', async () => {
    const { toYaml } = await import('../src/yaml-lite.mjs');
    writeFileSync(join(TMP, 'not-archived.base'), toYaml({
      filters: { and: ['status != "archived"'] },
      views: [{ type: 'table', name: 'Not Archived' }],
    }));

    const { baseQuery } = await import('../src/commands/base.mjs');
    const result = baseQuery(TMP, 'not-archived');
    for (const n of result.results) {
      assert.notStrictEqual(n.status, 'archived');
    }
  });

  it('throws on missing base', async () => {
    const { baseRead } = await import('../src/commands/base.mjs');
    assert.throws(() => baseRead(TMP, 'nonexistent'), /not found/);
  });
});
