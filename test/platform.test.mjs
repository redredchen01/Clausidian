/**
 * Platform-specific tests — verify cross-platform behavior
 * These tests validate that path handling, line endings, and
 * filesystem operations work identically on Windows, macOS, and Linux.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname, sep } from 'path';
import { fileURLToPath } from 'url';
import { Vault } from '../src/vault.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'test-platform');

describe('cross-platform behavior', () => {
  let vault;

  before(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'projects'), { recursive: true });
    mkdirSync(join(TMP, 'journal'), { recursive: true });
    mkdirSync(join(TMP, 'ideas'), { recursive: true });

    writeFileSync(join(TMP, 'projects', 'test-note.md'), '---\ntitle: "Test Note"\ntype: project\ntags: [test]\ncreated: 2026-03-29\nupdated: 2026-03-29\nstatus: active\nsummary: "A test"\nrelated: []\n---\n\n# Test Note\n');

    vault = new Vault(TMP);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  // ── Path consistency ──

  it('vault.path() uses platform separator for FS operations', () => {
    const p = vault.path('projects', 'test-note.md');
    assert.ok(p.includes(sep), `Path should contain platform separator "${sep}"`);
  });

  it('vault.notePath() always uses forward slash for display', () => {
    const np = vault.notePath('projects', 'test-note');
    assert.equal(np, 'projects/test-note.md');
    assert.ok(!np.includes('\\'), 'notePath should never contain backslash');
  });

  it('vault.read() works with both segment styles', () => {
    // Segments (recommended)
    const a = vault.read('projects', 'test-note.md');
    assert.ok(a);
    // Single path with forward slash (also works, join normalizes)
    const b = vault.read('projects/test-note.md');
    assert.ok(b);
    assert.equal(a, b);
  });

  it('vault.write() normalizes CRLF to LF', () => {
    vault.write('ideas', 'crlf-test.md', '---\ntitle: "CRLF"\n---\r\n\r\n# Test\r\n');
    const content = readFileSync(join(TMP, 'ideas', 'crlf-test.md'), 'utf8');
    assert.ok(!content.includes('\r\n'), 'Written file should not contain CRLF');
    assert.ok(content.includes('\n'), 'Written file should contain LF');
  });

  it('vault.read() strips CRLF from files', () => {
    // Write raw CRLF content bypassing vault.write normalization
    writeFileSync(join(TMP, 'ideas', 'raw-crlf.md'), '---\r\ntitle: "Raw"\r\n---\r\n\r\n# Raw\r\n');
    const content = vault.read('ideas', 'raw-crlf.md');
    assert.ok(!content.includes('\r'), 'read() should strip all CR');
  });

  // ── Frontmatter parsing with mixed line endings ──

  it('parseFrontmatter works with LF content', () => {
    const fm = vault.parseFrontmatter('---\ntitle: "LF"\ntype: test\n---\n');
    assert.equal(fm.title, 'LF');
  });

  // ── updateNote uses vault methods (not string concat) ──

  it('updateNote works cross-platform', () => {
    vault.updateNote('projects', 'test-note', { summary: 'Cross-platform' });
    const content = vault.read('projects', 'test-note.md');
    assert.ok(content.includes('Cross-platform'));
  });

  // ── init generates .gitattributes ──

  it('init creates .gitattributes for line ending normalization', async () => {
    const initDir = join(TMP, 'init-test');
    const { init } = await import('../src/commands/init.mjs');
    init(initDir);
    assert.ok(existsSync(join(initDir, '.gitattributes')));
    const attrs = readFileSync(join(initDir, '.gitattributes'), 'utf8');
    assert.ok(attrs.includes('text=auto'));
    assert.ok(attrs.includes('*.md'));
    rmSync(initDir, { recursive: true, force: true });
  });

  // ── Return values always use forward slash ──

  it('command return paths use forward slash', async () => {
    const { note } = await import('../src/commands/note.mjs');
    const result = note(TMP, 'Platform Test', 'idea');
    assert.ok(result.file.includes('/'), 'Return path should use /');
    assert.ok(!result.file.includes('\\'), 'Return path should not use \\');
  });
});
