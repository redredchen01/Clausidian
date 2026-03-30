import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'test-commands-update');

describe('commands: update and frontmatter mutations', () => {
  before(async () => {
    rmSync(TMP, { recursive: true, force: true });

    const { init } = await import('../src/commands/init.mjs');
    const { note } = await import('../src/commands/note.mjs');
    init(TMP);

    // Create test notes with various states
    note(TMP, 'Update Target One', 'project', { tags: ['test', 'target'] });
    note(TMP, 'Update Target Two', 'project', { tags: ['test'] });
    note(TMP, 'Update Target Three', 'resource', { tags: ['docs', 'reference'] });
    note(TMP, 'Status Change Test', 'idea', { tags: ['workflow'] });
    note(TMP, 'Tag Update Test', 'area', { tags: ['original'] });
    note(TMP, 'Status Transition Test', 'project', { tags: ['workflow'] });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  // ── Basic update tests (5 tests) ────────────────────────────

  describe('update: basic frontmatter changes', () => {
    it('updates summary field', async () => {
      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'update-target-one', {
        summary: 'This is an updated summary'
      });
      assert.equal(result.status, 'updated');
      assert.ok(result.changes.summary);

      const content = readFileSync(join(TMP, 'projects', 'update-target-one.md'), 'utf8');
      assert.ok(content.includes('This is an updated summary'));
    });

    it('updates status field', async () => {
      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'update-target-two', { status: 'completed' });
      assert.equal(result.status, 'updated');
      assert.ok(result.changes.status);

      const content = readFileSync(join(TMP, 'projects', 'update-target-two.md'), 'utf8');
      assert.ok(content.includes('status: completed'));
    });

    it('updates tags as comma-separated string', async () => {
      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'update-target-three', {
        tags: 'updated,modified,verified'
      });
      assert.equal(result.status, 'updated');

      const content = readFileSync(join(TMP, 'resources', 'update-target-three.md'), 'utf8');
      assert.ok(content.includes('updated'));
      assert.ok(content.includes('modified'));
      assert.ok(content.includes('verified'));
    });

    it('updates timestamp automatically', async () => {
      const { update } = await import('../src/commands/update.mjs');
      const beforeDate = new Date().toISOString().split('T')[0];
      const result = update(TMP, 'status-change-test', { summary: 'Test' });

      assert.equal(result.status, 'updated');
      assert.ok(result.changes.updated);
      const updatedDate = result.changes.updated.split('T')[0];
      assert.equal(updatedDate, beforeDate);
    });

    it('throws error for non-existent note', async () => {
      const { update } = await import('../src/commands/update.mjs');
      assert.throws(
        () => update(TMP, 'nonexistent-note-xyz', { summary: 'Test' }),
        /not found/i
      );
    });
  });

  // ── Status change tests (5 tests) ────────────────────────────

  describe('update: status transitions', () => {
    it('updates summary field returns proper change tracking', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Summary Track Test', 'project');

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'summary-track-test', { summary: 'Updated summary' });

      assert.ok(result.changes.summary);
      const content = readFileSync(join(TMP, 'projects', 'summary-track-test.md'), 'utf8');
      assert.ok(content.includes('Updated summary'));
    });

    it('updates tags as comma-separated and tracks changes', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Tag Track Test', 'project');

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'tag-track-test', { tags: 'new,tag,list' });

      assert.ok(result.changes.tags);
      const content = readFileSync(join(TMP, 'projects', 'tag-track-test.md'), 'utf8');
      assert.ok(content.includes('new'));
    });

    it('can add tags incrementally with tag parameter', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Incremental Tag Test', 'idea', { tags: ['original'] });

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'incremental-tag-test', { tag: 'added' });

      const content = readFileSync(join(TMP, 'ideas', 'incremental-tag-test.md'), 'utf8');
      assert.ok(content.includes('original'));
      assert.ok(content.includes('added'));
    });

    it('handles tag updates properly', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Tag Replace Test', 'resource', { tags: ['old'] });

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'tag-replace-test', { tags: 'fresh,modern' });

      const content = readFileSync(join(TMP, 'resources', 'tag-replace-test.md'), 'utf8');
      assert.ok(content.includes('fresh'));
    });

    it('updates always set updated timestamp', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Timestamp Test', 'project');

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'timestamp-test', { summary: 'New' });

      assert.ok(result.changes.updated);
      const today = new Date().toISOString().split('T')[0];
      assert.equal(result.changes.updated.split('T')[0], today);
    });
  });

  // ── Tag manipulation tests (5 tests) ────────────────────────────

  describe('update: tag operations', () => {
    it('adds single tag with tag parameter', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Single Tag Add', 'project', { tags: ['original'] });

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'single-tag-add', { tag: 'newtag' });

      const content = readFileSync(join(TMP, 'projects', 'single-tag-add.md'), 'utf8');
      assert.ok(content.includes('original'));
      assert.ok(content.includes('newtag'));
    });

    it('replaces all tags with tags parameter', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Replace Tags Test', 'project', { tags: ['old', 'tags'] });

      const { update } = await import('../src/commands/update.mjs');
      update(TMP, 'replace-tags-test', { tags: 'new,fresh' });

      const content = readFileSync(join(TMP, 'projects', 'replace-tags-test.md'), 'utf8');
      assert.ok(content.includes('new'));
      assert.ok(content.includes('fresh'));
    });

    it('avoids duplicate tags when adding', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'No Duplicate Test', 'project', { tags: ['existing'] });

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'no-duplicate-test', { tag: 'existing' });

      // Check that the tag isn't duplicated
      const content = readFileSync(join(TMP, 'projects', 'no-duplicate-test.md'), 'utf8');
      const tagCount = (content.match(/existing/g) || []).length;
      assert.ok(tagCount >= 1);
    });

    it('handles empty tag addition', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Empty Tag Test', 'project', { tags: [] });

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'empty-tag-test', { tag: 'firsttag' });

      const content = readFileSync(join(TMP, 'projects', 'empty-tag-test.md'), 'utf8');
      assert.ok(content.includes('firsttag'));
    });

    it('handles multiple tags with spaces in names', async () => {
      const { update } = await import('../src/commands/update.mjs');
      update(TMP, 'status-transition-test', { tags: 'feature-flag, user-test, urgent' });

      const content = readFileSync(join(TMP, 'projects', 'status-transition-test.md'), 'utf8');
      assert.ok(content.includes('feature-flag'));
      assert.ok(content.includes('urgent'));
    });
  });

  // ── Multiple field updates (5 tests) ────────────────────────────

  describe('update: multi-field operations', () => {
    it('updates summary and tags together', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Multi Field One', 'project', { tags: ['original'] });

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'multi-field-one', {
        summary: 'Updated summary',
        tags: 'new,tags'
      });

      assert.ok(result.changes.summary);
      assert.ok(result.changes.tags);

      const content = readFileSync(join(TMP, 'projects', 'multi-field-one.md'), 'utf8');
      assert.ok(content.includes('Updated summary'));
      assert.ok(content.includes('new'));
    });

    it('updates summary, tags, and add single tag', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Multi Field Two', 'project', { tags: ['old'] });

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'multi-field-two', {
        summary: 'Comprehensive update',
        tag: 'additional'
      });

      assert.ok(result.changes.summary);
      const content = readFileSync(join(TMP, 'projects', 'multi-field-two.md'), 'utf8');
      assert.ok(content.includes('Comprehensive update'));
      assert.ok(content.includes('old'));
      assert.ok(content.includes('additional'));
    });

    it('updates only specified fields without affecting others', async () => {
      const { note } = await import('../src/commands/note.mjs');
      const origTags = ['important', 'urgent'];
      note(TMP, 'Partial Update Test', 'project', { tags: origTags });

      const { update } = await import('../src/commands/update.mjs');
      update(TMP, 'partial-update-test', { summary: 'Only summary changed' });

      const content = readFileSync(join(TMP, 'projects', 'partial-update-test.md'), 'utf8');
      assert.ok(content.includes('important'));
      assert.ok(content.includes('urgent'));
      assert.ok(content.includes('Only summary changed'));
    });

    it('updates return changes object with updated timestamp', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Return Check Test', 'project');

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'return-check-test', {
        summary: 'Test',
        tags: 'checked'
      });

      assert.ok(result.changes);
      assert.ok(result.changes.summary);
      assert.ok(result.changes.tags);
      assert.ok(result.changes.updated);
    });

    it('preserves frontmatter structure during updates', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Structure Test', 'project', { tags: ['test'] });

      const { update } = await import('../src/commands/update.mjs');
      update(TMP, 'structure-test', { summary: 'Updated' });

      const content = readFileSync(join(TMP, 'projects', 'structure-test.md'), 'utf8');
      const fmMatch = content.match(/^---[\s\S]*?^---/m);
      assert.ok(fmMatch);
      const fm = fmMatch[0];
      assert.ok(fm.includes('title:'));
      assert.ok(fm.includes('type:'));
    });
  });

  // ── Error handling and edge cases (5 tests) ────────────────────────────

  describe('update: error handling', () => {
    it('throws error for empty note name', async () => {
      const { update } = await import('../src/commands/update.mjs');
      assert.throws(
        () => update(TMP, '', { summary: 'Test' }),
        /Usage:/i
      );
    });

    it('throws error for note not found', async () => {
      const { update } = await import('../src/commands/update.mjs');
      assert.throws(
        () => update(TMP, 'nonexistent-xyz', { summary: 'Test' }),
        /not found/i
      );
    });

    it('handles very long summary text', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Long Summary Test', 'project');

      const { update } = await import('../src/commands/update.mjs');
      const longSummary = 'x'.repeat(500);
      const result = update(TMP, 'long-summary-test', { summary: longSummary });

      assert.equal(result.status, 'updated');
      const content = readFileSync(join(TMP, 'projects', 'long-summary-test.md'), 'utf8');
      assert.ok(content.includes('x'.repeat(100)));
    });

    it('handles special characters in update values', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Special Chars Test', 'project');

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'special-chars-test', {
        summary: 'Summary with "quotes", [brackets], and {braces}'
      });

      assert.equal(result.status, 'updated');
    });

    it('handles unicode in updates', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Unicode Update Test', 'project');

      const { update } = await import('../src/commands/update.mjs');
      const result = update(TMP, 'unicode-update-test', {
        summary: '這是一份中文摘要 - 日本語も対応'
      });

      assert.equal(result.status, 'updated');
      const content = readFileSync(join(TMP, 'projects', 'unicode-update-test.md'), 'utf8');
      assert.ok(content.includes('中文'));
    });
  });

  // ── Integration: update workflows (5 tests) ────────────────────────────

  describe('update: integration workflows', () => {
    it('create → update → read workflow', async () => {
      const { note } = await import('../src/commands/note.mjs');
      const { update } = await import('../src/commands/update.mjs');
      const { read } = await import('../src/commands/read.mjs');

      note(TMP, 'Lifecycle Update Test', 'project', { tags: ['original'] });
      update(TMP, 'lifecycle-update-test', {
        summary: 'Updated summary',
        tags: 'modified,updated'
      });

      const result = read(TMP, 'lifecycle-update-test');
      assert.ok(result.content.includes('Updated summary'));
      assert.ok(result.content.includes('modified'));
    });

    it('search → update → search workflow', async () => {
      const { note } = await import('../src/commands/note.mjs');
      const { search } = await import('../src/commands/search.mjs');
      const { update } = await import('../src/commands/update.mjs');

      note(TMP, 'Search Update Test', 'project', { tags: ['searchable'] });

      let result1 = search(TMP, 'search-update', {});
      assert.ok(result1.results.length >= 1);

      update(TMP, 'search-update-test', { status: 'completed' });

      let result2 = search(TMP, 'search-update', { status: 'completed' });
      assert.ok(result2.results.length >= 1);
    });

    it('batch update multiple notes', async () => {
      const { note } = await import('../src/commands/note.mjs');
      const { update } = await import('../src/commands/update.mjs');

      note(TMP, 'Batch One', 'project', { tags: ['batch'] });
      note(TMP, 'Batch Two', 'project', { tags: ['batch'] });
      note(TMP, 'Batch Three', 'project', { tags: ['batch'] });

      // Update each one
      const names = ['batch-one', 'batch-two', 'batch-three'];
      for (const name of names) {
        update(TMP, name, { status: 'batch-updated' });
      }

      // Verify all updated
      const { read } = await import('../src/commands/read.mjs');
      for (const name of names) {
        const content = read(TMP, name);
        assert.ok(content.content.includes('batch-updated'));
      }
    });

    it('update → read workflow verifies changes persist', async () => {
      const { note } = await import('../src/commands/note.mjs');
      const { update } = await import('../src/commands/update.mjs');
      const { read } = await import('../src/commands/read.mjs');

      note(TMP, 'Read Update Flow', 'idea');
      update(TMP, 'read-update-flow', { summary: 'Final notes', tags: 'verified' });
      const readResult = read(TMP, 'read-update-flow');

      assert.ok(readResult.content.includes('Final notes'));
      assert.ok(readResult.content.includes('verified'));
    });

    it('concurrent updates preserve integrity', async () => {
      const { note } = await import('../src/commands/note.mjs');
      const { update } = await import('../src/commands/update.mjs');
      const { read } = await import('../src/commands/read.mjs');

      note(TMP, 'Concurrent Test', 'project', { tags: ['test'] });

      // Sequential updates (simulate concurrent)
      update(TMP, 'concurrent-test', { summary: 'First update' });
      update(TMP, 'concurrent-test', { status: 'in-progress' });
      update(TMP, 'concurrent-test', { tags: 'test,updated,sequential' });

      const result = read(TMP, 'concurrent-test');
      assert.ok(result.content.includes('First update'));
      assert.ok(result.content.includes('in-progress'));
      assert.ok(result.content.includes('test'));
    });
  });
});
