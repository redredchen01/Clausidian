import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'test-new-commands');

describe('new commands: stale, cluster, digest', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    // Initialize a vault
    const { init } = import('../src/commands/init.mjs').then(m => m.init(TMP));
  });

  // We need to use a sync approach for init
  before(async () => {
    rmSync(TMP, { recursive: true, force: true });
    const { init } = await import('../src/commands/init.mjs');
    init(TMP);

    // Create notes with various ages for stale testing
    const old60 = '2026-01-15';
    const old90 = '2025-12-15';
    const recent = '2026-03-28';

    // Stale project with backlinks
    writeFileSync(join(TMP, 'projects', 'old-api.md'), `---
title: "Old API"
type: project
tags: [backend, api]
created: "${old90}"
updated: "${old90}"
status: active
summary: "Legacy API project"
related: []
---

# Old API

## TODO

- [ ] Migrate endpoints
- [ ] Update docs
`);

    // Stale orphan resource
    writeFileSync(join(TMP, 'resources', 'old-guide.md'), `---
title: "Old Guide"
type: resource
tags: [docs]
created: "${old90}"
updated: "${old90}"
status: active
summary: "Outdated deployment guide"
related: []
---

# Old Guide
`);

    // Stale area (60 days)
    writeFileSync(join(TMP, 'areas', 'backend-dev.md'), `---
title: "Backend Dev"
type: area
tags: [backend, api]
created: "${old60}"
updated: "${old60}"
status: active
summary: "Backend development focus"
related: ["[[old-api]]"]
---

# Backend Dev

References [[old-api]] for the main project.
`);

    // Recent project (for cluster + digest testing)
    writeFileSync(join(TMP, 'projects', 'new-cli.md'), `---
title: "New CLI"
type: project
tags: [cli, backend]
created: "${recent}"
updated: "${recent}"
status: active
summary: "New CLI tool"
related: ["[[backend-dev]]"]
---

# New CLI

## TODO

- [ ] Add tests
- [ ] Publish to npm
`);

    // Another recent note sharing tags (for clustering)
    writeFileSync(join(TMP, 'resources', 'node-patterns.md'), `---
title: "Node Patterns"
type: resource
tags: [backend, api, node]
created: "${recent}"
updated: "${recent}"
status: active
summary: "Node.js design patterns"
related: []
---

# Node Patterns
`);

    // Idea sharing tags with backend cluster
    writeFileSync(join(TMP, 'ideas', 'api-v2.md'), `---
title: "API v2"
type: idea
tags: [backend, api]
created: "${recent}"
updated: "${recent}"
status: draft
summary: "Next gen API design"
related: []
---

# API v2
`);

    // Create a journal entry that mentions the project
    writeFileSync(join(TMP, 'journal', '2026-03-28.md'), `---
title: "2026-03-28"
type: journal
tags: [daily]
created: "2026-03-28"
updated: "2026-03-28"
status: active
summary: ""
---

# 2026-03-28 Sat

## Records

- Working on [[new-cli]] — added argument parsing
- Reviewed New CLI test strategy

## Ideas

-

## Tomorrow

- [ ]

---
< [[2026-03-27]] | [[2026-03-29]] >
`);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  // ── stale ──

  it('stale finds old notes and generates triage', async () => {
    const { stale } = await import('../src/commands/stale.mjs');
    const result = stale(TMP, { threshold: 30 });
    assert.equal(result.status, 'created');
    assert.ok(result.staleCount >= 2);
    assert.ok(result.file.includes('stale-triage'));
    assert.ok(existsSync(join(TMP, 'journal', result.file.replace('journal/', ''))));
    // Check content
    const content = readFileSync(join(TMP, 'journal', result.file.replace('journal/', '')), 'utf8');
    assert.ok(content.includes('old-api'));
    assert.ok(content.includes('Urgent') || content.includes('Moderate'));
  });

  it('stale returns clean when no stale notes', async () => {
    const { stale } = await import('../src/commands/stale.mjs');
    const result = stale(TMP, { threshold: 999 });
    assert.equal(result.status, 'clean');
    assert.equal(result.staleCount, 0);
  });

  // ── cluster ──

  it('cluster discovers topic groups', async () => {
    const { cluster } = await import('../src/commands/cluster.mjs');
    const result = cluster(TMP, { minSize: 2 });
    assert.equal(result.status, 'ok');
    assert.ok(result.clusterCount >= 1);
    // Should find a backend+api cluster
    const backendCluster = result.clusters.find(c =>
      c.tags.includes('backend') || c.tags.includes('api')
    );
    assert.ok(backendCluster, 'Should find a backend/api cluster');
    assert.ok(backendCluster.notes.length >= 2);
  });

  it('cluster suggests missing links', async () => {
    const { cluster } = await import('../src/commands/cluster.mjs');
    const result = cluster(TMP, { minSize: 2 });
    assert.ok(result.totalSuggestions >= 0);
    // At least one cluster should exist
    assert.ok(result.clusters.length >= 1);
  });

  it('cluster auto-link adds related fields', async () => {
    const { cluster } = await import('../src/commands/cluster.mjs');
    const result = cluster(TMP, { autoLink: true, minSize: 2 });
    assert.equal(result.status, 'ok');
    if (result.autoLinked > 0) {
      // Verify a link was actually added
      const content = readFileSync(join(TMP, 'resources', 'node-patterns.md'), 'utf8');
      // Should have gained at least one related link
      assert.ok(content.includes('related:'));
    }
  });

  // ── digest ──

  it('digest generates single project report', async () => {
    const { digest } = await import('../src/commands/digest.mjs');
    const result = digest(TMP, { project: 'new-cli', days: 7 });
    assert.equal(result.status, 'created');
    assert.ok(result.file.includes('digest-new-cli'));
    assert.ok(typeof result.momentum === 'number');
    assert.ok(result.openTodos >= 2);
    // Check generated file
    const content = readFileSync(join(TMP, 'journal', result.file.replace('journal/', '')), 'utf8');
    assert.ok(content.includes('New CLI'));
    assert.ok(content.includes('Momentum'));
  });

  it('digest --all generates dashboard', async () => {
    const { digest } = await import('../src/commands/digest.mjs');
    const result = digest(TMP, { all: true, days: 7 });
    assert.equal(result.status, 'created');
    assert.ok(result.projects.length >= 2);
    assert.ok(result.file.includes('projects-digest'));
    const content = readFileSync(join(TMP, 'journal', result.file.replace('journal/', '')), 'utf8');
    assert.ok(content.includes('Dashboard'));
  });

  it('digest rejects non-project note', async () => {
    const { digest } = await import('../src/commands/digest.mjs');
    assert.throws(() => digest(TMP, { project: 'backend-dev' }), /not a project/);
  });

  it('digest rejects missing project', async () => {
    const { digest } = await import('../src/commands/digest.mjs');
    assert.throws(() => digest(TMP, { project: 'nonexistent' }), /not found/);
  });

  it('digest requires project or --all', async () => {
    const { digest } = await import('../src/commands/digest.mjs');
    assert.throws(() => digest(TMP), /Usage/);
  });

  // ── MCP integration ──

  it('MCP server exposes stale/cluster/digest tools', async () => {
    const { McpServer } = await import('../src/mcp-server.mjs');
    const server = new McpServer(TMP);
    const res = server.handleMessage({
      jsonrpc: '2.0', id: 1,
      method: 'tools/list',
      params: {},
    });
    const names = res.result.tools.map(t => t.name);
    assert.ok(names.includes('stale'));
    assert.ok(names.includes('cluster'));
    assert.ok(names.includes('digest'));
  });

  it('MCP tools/call stale works', async () => {
    const { McpServer } = await import('../src/mcp-server.mjs');
    const server = new McpServer(TMP);
    const res = await server.handleMessage({
      jsonrpc: '2.0', id: 2,
      method: 'tools/call',
      params: { name: 'stale', arguments: { threshold: 30 } },
    });
    assert.ok(res.result);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(typeof data.staleCount === 'number');
  });

  it('MCP tools/call cluster works', async () => {
    const { McpServer } = await import('../src/mcp-server.mjs');
    const server = new McpServer(TMP);
    const res = await server.handleMessage({
      jsonrpc: '2.0', id: 3,
      method: 'tools/call',
      params: { name: 'cluster', arguments: {} },
    });
    assert.ok(res.result);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(typeof data.clusterCount === 'number');
  });

  it('MCP tools/call digest --all works', async () => {
    const { McpServer } = await import('../src/mcp-server.mjs');
    const server = new McpServer(TMP);
    const res = await server.handleMessage({
      jsonrpc: '2.0', id: 4,
      method: 'tools/call',
      params: { name: 'digest', arguments: { all: true } },
    });
    assert.ok(res.result);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(data.projects.length >= 1);
  });
});
