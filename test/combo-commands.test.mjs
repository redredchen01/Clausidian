/**
 * Tests for combo commands: thread, suggest, context
 * These commands combine existing primitives into novel functionality.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'test-combo');

describe('combo commands: thread, suggest, context', () => {
  before(async () => {
    rmSync(TMP, { recursive: true, force: true });
    const { init } = await import('../src/commands/init.mjs');
    init(TMP);

    // Create a project with history
    writeFileSync(join(TMP, 'projects', 'rust-backend.md'), `---
title: "Rust Backend"
type: project
tags: [rust, backend, api]
created: "2026-02-10"
updated: "2026-03-25"
status: active
summary: "Rewrite backend in Rust"
related: ["[[api-design]]"]
---

# Rust Backend

## Goal

Replace Node.js API with Rust for performance.

## TODO

- [ ] Set up Actix-web scaffolding
- [ ] Migrate auth endpoints
- [ ] Performance benchmarks
`);

    // Related resource
    writeFileSync(join(TMP, 'resources', 'api-design.md'), `---
title: "API Design Guide"
type: resource
tags: [api, design, backend]
created: "2026-01-20"
updated: "2026-03-20"
status: active
summary: "REST API design patterns"
related: ["[[rust-backend]]"]
---

# API Design Guide

References [[rust-backend]] for implementation.
`);

    // An idea sharing tags
    writeFileSync(join(TMP, 'ideas', 'grpc-migration.md'), `---
title: "gRPC Migration"
type: idea
tags: [backend, api, grpc]
created: "2026-03-10"
updated: "2026-03-10"
status: draft
summary: "Consider gRPC as alternative to REST"
related: []
---

# gRPC Migration

Could complement [[rust-backend]] approach.
`);

    // An area note
    writeFileSync(join(TMP, 'areas', 'systems-programming.md'), `---
title: "Systems Programming"
type: area
tags: [rust, systems, performance]
created: "2026-01-01"
updated: "2026-03-15"
status: active
summary: "Long-term focus on systems-level coding"
related: ["[[rust-backend]]"]
---

# Systems Programming
`);

    // A stale resource with backlinks (for suggest testing)
    writeFileSync(join(TMP, 'resources', 'old-deployment.md'), `---
title: "Old Deployment Guide"
type: resource
tags: [devops, deployment]
created: "2025-12-01"
updated: "2025-12-01"
status: active
summary: "Legacy deployment instructions"
related: []
---

# Old Deployment Guide
`);

    // Two notes referencing the stale resource
    writeFileSync(join(TMP, 'projects', 'infra-upgrade.md'), `---
title: "Infra Upgrade"
type: project
tags: [devops, deployment]
created: "2026-01-15"
updated: "2026-01-15"
status: active
summary: "Upgrade infrastructure"
related: ["[[old-deployment]]"]
---

# Infra Upgrade

See [[old-deployment]] for current process.
`);

    writeFileSync(join(TMP, 'areas', 'devops.md'), `---
title: "DevOps"
type: area
tags: [devops, ci-cd]
created: "2026-01-01"
updated: "2026-01-10"
status: active
summary: "DevOps practices"
related: ["[[old-deployment]]"]
---

# DevOps

References [[old-deployment]].
`);

    // Journal entries with mentions
    writeFileSync(join(TMP, 'journal', '2026-03-25.md'), `---
title: "2026-03-25"
type: journal
tags: [daily]
created: "2026-03-25"
updated: "2026-03-25"
status: active
summary: ""
---

# 2026-03-25 Tue

## Records

- Started [[rust-backend]] benchmark setup
- Read API Design Guide for patterns

## Ideas

- Maybe use gRPC instead of REST

## Tomorrow

- [ ] Finish benchmark script
- [ ] Review Rust Backend PR
`);

    writeFileSync(join(TMP, 'journal', '2026-03-27.md'), `---
title: "2026-03-27"
type: journal
tags: [daily]
created: "2026-03-27"
updated: "2026-03-27"
status: active
summary: ""
---

# 2026-03-27 Thu

## Records

- Completed [[rust-backend]] benchmarks — 3x faster than Node
- Updated Rust Backend project status

## Ideas

-

## Tomorrow

-
`);

    writeFileSync(join(TMP, 'journal', '2026-03-28.md'), `---
title: "2026-03-28"
type: journal
tags: [daily]
created: "2026-03-28"
updated: "2026-03-28"
status: active
summary: ""
---

# 2026-03-28 Fri

## Records

- Working on gRPC migration research
- Discussed Rust Backend with team

## Ideas

-

## Tomorrow

- [ ] Write gRPC comparison doc
- [ ] Update rust-backend TODO list
`);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  // ── thread ──

  describe('thread', () => {
    it('traces a note topic timeline', async () => {
      const { thread } = await import('../src/commands/thread.mjs');
      const result = thread(TMP, 'rust-backend');
      assert.equal(result.status, 'ok');
      assert.equal(result.topicType, 'note');
      assert.ok(result.eventCount >= 3, `Expected >= 3 events, got ${result.eventCount}`);
      assert.ok(result.firstSeen <= '2026-02-10');
      assert.ok(result.events.some(e => e.type === 'created'));
      assert.ok(result.events.some(e => e.type === 'journal-mention'));
    });

    it('traces a tag topic timeline', async () => {
      const { thread } = await import('../src/commands/thread.mjs');
      const result = thread(TMP, 'backend');
      assert.equal(result.status, 'ok');
      assert.equal(result.topicType, 'tag');
      assert.ok(result.eventCount >= 2);
    });

    it('traces a keyword topic timeline', async () => {
      const { thread } = await import('../src/commands/thread.mjs');
      const result = thread(TMP, 'gRPC');
      assert.equal(result.status, 'ok');
      assert.ok(result.eventCount >= 1);
    });

    it('respects --days filter', async () => {
      const { thread } = await import('../src/commands/thread.mjs');
      const all = thread(TMP, 'rust-backend');
      const limited = thread(TMP, 'rust-backend', { days: 5 });
      // Limited should have fewer or equal journal mentions
      const allJournal = all.events.filter(e => e.type === 'journal-mention');
      const limitedJournal = limited.events.filter(e => e.type === 'journal-mention');
      assert.ok(limitedJournal.length <= allJournal.length);
    });

    it('returns empty for unknown topic', async () => {
      const { thread } = await import('../src/commands/thread.mjs');
      const result = thread(TMP, 'nonexistent-xyz-12345');
      assert.equal(result.status, 'empty');
      assert.equal(result.events.length, 0);
    });

    it('requires topic argument', async () => {
      const { thread } = await import('../src/commands/thread.mjs');
      assert.throws(() => thread(TMP), /Usage/);
    });

    it('events are sorted chronologically', async () => {
      const { thread } = await import('../src/commands/thread.mjs');
      const result = thread(TMP, 'rust-backend');
      for (let i = 1; i < result.events.length; i++) {
        assert.ok(result.events[i].date >= result.events[i - 1].date,
          `Events should be sorted: ${result.events[i - 1].date} <= ${result.events[i].date}`);
      }
    });
  });

  // ── suggest ──

  describe('suggest', () => {
    it('generates daily suggestions', async () => {
      const { suggest } = await import('../src/commands/suggest.mjs');
      const result = suggest(TMP, { date: '2026-03-29', days: 7 });
      assert.ok(result.status === 'suggestions' || result.status === 'clear');
      assert.equal(result.date, '2026-03-29');
      assert.ok(Array.isArray(result.suggestions));
    });

    it('picks up carry-overs from yesterday', async () => {
      const { suggest } = await import('../src/commands/suggest.mjs');
      const result = suggest(TMP, { date: '2026-03-29', days: 7 });
      const carryOvers = result.suggestions.filter(s => s.category === 'carry-over');
      // Yesterday (2026-03-28) had Tomorrow items
      assert.ok(carryOvers.length >= 1, `Expected carry-overs from 2026-03-28, got ${carryOvers.length}`);
      assert.ok(carryOvers.some(c => c.text.includes('gRPC') || c.text.includes('rust-backend')));
    });

    it('flags stale notes with high backlink dependency', async () => {
      const { suggest } = await import('../src/commands/suggest.mjs');
      const result = suggest(TMP, { date: '2026-03-29', days: 7 });
      const staleItems = result.suggestions.filter(s => s.category === 'stale-urgent');
      // old-deployment is 118+ days stale with 2 backlinks
      assert.ok(staleItems.length >= 1, 'Should flag old-deployment as stale-urgent');
      assert.ok(staleItems.some(s => s.text.includes('old-deployment')));
    });

    it('flags low-momentum projects', async () => {
      const { suggest } = await import('../src/commands/suggest.mjs');
      const result = suggest(TMP, { date: '2026-03-29', days: 7 });
      const projectItems = result.suggestions.filter(s => s.category === 'project-momentum');
      // infra-upgrade has no journal mentions and is stale
      assert.ok(projectItems.some(s => s.text.includes('infra-upgrade')),
        'Should flag infra-upgrade as low-momentum');
    });

    it('suggestions are sorted by priority', async () => {
      const { suggest } = await import('../src/commands/suggest.mjs');
      const result = suggest(TMP, { date: '2026-03-29', days: 7 });
      for (let i = 1; i < result.suggestions.length; i++) {
        assert.ok(result.suggestions[i].priority >= result.suggestions[i - 1].priority,
          'Suggestions should be sorted by priority');
      }
    });

    it('returns clear when nothing actionable', async () => {
      // Create a minimal vault with no stale/low-momentum items
      const cleanDir = join(TMP, '..', 'test-combo-clean');
      rmSync(cleanDir, { recursive: true, force: true });
      const { init } = await import('../src/commands/init.mjs');
      init(cleanDir);
      const { suggest } = await import('../src/commands/suggest.mjs');
      const result = suggest(cleanDir, { date: '2026-03-29', days: 7 });
      assert.equal(result.status, 'clear');
      assert.equal(result.count, 0);
      rmSync(cleanDir, { recursive: true, force: true });
    });
  });

  // ── context ──

  describe('context', () => {
    it('assembles full context for a note', async () => {
      const { context } = await import('../src/commands/context.mjs');
      const result = context(TMP, 'rust-backend', { days: 30 });
      assert.equal(result.status, 'ok');
      assert.equal(result.note, 'rust-backend');
      assert.ok(result.backlinks >= 1, 'Should find backlinks');
      assert.ok(result.related >= 1, 'Should find related notes');
      assert.ok(result.journalMentions >= 1, 'Should find journal mentions');
      assert.ok(result.context.includes('Rust Backend'), 'Context should contain note title');
      assert.ok(result.context.includes('Backlinks'), 'Context should have backlinks section');
      assert.ok(result.context.includes('Related Notes'), 'Context should have related section');
    });

    it('finds cluster members via shared tags', async () => {
      const { context } = await import('../src/commands/context.mjs');
      const result = context(TMP, 'rust-backend', { days: 30 });
      // api-design shares backend+api tags
      assert.ok(result.clusterMembers >= 1, 'Should find cluster members');
      assert.ok(result.context.includes('Topic Cluster'));
    });

    it('finds content-similar notes', async () => {
      const { context } = await import('../src/commands/context.mjs');
      const result = context(TMP, 'rust-backend', { days: 30 });
      assert.ok(result.contentSimilar >= 0);
      assert.ok(result.context.includes('Content-Similar'));
    });

    it('includes journal mention excerpts', async () => {
      const { context } = await import('../src/commands/context.mjs');
      const result = context(TMP, 'rust-backend', { days: 30 });
      assert.ok(result.context.includes('benchmark') || result.context.includes('Rust'),
        'Context should include journal mention details');
    });

    it('writes to file with --output file', async () => {
      const { context } = await import('../src/commands/context.mjs');
      const result = context(TMP, 'rust-backend', { days: 30, output: 'file' });
      assert.ok(result.file);
      assert.ok(result.file.includes('context-rust-backend'));
      const filePath = join(TMP, result.file);
      assert.ok(existsSync(filePath), `File should exist: ${filePath}`);
      const content = readFileSync(filePath, 'utf8');
      assert.ok(content.includes('context-assembly'), 'File should have context-assembly tag');
    });

    it('rejects missing note', async () => {
      const { context } = await import('../src/commands/context.mjs');
      assert.throws(() => context(TMP, 'nonexistent-xyz'), /not found/);
    });

    it('requires note argument', async () => {
      const { context } = await import('../src/commands/context.mjs');
      assert.throws(() => context(TMP), /Usage/);
    });
  });

  // ── MCP integration ──

  describe('MCP integration', () => {
    it('MCP server exposes thread/suggest/context tools', async () => {
      const { McpServer } = await import('../src/mcp-server.mjs');
      const server = new McpServer(TMP);
      const res = server.handleMessage({
        jsonrpc: '2.0', id: 1,
        method: 'tools/list',
        params: {},
      });
      const names = res.result.tools.map(t => t.name);
      assert.ok(names.includes('thread'));
      assert.ok(names.includes('suggest'));
      assert.ok(names.includes('context'));
    });

    it('MCP tools/call thread works', async () => {
      const { McpServer } = await import('../src/mcp-server.mjs');
      const server = new McpServer(TMP);
      const res = await server.handleMessage({
        jsonrpc: '2.0', id: 2,
        method: 'tools/call',
        params: { name: 'thread', arguments: { topic: 'rust-backend' } },
      });
      assert.ok(res.result);
      const data = JSON.parse(res.result.content[0].text);
      assert.equal(data.status, 'ok');
      assert.ok(data.eventCount >= 1);
    });

    it('MCP tools/call suggest works', async () => {
      const { McpServer } = await import('../src/mcp-server.mjs');
      const server = new McpServer(TMP);
      const res = await server.handleMessage({
        jsonrpc: '2.0', id: 3,
        method: 'tools/call',
        params: { name: 'suggest', arguments: { date: '2026-03-29' } },
      });
      assert.ok(res.result);
      const data = JSON.parse(res.result.content[0].text);
      assert.ok(data.status === 'suggestions' || data.status === 'clear');
    });

    it('MCP tools/call context works', async () => {
      const { McpServer } = await import('../src/mcp-server.mjs');
      const server = new McpServer(TMP);
      const res = await server.handleMessage({
        jsonrpc: '2.0', id: 4,
        method: 'tools/call',
        params: { name: 'context', arguments: { note: 'rust-backend' } },
      });
      assert.ok(res.result);
      const data = JSON.parse(res.result.content[0].text);
      assert.equal(data.status, 'ok');
      assert.ok(data.context.includes('Rust Backend'));
    });
  });
});
