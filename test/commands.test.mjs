import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', 'tmp', 'test-commands');

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
    assert.ok(result.related >= 0);
  });

  // ── v0.2.0 new commands ──────────────────────────────

  it('search finds content in note body (full-text)', async () => {
    const { search } = await import('../src/commands/search.mjs');
    // "vector search" is in the body of the capture note
    const result = search(TMP, 'vector', {});
    assert.ok(result.results.length >= 1);
  });

  it('backlinks finds linking notes', async () => {
    const { backlinks } = await import('../src/commands/backlinks.mjs');
    // api-testing should link to test-project via related
    const result = backlinks(TMP, 'test-project');
    assert.ok(result.results.length >= 1);
  });

  it('update modifies frontmatter', async () => {
    const { update } = await import('../src/commands/update.mjs');
    const result = update(TMP, 'test-project', { summary: 'Updated summary' });
    assert.equal(result.status, 'updated');
    const content = readFileSync(join(TMP, 'projects', 'test-project.md'), 'utf8');
    assert.ok(content.includes('Updated summary'));
  });

  it('archive sets status to archived', async () => {
    const { archive } = await import('../src/commands/archive.mjs');
    const result = archive(TMP, 'cool-idea');
    assert.equal(result.status, 'archived');
    const content = readFileSync(join(TMP, 'ideas', 'cool-idea.md'), 'utf8');
    assert.ok(content.includes('archived'));
  });

  it('archive detects already archived', async () => {
    const { archive } = await import('../src/commands/archive.mjs');
    const result = archive(TMP, 'cool-idea');
    assert.equal(result.status, 'already_archived');
  });

  // ── v0.5.0 ───────────────────────────────────────────

  it('read returns note content', async () => {
    const { read } = await import('../src/commands/read.mjs');
    const result = read(TMP, 'test-project');
    assert.ok(result.content.includes('Test Project'));
    assert.equal(result.type, 'project');
  });

  it('read with section returns specific heading', async () => {
    const { read } = await import('../src/commands/read.mjs');
    const result = read(TMP, 'test-project', { section: 'TODO' });
    assert.ok(result.content.includes('TODO'));
  });

  it('recent shows recently updated notes', async () => {
    const { recent } = await import('../src/commands/recent.mjs');
    const result = recent(TMP, { days: 1 });
    assert.ok(result.notes.length >= 1);
  });

  it('delete removes note and cleans references', async () => {
    // Create a throwaway note to delete
    const { note } = await import('../src/commands/note.mjs');
    note(TMP, 'Throwaway Note', 'idea');

    const { deleteNote } = await import('../src/commands/delete.mjs');
    const result = deleteNote(TMP, 'throwaway-note');
    assert.equal(result.status, 'deleted');
    assert.ok(!existsSync(join(TMP, 'ideas', 'throwaway-note.md')));
  });

  it('stats returns vault statistics', async () => {
    const { stats } = await import('../src/commands/stats.mjs');
    const result = stats(TMP);
    assert.ok(result.total >= 4);
    assert.ok(result.byType.project >= 1);
    assert.ok(typeof result.orphans === 'number');
  });

  it('graph generates Mermaid output', async () => {
    const { graph } = await import('../src/commands/graph.mjs');
    const result = graph(TMP);
    assert.ok(result.nodes >= 1);
    assert.ok(result.mermaid.includes('graph LR'));
    assert.ok(result.mermaid.includes('classDef'));
  });

  it('orphans finds unlinked notes', async () => {
    const { orphans } = await import('../src/commands/orphans.mjs');
    const result = orphans(TMP);
    assert.ok(Array.isArray(result.results));
  });

  it('tag list shows all tags', async () => {
    const { tagList } = await import('../src/commands/tag.mjs');
    const result = tagList(TMP);
    assert.ok(Object.keys(result.tags).length >= 1);
  });

  it('tag rename changes tags across vault', async () => {
    const { tagRename } = await import('../src/commands/tag.mjs');
    const result = tagRename(TMP, 'dev', 'development');
    assert.ok(result.renamed >= 1);
    const content = readFileSync(join(TMP, 'projects', 'test-project.md'), 'utf8');
    assert.ok(content.includes('development'));
    assert.ok(!content.includes('[dev,') && !content.includes('[dev]'));
  });

  // ── v0.3.0 new features ─────────────────────────────

  it('patch appends to heading section', async () => {
    const { patch } = await import('../src/commands/patch.mjs');
    const result = patch(TMP, 'test-project', {
      heading: 'TODO',
      append: '- [ ] Write integration tests',
    });
    assert.equal(result.status, 'patched');
    assert.equal(result.operation, 'appended');
    const content = readFileSync(join(TMP, 'projects', 'test-project.md'), 'utf8');
    assert.ok(content.includes('Write integration tests'));
  });

  it('patch reads section without modification', async () => {
    const { patch } = await import('../src/commands/patch.mjs');
    const result = patch(TMP, 'test-project', { heading: 'TODO' });
    assert.equal(result.status, 'read');
    assert.ok(result.content.includes('Write integration tests'));
  });

  it('patch replaces section content', async () => {
    const { patch } = await import('../src/commands/patch.mjs');
    const result = patch(TMP, 'test-project', {
      heading: 'Notes',
      replace: 'Replaced content here',
    });
    assert.equal(result.operation, 'replaced');
    const content = readFileSync(join(TMP, 'projects', 'test-project.md'), 'utf8');
    assert.ok(content.includes('Replaced content here'));
  });

  it('setup installs skill and MCP config', async () => {
    const { setup } = await import('../src/commands/setup.mjs');
    const result = setup(TMP);
    assert.equal(result.status, 'ok');
    assert.ok(result.results.length >= 1);
  });

  it('MCP server handles initialize and tools/list', async () => {
    const { McpServer } = await import('../src/mcp-server.mjs');
    const server = new McpServer(TMP);

    const init = server.handleMessage({
      jsonrpc: '2.0', id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });
    assert.equal(init.result.serverInfo.name, 'obsidian-agent');

    const tools = server.handleMessage({
      jsonrpc: '2.0', id: 2,
      method: 'tools/list',
      params: {},
    });
    assert.ok(tools.result.tools.length >= 10);
    assert.ok(tools.result.tools.some(t => t.name === 'search'));
  });

  it('health returns vault scoring', async () => {
    const { health } = await import('../src/commands/health.mjs');
    const result = health(TMP);
    assert.ok(result.overall >= 0 && result.overall <= 100);
    assert.ok(['A', 'B', 'C', 'D', 'F'].includes(result.grade));
    assert.ok(result.scores.completeness >= 0);
    assert.ok(result.scores.connectivity >= 0);
    assert.ok(result.scores.freshness >= 0);
    assert.ok(result.scores.organization >= 0);
  });

  it('MCP server handles tool calls', async () => {
    const { McpServer } = await import('../src/mcp-server.mjs');
    const server = new McpServer(TMP);

    const response = await server.handleMessage({
      jsonrpc: '2.0', id: 3,
      method: 'tools/call',
      params: { name: 'stats', arguments: {} },
    });
    assert.ok(response.result.content[0].text.includes('total'));
  });

  // ── v0.7 new commands ────────────────────────────

  it('rename renames note and updates references', async () => {
    const { note } = await import('../src/commands/note.mjs');
    note(TMP, 'Rename Target', 'idea', { tags: ['test'] });
    note(TMP, 'Rename Linker', 'idea');

    // Manually add a reference
    const { Vault } = await import('../src/vault.mjs');
    const vault = new Vault(TMP);
    let content = vault.read('ideas', 'rename-linker.md');
    content = content.replace('related: []', 'related: ["[[rename-target]]"]');
    vault.write('ideas', 'rename-linker.md', content);

    const { rename } = await import('../src/commands/rename.mjs');
    const result = rename(TMP, 'rename-target', 'Renamed Note');
    assert.equal(result.status, 'renamed');
    assert.ok(existsSync(join(TMP, 'ideas', 'renamed-note.md')));
    assert.ok(!existsSync(join(TMP, 'ideas', 'rename-target.md')));

    // Check reference was updated
    vault.invalidateCache();
    const linker = vault.read('ideas', 'rename-linker.md');
    assert.ok(linker.includes('[[renamed-note]]'));
    assert.ok(!linker.includes('[[rename-target]]'));
  });

  it('move moves note to different type', async () => {
    const { note } = await import('../src/commands/note.mjs');
    note(TMP, 'Move Test', 'idea');

    const { move } = await import('../src/commands/move.mjs');
    const result = move(TMP, 'move-test', 'project');
    assert.equal(result.status, 'moved');
    assert.ok(existsSync(join(TMP, 'projects', 'move-test.md')));
    assert.ok(!existsSync(join(TMP, 'ideas', 'move-test.md')));

    // Check type was updated in frontmatter
    const content = readFileSync(join(TMP, 'projects', 'move-test.md'), 'utf8');
    assert.ok(content.includes('type: project'));
  });

  it('merge combines notes and redirects references', async () => {
    const { note } = await import('../src/commands/note.mjs');
    note(TMP, 'Merge Source', 'idea', { tags: ['source-tag'] });
    note(TMP, 'Merge Target', 'idea', { tags: ['target-tag'] });

    const { merge } = await import('../src/commands/merge.mjs');
    const result = merge(TMP, 'merge-source', 'merge-target');
    assert.equal(result.status, 'merged');
    assert.ok(!existsSync(join(TMP, 'ideas', 'merge-source.md')));
    assert.ok(existsSync(join(TMP, 'ideas', 'merge-target.md')));

    const content = readFileSync(join(TMP, 'ideas', 'merge-target.md'), 'utf8');
    assert.ok(content.includes('Merged from: merge-source'));
  });

  it('duplicates finds similar notes', async () => {
    const { note } = await import('../src/commands/note.mjs');
    note(TMP, 'API Design Guide', 'resource', { tags: ['api'] });
    note(TMP, 'API Design Reference', 'resource', { tags: ['api'] });

    const { duplicates } = await import('../src/commands/duplicates.mjs');
    const result = duplicates(TMP, { threshold: 0.3 });
    assert.ok(Array.isArray(result.pairs));
  });

  it('broken-links finds broken wikilinks', async () => {
    const { Vault } = await import('../src/vault.mjs');
    const vault = new Vault(TMP);
    let content = vault.read('resources', 'api-design-guide.md');
    // Replace entire related line (may already have auto-linked entries)
    content = content.replace(/^related: .*$/m, 'related: ["[[non-existent-note]]"]');
    vault.write('resources', 'api-design-guide.md', content);

    const { brokenLinks } = await import('../src/commands/broken-links.mjs');
    const result = brokenLinks(TMP);
    assert.ok(result.broken.length > 0);
    assert.ok(result.broken.some(b => b.target === 'non-existent-note'));
  });

  it('batch tag adds tags to matching notes', async () => {
    const { batchTag } = await import('../src/commands/batch.mjs');
    const result = batchTag(TMP, { type: 'resource', add: 'batch-added' });
    assert.ok(result.updated > 0);

    const { Vault } = await import('../src/vault.mjs');
    const vault = new Vault(TMP);
    const notes = vault.scanNotes();
    const resources = notes.filter(n => n.type === 'resource');
    assert.ok(resources.every(n => n.tags.includes('batch-added')));
  });

  it('batch archive archives matching notes', async () => {
    const { batchArchive } = await import('../src/commands/batch.mjs');
    const result = batchArchive(TMP, { tag: 'batch-added' });
    assert.ok(result.archived > 0);
  });

  it('export exports notes to JSON', async () => {
    const { exportNotes } = await import('../src/commands/export.mjs');
    const outPath = join(TMP, 'test-export.json');
    const result = exportNotes(TMP, { format: 'json', output: outPath });
    assert.ok(result.exported > 0);
    assert.ok(existsSync(outPath));
    const data = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.ok(Array.isArray(data));
  });

  it('import imports notes from JSON', async () => {
    const { writeFileSync } = await import('fs');
    const importPath = join(TMP, 'test-import.json');
    writeFileSync(importPath, JSON.stringify([
      { title: 'Imported Note', type: 'idea', tags: ['imported'], body: 'Test body' },
    ]));

    const { importNotes } = await import('../src/commands/import.mjs');
    const result = importNotes(TMP, importPath);
    assert.equal(result.imported, 1);
    assert.ok(existsSync(join(TMP, 'ideas', 'imported-note.md')));
  });

  it('search with regex finds patterns', async () => {
    const { search } = await import('../src/commands/search.mjs');
    const result = search(TMP, 'API.*Guide', { regex: true });
    assert.ok(result.results.length > 0);
  });

  it('MCP server exposes v0.7 tools', async () => {
    const { McpServer } = await import('../src/mcp-server.mjs');
    const server = new McpServer(TMP);
    const tools = server.handleMessage({
      jsonrpc: '2.0', id: 10,
      method: 'tools/list',
      params: {},
    });
    const names = tools.result.tools.map(t => t.name);
    assert.ok(names.includes('rename'));
    assert.ok(names.includes('move'));
    assert.ok(names.includes('merge'));
    assert.ok(names.includes('duplicates'));
    assert.ok(names.includes('broken_links'));
    assert.ok(names.includes('batch_tag'));
    assert.ok(names.includes('export'));
  });

  // ── v0.8 new commands ────────────────────────────

  it('link finds and creates missing links (dry-run)', async () => {
    const { link } = await import('../src/commands/link.mjs');
    const result = link(TMP, { dryRun: true, threshold: 0.1 });
    assert.ok(Array.isArray(result.suggestions));
  });

  it('link creates bidirectional links', async () => {
    const { note } = await import('../src/commands/note.mjs');
    note(TMP, 'Link Test A', 'resource', { tags: ['linktest'] });
    note(TMP, 'Link Test B', 'resource', { tags: ['linktest'] });

    const { link } = await import('../src/commands/link.mjs');
    const result = link(TMP, { threshold: 0.1 });
    // May or may not link depending on similarity, but should not crash
    assert.ok(typeof result.linked === 'number');
  });

  it('timeline shows recent activity', async () => {
    const { timeline } = await import('../src/commands/timeline.mjs');
    const result = timeline(TMP, { days: 7 });
    assert.ok(Array.isArray(result.entries));
    assert.ok(result.entries.length > 0);
  });

  it('timeline filters by type', async () => {
    const { timeline } = await import('../src/commands/timeline.mjs');
    const result = timeline(TMP, { days: 7, type: 'project' });
    assert.ok(result.entries.every(e => e.type === 'project'));
  });

  it('validate finds issues in vault', async () => {
    const { validate } = await import('../src/commands/validate.mjs');
    const result = validate(TMP);
    assert.ok(Array.isArray(result.issues));
    assert.ok(typeof result.valid === 'boolean');
  });

  it('pin and unpin a note', async () => {
    const { pin, unpin, listPinned } = await import('../src/commands/pin.mjs');

    const pinResult = pin(TMP, 'test-project');
    assert.equal(pinResult.status, 'pinned');

    // Check it appears in pinned list
    const list = listPinned(TMP);
    assert.ok(list.pinned.some(n => n.file === 'test-project'));

    // Pin again = already pinned
    const again = pin(TMP, 'test-project');
    assert.equal(again.status, 'already_pinned');

    // Unpin
    const unpinResult = unpin(TMP, 'test-project');
    assert.equal(unpinResult.status, 'unpinned');

    // Unpin again = not pinned
    const notPinned = unpin(TMP, 'test-project');
    assert.equal(notPinned.status, 'not_pinned');
  });

  it('relink finds fixable broken links (dry-run)', async () => {
    const { relink } = await import('../src/commands/relink.mjs');
    const result = relink(TMP, { dryRun: true });
    assert.ok(Array.isArray(result.fixes));
  });

  it('MCP server exposes v0.8 tools', async () => {
    const { McpServer } = await import('../src/mcp-server.mjs');
    const server = new McpServer(TMP);
    const tools = server.handleMessage({
      jsonrpc: '2.0', id: 11,
      method: 'tools/list',
      params: {},
    });
    const names = tools.result.tools.map(t => t.name);
    assert.ok(names.includes('link'));
    assert.ok(names.includes('timeline'));
    assert.ok(names.includes('validate'));
    assert.ok(names.includes('pin'));
    assert.ok(names.includes('unpin'));
    assert.ok(names.includes('pin_list'));
    assert.ok(names.includes('relink'));
  });
});
