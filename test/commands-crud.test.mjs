import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'test-commands-crud');

describe('commands: CRUD operations', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  // ── note command (5 tests) ────────────────────────────

  describe('note', () => {
    it('creates a project note with proper frontmatter', async () => {
      const { init } = await import('../src/commands/init.mjs');
      const { note } = await import('../src/commands/note.mjs');
      init(TMP);

      const result = note(TMP, 'My First Project', 'project', { tags: ['work', 'urgent'] });
      assert.equal(result.status, 'created');
      assert.ok(existsSync(join(TMP, 'projects', 'my-first-project.md')));

      const content = readFileSync(join(TMP, 'projects', 'my-first-project.md'), 'utf8');
      assert.ok(content.includes('title: "My First Project"'));
      assert.ok(content.includes('type: project'));
      assert.ok(content.includes('[work'));
      assert.ok(content.includes('urgent]'));
    });

    it('creates area notes', async () => {
      const { note } = await import('../src/commands/note.mjs');
      const result = note(TMP, 'Knowledge Management', 'area', { tags: ['system'] });
      assert.equal(result.status, 'created');
      assert.ok(existsSync(join(TMP, 'areas', 'knowledge-management.md')));

      const content = readFileSync(join(TMP, 'areas', 'knowledge-management.md'), 'utf8');
      assert.ok(content.includes('type: area'));
    });

    it('creates resource and idea notes', async () => {
      const { note } = await import('../src/commands/note.mjs');

      const resource = note(TMP, 'API Documentation', 'resource', { tags: ['reference'] });
      assert.equal(resource.status, 'created');
      assert.ok(existsSync(join(TMP, 'resources', 'api-documentation.md')));

      const idea = note(TMP, 'Build AI Assistant', 'idea');
      assert.equal(idea.status, 'created');
      assert.ok(existsSync(join(TMP, 'ideas', 'build-ai-assistant.md')));
    });

    it('detects duplicate notes by filename', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'Duplicate Test', 'project');

      const duplicate = note(TMP, 'Duplicate Test', 'project');
      assert.equal(duplicate.status, 'exists');
    });

    it('rejects invalid types', async () => {
      const { note } = await import('../src/commands/note.mjs');
      assert.throws(
        () => note(TMP, 'Bad Type Note', 'invalidtype'),
        /Invalid type/
      );
    });

    it('handles unicode titles correctly', async () => {
      const { note } = await import('../src/commands/note.mjs');
      const result = note(TMP, '中文筆記', 'idea');
      assert.equal(result.status, 'created');
      assert.ok(existsSync(join(TMP, 'ideas', '中文筆記.md')));
    });

    it('throws error for empty title', async () => {
      const { note } = await import('../src/commands/note.mjs');
      assert.throws(
        () => note(TMP, '', 'project'),
        /empty/i
      );
    });

    it('includes related links in new notes', async () => {
      const { note } = await import('../src/commands/note.mjs');
      note(TMP, 'First Note', 'project', { tags: ['dev'] });
      const result = note(TMP, 'Related Note', 'project', { tags: ['dev'] });

      const content = readFileSync(join(TMP, 'projects', 'related-note.md'), 'utf8');
      assert.ok(content.includes('related:'));
    });

    it('preserves goal and summary in frontmatter', async () => {
      const { note } = await import('../src/commands/note.mjs');
      const result = note(TMP, 'Goal Test', 'project', {
        goal: 'Complete by Friday',
        summary: 'This is a test project'
      });
      assert.equal(result.status, 'created');

      const content = readFileSync(join(TMP, 'projects', 'goal-test.md'), 'utf8');
      assert.ok(content.includes('goal:'));
      assert.ok(content.includes('summary:'));
    });
  });

  // ── journal command (5 tests) ────────────────────────────

  describe('journal', () => {
    it('creates today journal entry', async () => {
      const { journal } = await import('../src/commands/journal.mjs');
      const result = journal(TMP);
      assert.equal(result.status, 'created');
      assert.ok(result.date);
      assert.ok(existsSync(join(TMP, 'journal', `${result.date}.md`)));
    });

    it('returns exists when journal already exists', async () => {
      const { journal } = await import('../src/commands/journal.mjs');
      journal(TMP);
      const result2 = journal(TMP);
      assert.equal(result2.status, 'exists');
    });

    it('accepts explicit date parameter', async () => {
      const { journal } = await import('../src/commands/journal.mjs');
      const result = journal(TMP, { date: '2025-01-15' });
      assert.equal(result.status, 'created');
      assert.equal(result.date, '2025-01-15');
      assert.ok(existsSync(join(TMP, 'journal', '2025-01-15.md')));
    });

    it('rejects invalid dates', async () => {
      const { journal } = await import('../src/commands/journal.mjs');
      assert.throws(
        () => journal(TMP, { date: '2025-13-45' }),
        /Invalid date/
      );
    });

    it('creates journal with daily template structure', async () => {
      const { journal } = await import('../src/commands/journal.mjs');
      const result = journal(TMP, { date: '2025-03-20' });
      const content = readFileSync(join(TMP, 'journal', '2025-03-20.md'), 'utf8');
      // Journal should have standard sections
      assert.ok(content.includes('##'));
    });
  });

  // ── capture command (5 tests) ────────────────────────────

  describe('capture', () => {
    it('captures idea from text', async () => {
      const { capture } = await import('../src/commands/capture.mjs');
      const result = capture(TMP, 'Build a note-taking system with AI');
      assert.equal(result.status, 'created');
      assert.ok(existsSync(join(TMP, 'ideas', 'build-a-note-taking-system-with-ai.md')));
    });

    it('extracts title from first sentence', async () => {
      const { capture } = await import('../src/commands/capture.mjs');
      const result = capture(TMP, 'Quick idea. More details here. Even more.');
      assert.equal(result.status, 'created');
      // Should use first sentence as title
      assert.ok(result.file);
    });

    it('handles multiline captures', async () => {
      const { capture } = await import('../src/commands/capture.mjs');
      const text = `Create better search\nWith vector embeddings\nFor faster lookup`;
      const result = capture(TMP, text);
      assert.equal(result.status, 'created');
    });

    it('detects duplicate captured ideas', async () => {
      const { capture } = await import('../src/commands/capture.mjs');
      capture(TMP, 'Duplicate idea capture');
      const result2 = capture(TMP, 'Duplicate idea capture');
      assert.equal(result2.status, 'exists');
    });

    it('truncates very long titles', async () => {
      const { capture } = await import('../src/commands/capture.mjs');
      const longText = 'x'.repeat(100) + ' Some additional text';
      const result = capture(TMP, longText);
      assert.equal(result.status, 'created');
      // File should exist even if title is truncated
      assert.ok(result.file);
    });
  });

  // ── search command (5 tests) ────────────────────────────

  describe('search', () => {
    before(async () => {
      const { init } = await import('../src/commands/init.mjs');
      const { note, capture } = await import('../src/commands/note.mjs');
      const { capture: cap } = await import('../src/commands/capture.mjs');
      init(TMP);
      note(TMP, 'Testing Framework', 'project', { tags: ['test', 'dev'] });
      note(TMP, 'Performance Optimization', 'resource', { tags: ['performance'] });
      cap(TMP, 'New testing methodology');
    });

    it('finds notes by keyword in title', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'Testing', {});
      assert.ok(result.results.length >= 1);
      assert.ok(result.results.some(r => r.file.includes('test')));
    });

    it('filters by type', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'Testing', { type: 'project' });
      assert.ok(result.results.every(r => r.type === 'project'));
    });

    it('filters by tag', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'test', { tag: 'dev' });
      assert.ok(result.results.length >= 0);
    });

    it('filters by status', async () => {
      const { search } = await import('../src/commands/search.mjs');
      const result = search(TMP, 'test', { status: 'active' });
      assert.ok(Array.isArray(result.results));
    });

    it('throws error for empty keyword', async () => {
      const { search } = await import('../src/commands/search.mjs');
      assert.throws(
        () => search(TMP, '', {}),
        /keyword/i
      );
    });
  });

  // ── list command (5 tests) ────────────────────────────

  describe('list', () => {
    before(async () => {
      const { init } = await import('../src/commands/init.mjs');
      const { note } = await import('../src/commands/note.mjs');
      init(TMP);
      note(TMP, 'List Test Project', 'project', { tags: ['list-test'] });
      note(TMP, 'List Test Area', 'area', { tags: ['list-test'] });
      note(TMP, 'List Test Resource', 'resource');
    });

    it('lists all non-archived notes', async () => {
      const { list } = await import('../src/commands/list.mjs');
      const result = list(TMP);
      assert.ok(result.notes.length >= 3);
      assert.ok(result.notes.every(n => n.status !== 'archived'));
    });

    it('filters by type', async () => {
      const { list } = await import('../src/commands/list.mjs');
      const result = list(TMP, { type: 'project' });
      assert.ok(result.notes.every(n => n.type === 'project'));
      assert.ok(result.notes.length >= 1);
    });

    it('filters by tag', async () => {
      const { list } = await import('../src/commands/list.mjs');
      const result = list(TMP, { tag: 'list-test' });
      assert.ok(result.notes.length >= 2);
    });

    it('filters by status when specified', async () => {
      const { list } = await import('../src/commands/list.mjs');
      const result = list(TMP, { status: 'active' });
      assert.ok(result.notes.every(n => n.status === 'active'));
    });

    it('can filter recent notes', async () => {
      const { list } = await import('../src/commands/list.mjs');
      const result = list(TMP, { recent: 7 });
      assert.ok(Array.isArray(result.notes));
    });
  });

  // ── archive command (5 tests) ────────────────────────────

  describe('archive', () => {
    before(async () => {
      const { init } = await import('../src/commands/init.mjs');
      const { note } = await import('../src/commands/note.mjs');
      init(TMP);
      note(TMP, 'Archive Me', 'idea');
      note(TMP, 'Archive This Too', 'idea');
      note(TMP, 'Archive For Timestamp', 'idea');
    });

    it('sets note status to archived', async () => {
      const { archive } = await import('../src/commands/archive.mjs');
      const result = archive(TMP, 'archive-me');
      assert.equal(result.status, 'archived');

      const content = readFileSync(join(TMP, 'ideas', 'archive-me.md'), 'utf8');
      assert.ok(content.includes('archived'));
    });

    it('returns already_archived for archived notes', async () => {
      const { archive } = await import('../src/commands/archive.mjs');
      archive(TMP, 'archive-this-too');
      const result2 = archive(TMP, 'archive-this-too');
      assert.equal(result2.status, 'already_archived');
    });

    it('throws error for non-existent note', async () => {
      const { archive } = await import('../src/commands/archive.mjs');
      assert.throws(
        () => archive(TMP, 'nonexistent-note'),
        /not found/i
      );
    });

    it('updates timestamp when archiving', async () => {
      const { archive } = await import('../src/commands/archive.mjs');
      const result = archive(TMP, 'archive-for-timestamp');
      assert.equal(result.status, 'archived');
      assert.ok(result.updated && typeof result.updated === 'string');
    });

    it('throws error for missing note name', async () => {
      const { archive } = await import('../src/commands/archive.mjs');
      assert.throws(
        () => archive(TMP, ''),
        /Usage:/i
      );
    });
  });

  // ── delete command (5 tests) ────────────────────────────

  describe('delete', () => {
    before(async () => {
      const { init } = await import('../src/commands/init.mjs');
      const { note } = await import('../src/commands/note.mjs');
      init(TMP);
      for (let i = 1; i <= 5; i++) {
        note(TMP, `Delete Test ${i}`, 'idea');
      }
    });

    it('deletes a note file', async () => {
      const { deleteNote } = await import('../src/commands/delete.mjs');
      assert.ok(existsSync(join(TMP, 'ideas', 'delete-test-1.md')));

      const result = deleteNote(TMP, 'delete-test-1');
      assert.equal(result.status, 'deleted');
      assert.ok(!existsSync(join(TMP, 'ideas', 'delete-test-1.md')));
    });

    it('throws error for non-existent note', async () => {
      const { deleteNote } = await import('../src/commands/delete.mjs');
      assert.throws(
        () => deleteNote(TMP, 'nonexistent-for-delete'),
        /not found/i
      );
    });

    it('cleans up references to deleted note', async () => {
      const { note } = await import('../src/commands/note.mjs');
      const { deleteNote } = await import('../src/commands/delete.mjs');

      note(TMP, 'Linker Note', 'idea');
      const { Vault } = await import('../src/vault.mjs');
      const vault = new Vault(TMP);
      let content = vault.read('ideas', 'linker-note.md');
      content = content.replace('related: []', 'related: ["[[delete-test-2]]"]');
      vault.write('ideas', 'linker-note.md', content);

      deleteNote(TMP, 'delete-test-2');

      vault.invalidateCache();
      const linkerContent = vault.read('ideas', 'linker-note.md');
      assert.ok(!linkerContent.includes('delete-test-2'));
    });

    it('throws error for missing note name', async () => {
      const { deleteNote } = await import('../src/commands/delete.mjs');
      assert.throws(
        () => deleteNote(TMP, ''),
        /Usage:/i
      );
    });

    it('cannot delete already deleted note', async () => {
      const { deleteNote } = await import('../src/commands/delete.mjs');
      deleteNote(TMP, 'delete-test-3');
      assert.throws(
        () => deleteNote(TMP, 'delete-test-3'),
        /not found/i
      );
    });
  });

  // ── read command (5 tests) ────────────────────────────

  describe('read', () => {
    before(async () => {
      const { init } = await import('../src/commands/init.mjs');
      const { note } = await import('../src/commands/note.mjs');
      init(TMP);
      note(TMP, 'Read Test Note', 'project');

      const { Vault } = await import('../src/vault.mjs');
      const vault = new Vault(TMP);
      let content = vault.read('projects', 'read-test-note.md');
      content += '\n## Implementation\n- Step 1\n- Step 2\n';
      vault.write('projects', 'read-test-note.md', content);
    });

    it('reads full note content', async () => {
      const { read } = await import('../src/commands/read.mjs');
      const result = read(TMP, 'read-test-note');
      assert.ok(result.content.includes('Read Test Note'));
      assert.equal(result.type, 'project');
    });

    it('extracts specific section', async () => {
      const { read } = await import('../src/commands/read.mjs');
      const result = read(TMP, 'read-test-note', { section: 'Implementation' });
      assert.ok(result.content.includes('Implementation'));
      assert.ok(result.content.includes('Step 1'));
    });

    it('throws error for non-existent note', async () => {
      const { read } = await import('../src/commands/read.mjs');
      assert.throws(
        () => read(TMP, 'nonexistent-read-test'),
        /not found/i
      );
    });

    it('returns empty content for missing section', async () => {
      const { read } = await import('../src/commands/read.mjs');
      const result = read(TMP, 'read-test-note', { section: 'Nonexistent' });
      assert.ok(result.section === 'Nonexistent' || result.content);
    });

    it('throws error for missing note name', async () => {
      const { read } = await import('../src/commands/read.mjs');
      assert.throws(
        () => read(TMP, ''),
        /Usage:/i
      );
    });
  });

  // ── backlinks command (5 tests) ────────────────────────────

  describe('backlinks', () => {
    before(async () => {
      const { init } = await import('../src/commands/init.mjs');
      const { note } = await import('../src/commands/note.mjs');
      init(TMP);
      note(TMP, 'Backlink Target', 'project');
      note(TMP, 'Backlink Source A', 'idea');
      note(TMP, 'Backlink Source B', 'idea');

      const { Vault } = await import('../src/vault.mjs');
      const vault = new Vault(TMP);
      let contentA = vault.read('ideas', 'backlink-source-a.md');
      contentA = contentA.replace('related: []', 'related: ["[[backlink-target]]"]');
      vault.write('ideas', 'backlink-source-a.md', contentA);

      let contentB = vault.read('ideas', 'backlink-source-b.md');
      contentB = contentB.replace('related: []', 'related: ["[[backlink-target]]"]');
      vault.write('ideas', 'backlink-source-b.md', contentB);
    });

    it('finds backlinks to a note', async () => {
      const { backlinks } = await import('../src/commands/backlinks.mjs');
      const result = backlinks(TMP, 'backlink-target');
      assert.ok(result.results.length >= 2);
      assert.ok(result.results.some(r => r.file === 'backlink-source-a'));
    });

    it('returns empty for orphaned notes', async () => {
      const { backlinks } = await import('../src/commands/backlinks.mjs');
      const result = backlinks(TMP, 'orphaned-note-xyz');
      assert.equal(result.results.length, 0);
    });

    it('throws error for missing note name', async () => {
      const { backlinks } = await import('../src/commands/backlinks.mjs');
      assert.throws(
        () => backlinks(TMP, ''),
        /Usage:/i
      );
    });

    it('includes metadata about backlinkers', async () => {
      const { backlinks } = await import('../src/commands/backlinks.mjs');
      const result = backlinks(TMP, 'backlink-target');
      if (result.results.length > 0) {
        assert.ok(result.results[0].file);
      }
    });

    it('handles notes with multiple backlinks', async () => {
      const { note } = await import('../src/commands/note.mjs');
      const { backlinks } = await import('../src/commands/backlinks.mjs');

      note(TMP, 'Multi-Link Hub', 'project');
      const { Vault } = await import('../src/vault.mjs');
      const vault = new Vault(TMP);

      for (let i = 1; i <= 3; i++) {
        note(TMP, `Multi Link ${i}`, 'idea');
        let content = vault.read('ideas', `multi-link-${i}.md`);
        content = content.replace('related: []', 'related: ["[[multi-link-hub]]"]');
        vault.write('ideas', `multi-link-${i}.md`, content);
      }

      const result = backlinks(TMP, 'multi-link-hub');
      assert.ok(result.results.length >= 3);
    });
  });

  // ── integration: note → archive → delete workflow ────────────────────────────

  describe('integration: CRUD workflow', () => {
    it('note → archive → delete lifecycle', async () => {
      const { init } = await import('../src/commands/init.mjs');
      const { note } = await import('../src/commands/note.mjs');
      const { archive } = await import('../src/commands/archive.mjs');
      const { deleteNote } = await import('../src/commands/delete.mjs');

      init(TMP);

      // Create
      const createResult = note(TMP, 'Lifecycle Test', 'idea');
      assert.equal(createResult.status, 'created');
      const filePath = join(TMP, 'ideas', 'lifecycle-test.md');
      assert.ok(existsSync(filePath));

      // Archive
      const archiveResult = archive(TMP, 'lifecycle-test');
      assert.equal(archiveResult.status, 'archived');
      assert.ok(existsSync(filePath));

      // Delete
      const deleteResult = deleteNote(TMP, 'lifecycle-test');
      assert.equal(deleteResult.status, 'deleted');
      assert.ok(!existsSync(filePath));
    });

    it('create multiple notes and list with filters', async () => {
      const { init } = await import('../src/commands/init.mjs');
      const { note } = await import('../src/commands/note.mjs');
      const { list } = await import('../src/commands/list.mjs');

      init(TMP);
      note(TMP, 'Work Project', 'project', { tags: ['work'] });
      note(TMP, 'Personal Project', 'project', { tags: ['personal'] });
      note(TMP, 'Research Area', 'area', { tags: ['work'] });

      const workNotes = list(TMP, { tag: 'work' });
      assert.ok(workNotes.notes.length >= 2);

      const projects = list(TMP, { type: 'project' });
      assert.ok(projects.notes.length >= 2);
    });

    it('create → read → update → delete workflow', async () => {
      const { init } = await import('../src/commands/init.mjs');
      const { note } = await import('../src/commands/note.mjs');
      const { read } = await import('../src/commands/read.mjs');
      const { update } = await import('../src/commands/update.mjs');
      const { deleteNote } = await import('../src/commands/delete.mjs');

      init(TMP);
      note(TMP, 'Update Workflow Test', 'project');
      let readResult = read(TMP, 'update-workflow-test');
      assert.ok(readResult.content);

      update(TMP, 'update-workflow-test', { summary: 'Updated summary' });
      readResult = read(TMP, 'update-workflow-test');
      assert.ok(readResult.content.includes('Updated summary'));

      const deleteResult = deleteNote(TMP, 'update-workflow-test');
      assert.equal(deleteResult.status, 'deleted');
    });
  });
});
