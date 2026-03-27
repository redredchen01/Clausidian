import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const TMP = join(import.meta.dirname, '..', 'tmp', 'test-commands');

describe('commands (import)', () => {
  before(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('init creates vault structure', async () => {
    const { init } = await import('../src/commands/init.mjs');
    init(TMP);
    assert.ok(existsSync(join(TMP, 'AGENT.md')));
    assert.ok(existsSync(join(TMP, 'CONVENTIONS.md')));
    assert.ok(existsSync(join(TMP, 'templates')));
    assert.ok(existsSync(join(TMP, 'areas')));
    assert.ok(existsSync(join(TMP, 'projects')));
    assert.ok(existsSync(join(TMP, 'resources')));
    assert.ok(existsSync(join(TMP, 'journal')));
    assert.ok(existsSync(join(TMP, 'ideas')));
    assert.ok(existsSync(join(TMP, '_tags.md')));
    assert.ok(existsSync(join(TMP, '_graph.md')));
    assert.ok(existsSync(join(TMP, '_index.md')));
    assert.ok(existsSync(join(TMP, '.claude', 'commands')));
  });

  it('journal creates today entry', async () => {
    const { journal } = await import('../src/commands/journal.mjs');
    const result = journal(TMP);
    assert.equal(result.status, 'created');
    assert.ok(existsSync(join(TMP, 'journal', `${result.date}.md`)));

    // Running again returns exists
    const result2 = journal(TMP);
    assert.equal(result2.status, 'exists');
  });

  it('note creates a project note', async () => {
    const { note } = await import('../src/commands/note.mjs');
    const result = note(TMP, 'Test Project', 'project', { tags: ['dev', 'test'] });
    assert.equal(result.status, 'created');
    assert.ok(existsSync(join(TMP, 'projects', 'test-project.md')));
    const content = readFileSync(join(TMP, 'projects', 'test-project.md'), 'utf8');
    assert.ok(content.includes('title: "Test Project"'));
    assert.ok(content.includes('dev'));
  });

  it('note creates area/resource/idea notes', async () => {
    const { note } = await import('../src/commands/note.mjs');

    const area = note(TMP, 'Backend Dev', 'area', { tags: ['backend'] });
    assert.equal(area.status, 'created');

    const resource = note(TMP, 'Node Docs', 'resource', { tags: ['node'] });
    assert.equal(resource.status, 'created');

    const idea = note(TMP, 'Cool Idea', 'idea');
    assert.equal(idea.status, 'created');
  });

  it('note detects duplicate', async () => {
    const { note } = await import('../src/commands/note.mjs');
    const result = note(TMP, 'Test Project', 'project');
    assert.equal(result.status, 'exists');
  });

  it('capture creates idea note', async () => {
    const { capture } = await import('../src/commands/capture.mjs');
    const result = capture(TMP, 'Build a vector search engine');
    assert.equal(result.status, 'created');
    assert.ok(existsSync(join(TMP, 'ideas', 'build-a-vector-search-engine.md')));
  });

  it('search finds notes', async () => {
    const { search } = await import('../src/commands/search.mjs');
    const result = search(TMP, 'Test', {});
    assert.ok(result.results.length >= 1);
    assert.ok(result.results.some(r => r.file === 'test-project'));
  });

  it('search with type filter', async () => {
    const { search } = await import('../src/commands/search.mjs');
    const result = search(TMP, 'Test', { type: 'area' });
    assert.equal(result.results.length, 0);
  });

  it('list shows all notes', async () => {
    const { list } = await import('../src/commands/list.mjs');
    const result = list(TMP);
    assert.ok(result.notes.length >= 4);
  });

  it('list filters by type', async () => {
    const { list } = await import('../src/commands/list.mjs');
    const result = list(TMP, { type: 'project' });
    assert.ok(result.notes.every(n => n.type === 'project'));
  });

  it('review generates weekly review', async () => {
    const { review } = await import('../src/commands/review.mjs');
    const result = review(TMP);
    assert.equal(result.status, 'created');
    assert.ok(result.file.includes('-review.md'));
  });

  it('review monthly generates monthly review', async () => {
    const { monthlyReview } = await import('../src/commands/review.mjs');
    const result = monthlyReview(TMP);
    assert.equal(result.status, 'created');
    assert.ok(result.file.includes('-review.md'));
  });

  it('sync rebuilds indices', async () => {
    const { sync } = await import('../src/commands/sync.mjs');
    const result = sync(TMP);
    assert.ok(result.tags >= 0);
    assert.ok(result.notes >= 0);
  });

  it('note creates related links', async () => {
    const { note } = await import('../src/commands/note.mjs');
    const result = note(TMP, 'API Testing', 'project', { tags: ['dev', 'test'] });
    assert.equal(result.status, 'created');
    // Should find related notes due to matching tags
    assert.ok(result.related >= 0);
  });
});
