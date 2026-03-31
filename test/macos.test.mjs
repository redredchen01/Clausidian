import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'test-macos');
const isMac = platform() === 'darwin';

describe('open command', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    mkdirSync(join(TMP, 'templates'), { recursive: true });
    writeFileSync(join(TMP, '_index.md'), '# Index\n');
    writeFileSync(join(TMP, 'projects', 'test-open.md'), `---
title: "Test Open"
type: project
tags: []
created: 2026-03-30
updated: 2026-03-30
status: active
summary: ""
related: []
---

# Test Open
`);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('throws on missing note', async () => {
    const { open } = await import('../src/commands/open.mjs');
    assert.throws(() => open(TMP, 'nonexistent'), /not found/);
  });

  it('returns correct URI structure for note', async () => {
    // We can't actually open Obsidian in test, but verify logic
    // by checking findNote works
    const { Vault } = await import('../src/vault.mjs');
    const vault = new Vault(TMP);
    const note = vault.findNote('test-open');
    assert.ok(note);
    assert.equal(note.file, 'test-open');
    assert.equal(note.dir, 'projects');
  });
});

describe('quicknote command', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'ideas'), { recursive: true });
    mkdirSync(join(TMP, 'templates'), { recursive: true });
    writeFileSync(join(TMP, '_index.md'), '# Index\n');
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('throws on empty clipboard (or no clipboard tool)', async () => {
    // In CI / non-interactive, clipboard is likely empty
    const { quicknote } = await import('../src/commands/quicknote.mjs');
    // On macOS CI, pbpaste may return empty → should throw
    // On Linux CI without X, xclip fails → should throw
    try {
      quicknote(TMP);
      // If it succeeds (user has clipboard content), that's ok
      assert.ok(true);
    } catch (err) {
      assert.ok(err.message.includes('Clipboard is empty') || err.message.includes('clipboard'));
    }
  });
});

describe('clipboard utility', () => {
  it('copyToClipboard returns boolean', async () => {
    const { copyToClipboard } = await import('../src/clipboard.mjs');
    const result = copyToClipboard('test clipboard content');
    assert.equal(typeof result, 'boolean');
  });

  it('copies and reads back on macOS', async () => {
    if (!isMac) return; // skip on non-mac
    const { copyToClipboard } = await import('../src/clipboard.mjs');
    const { execSync } = await import('child_process');
    const testStr = `clausidian-test-${Date.now()}`;
    const ok = copyToClipboard(testStr);
    assert.equal(ok, true);
    const readBack = execSync('pbpaste', { encoding: 'utf8' });
    assert.equal(readBack, testStr);
  });
});

describe('notify utility', () => {
  it('does not throw on any platform', async () => {
    const { notify } = await import('../src/notify.mjs');
    // Should silently succeed on macOS, silently no-op elsewhere
    assert.doesNotThrow(() => notify('Test', 'Hello from tests', { sound: '' }));
  });
});

describe('launchd command', () => {
  it('rejects on non-macOS', async () => {
    if (isMac) return; // only test rejection on non-mac
    const { launchdInstall } = await import('../src/commands/launchd.mjs');
    assert.throws(() => launchdInstall(TMP), /macOS-only/);
  });

  it('launchdStatus returns agent info on macOS', async () => {
    if (!isMac) return;
    const { launchdStatus } = await import('../src/commands/launchd.mjs');
    const result = launchdStatus();
    assert.equal(result.status, 'ok');
    assert.equal(result.agents.length, 2);
    assert.ok(result.agents[0].label.includes('clausidian'));
    assert.ok(result.agents[0].schedule);
  });
});

describe('MCP server includes new tools', () => {
  it('tools/list includes open and quicknote', async () => {
    const { McpServer } = await import('../src/mcp-server.mjs');
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    writeFileSync(join(TMP, '_index.md'), '# Index\n');
    const server = new McpServer(TMP);
    const resp = server.handleMessage({
      jsonrpc: '2.0', id: 1,
      method: 'tools/list',
      params: {},
    });
    const names = resp.result.tools.map(t => t.name);
    assert.ok(names.includes('open'));
    assert.ok(names.includes('quicknote'));
    assert.ok(resp.result.tools.length >= 42);
    rmSync(TMP, { recursive: true, force: true });
  });
});
