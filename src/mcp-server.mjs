/**
 * MCP Server — expose vault operations as MCP tools via stdio
 *
 * Implements Model Context Protocol (JSON-RPC 2.0 over stdio)
 * Zero dependencies — raw readline + JSON parsing
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Vault } from './vault.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8')).version;

// ── Tool definitions ─────────────────────────────────

const TOOLS = [
  { name: 'journal', description: 'Create or open today\'s journal entry', inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' } } } },
  { name: 'note', description: 'Create a new note with automatic linking', inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'Note title' }, type: { type: 'string', enum: ['area', 'project', 'resource', 'idea'], description: 'Note type' }, tags: { type: 'array', items: { type: 'string' }, description: 'Tags' }, summary: { type: 'string', description: 'One-line summary' } }, required: ['title', 'type'] } },
  { name: 'capture', description: 'Quick idea capture', inputSchema: { type: 'object', properties: { idea: { type: 'string', description: 'Idea text' } }, required: ['idea'] } },
  { name: 'search', description: 'Full-text search across all notes (supports regex)', inputSchema: { type: 'object', properties: { keyword: { type: 'string', description: 'Search keyword or regex pattern' }, type: { type: 'string', description: 'Filter by note type' }, tag: { type: 'string', description: 'Filter by tag' }, status: { type: 'string', description: 'Filter by status' }, regex: { type: 'boolean', description: 'Treat keyword as regex pattern' } }, required: ['keyword'] } },
  { name: 'list', description: 'List notes with optional filters', inputSchema: { type: 'object', properties: { type: { type: 'string', description: 'Filter by type' }, tag: { type: 'string', description: 'Filter by tag' }, status: { type: 'string', description: 'Filter by status' }, recent: { type: 'number', description: 'Show notes updated in last N days' } } } },
  { name: 'read', description: 'Read a note\'s full content', inputSchema: { type: 'object', properties: { note: { type: 'string', description: 'Note filename (without .md)' }, section: { type: 'string', description: 'Optional: read only this heading section' } }, required: ['note'] } },
  { name: 'backlinks', description: 'Show notes that link to a given note', inputSchema: { type: 'object', properties: { note: { type: 'string', description: 'Note filename (without .md)' } }, required: ['note'] } },
  { name: 'update', description: 'Update note frontmatter fields', inputSchema: { type: 'object', properties: { note: { type: 'string', description: 'Note filename' }, status: { type: 'string', description: 'New status' }, tags: { type: 'string', description: 'Comma-separated tags' }, summary: { type: 'string', description: 'New summary' } }, required: ['note'] } },
  { name: 'archive', description: 'Set note status to archived', inputSchema: { type: 'object', properties: { note: { type: 'string', description: 'Note filename' } }, required: ['note'] } },
  { name: 'delete', description: 'Delete a note and clean up references', inputSchema: { type: 'object', properties: { note: { type: 'string', description: 'Note filename' } }, required: ['note'] } },
  { name: 'recent', description: 'Show recently updated notes', inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'Number of days (default: 7)' } } } },
  { name: 'patch', description: 'Edit a section of a note by heading', inputSchema: { type: 'object', properties: { note: { type: 'string', description: 'Note filename' }, heading: { type: 'string', description: 'Target heading text' }, append: { type: 'string', description: 'Text to append' }, prepend: { type: 'string', description: 'Text to prepend' }, replace: { type: 'string', description: 'Text to replace section with' } }, required: ['note', 'heading'] } },
  { name: 'stats', description: 'Show vault statistics', inputSchema: { type: 'object', properties: {} } },
  { name: 'orphans', description: 'Find notes with no inbound links', inputSchema: { type: 'object', properties: {} } },
  { name: 'graph', description: 'Generate Mermaid knowledge graph', inputSchema: { type: 'object', properties: { type: { type: 'string', description: 'Filter by note type' } } } },
  { name: 'health', description: 'Vault health scoring', inputSchema: { type: 'object', properties: {} } },
  { name: 'sync', description: 'Rebuild tag and graph indices', inputSchema: { type: 'object', properties: {} } },
  { name: 'tag_list', description: 'List all tags with counts', inputSchema: { type: 'object', properties: {} } },
  { name: 'tag_rename', description: 'Rename a tag across the vault', inputSchema: { type: 'object', properties: { old_tag: { type: 'string' }, new_tag: { type: 'string' } }, required: ['old_tag', 'new_tag'] } },
  // v0.7 new tools
  { name: 'rename', description: 'Rename a note and update all references', inputSchema: { type: 'object', properties: { note: { type: 'string', description: 'Note filename' }, new_title: { type: 'string', description: 'New title' } }, required: ['note', 'new_title'] } },
  { name: 'move', description: 'Move a note to a different type/directory', inputSchema: { type: 'object', properties: { note: { type: 'string', description: 'Note filename' }, new_type: { type: 'string', enum: ['area', 'project', 'resource', 'idea'], description: 'New type' } }, required: ['note', 'new_type'] } },
  { name: 'merge', description: 'Merge source note into target note', inputSchema: { type: 'object', properties: { source: { type: 'string', description: 'Source note filename' }, target: { type: 'string', description: 'Target note filename' } }, required: ['source', 'target'] } },
  { name: 'duplicates', description: 'Find potentially duplicate notes', inputSchema: { type: 'object', properties: { threshold: { type: 'number', description: 'Similarity threshold 0-1 (default: 0.5)' } } } },
  { name: 'broken_links', description: 'Find broken [[wikilinks]]', inputSchema: { type: 'object', properties: {} } },
  { name: 'batch_update', description: 'Batch update matching notes', inputSchema: { type: 'object', properties: { type: { type: 'string' }, tag: { type: 'string' }, status: { type: 'string' }, set_status: { type: 'string' }, set_summary: { type: 'string' } } } },
  { name: 'batch_tag', description: 'Batch add/remove tags', inputSchema: { type: 'object', properties: { type: { type: 'string' }, tag: { type: 'string' }, status: { type: 'string' }, add: { type: 'string' }, remove: { type: 'string' } } } },
  { name: 'batch_archive', description: 'Batch archive matching notes', inputSchema: { type: 'object', properties: { type: { type: 'string' }, tag: { type: 'string' }, status: { type: 'string' } } } },
  { name: 'export', description: 'Export notes to JSON or markdown', inputSchema: { type: 'object', properties: { type: { type: 'string' }, tag: { type: 'string' }, status: { type: 'string' }, format: { type: 'string', enum: ['json', 'markdown'] }, output: { type: 'string', description: 'Output file path' } } } },
];

// ── Dispatch table ───────────────────────────────────

const DISPATCH = {
  async journal(root, a) { const { journal } = await import('./commands/journal.mjs'); return journal(root, { date: a.date }); },
  async note(root, a) { const { note } = await import('./commands/note.mjs'); return note(root, a.title, a.type, { tags: a.tags || [], summary: a.summary || '' }); },
  async capture(root, a) { const { capture } = await import('./commands/capture.mjs'); return capture(root, a.idea); },
  async search(root, a) { const { search } = await import('./commands/search.mjs'); return search(root, a.keyword, { type: a.type, tag: a.tag, status: a.status, regex: a.regex }); },
  async list(root, a) { const { list } = await import('./commands/list.mjs'); return list(root, a); },
  async read(root, a) { const { read } = await import('./commands/read.mjs'); return read(root, a.note, { section: a.section }); },
  async backlinks(root, a) { const { backlinks } = await import('./commands/backlinks.mjs'); return backlinks(root, a.note); },
  async update(root, a) { const { update } = await import('./commands/update.mjs'); return update(root, a.note, { status: a.status, tags: a.tags, summary: a.summary }); },
  async archive(root, a) { const { archive } = await import('./commands/archive.mjs'); return archive(root, a.note); },
  async delete(root, a) { const { deleteNote } = await import('./commands/delete.mjs'); return deleteNote(root, a.note); },
  async recent(root, a) { const { recent } = await import('./commands/recent.mjs'); return recent(root, { days: a.days || 7 }); },
  async patch(root, a) { const { patch } = await import('./commands/patch.mjs'); return patch(root, a.note, { heading: a.heading, append: a.append, prepend: a.prepend, replace: a.replace }); },
  async stats(root) { const { stats } = await import('./commands/stats.mjs'); return stats(root); },
  async orphans(root) { const { orphans } = await import('./commands/orphans.mjs'); return orphans(root); },
  async graph(root, a) { const { graph } = await import('./commands/graph.mjs'); return graph(root, { type: a.type }); },
  async health(root) { const { health } = await import('./commands/health.mjs'); return health(root); },
  async sync(root) { const { sync } = await import('./commands/sync.mjs'); return sync(root); },
  async tag_list(root) { const { tagList } = await import('./commands/tag.mjs'); return tagList(root); },
  async tag_rename(root, a) { const { tagRename } = await import('./commands/tag.mjs'); return tagRename(root, a.old_tag, a.new_tag); },
  // v0.7 new
  async rename(root, a) { const { rename } = await import('./commands/rename.mjs'); return rename(root, a.note, a.new_title); },
  async move(root, a) { const { move } = await import('./commands/move.mjs'); return move(root, a.note, a.new_type); },
  async merge(root, a) { const { merge } = await import('./commands/merge.mjs'); return merge(root, a.source, a.target); },
  async duplicates(root, a) { const { duplicates } = await import('./commands/duplicates.mjs'); return duplicates(root, { threshold: a.threshold }); },
  async broken_links(root) { const { brokenLinks } = await import('./commands/broken-links.mjs'); return brokenLinks(root); },
  async batch_update(root, a) { const { batchUpdate } = await import('./commands/batch.mjs'); return batchUpdate(root, { type: a.type, tag: a.tag, status: a.status, setStatus: a.set_status, setSummary: a.set_summary }); },
  async batch_tag(root, a) { const { batchTag } = await import('./commands/batch.mjs'); return batchTag(root, { type: a.type, tag: a.tag, status: a.status, add: a.add, remove: a.remove }); },
  async batch_archive(root, a) { const { batchArchive } = await import('./commands/batch.mjs'); return batchArchive(root, { type: a.type, tag: a.tag, status: a.status }); },
  async export(root, a) { const { exportNotes } = await import('./commands/export.mjs'); return exportNotes(root, { type: a.type, tag: a.tag, status: a.status, format: a.format, output: a.output }); },
};

// ── Server class ─────────────────────────────────────

export class McpServer {
  constructor(vaultRoot) {
    this.vaultRoot = vaultRoot;
    this._vault = null;
  }

  get vault() {
    if (!this._vault) this._vault = new Vault(this.vaultRoot);
    return this._vault;
  }

  async handleToolCall(name, args) {
    this.vault.invalidateCache();

    const handler = DISPATCH[name];
    if (!handler) throw new Error(`Unknown tool: ${name}`);

    const origLog = console.log;
    const origError = console.error;
    console.log = () => {};
    console.error = () => {};
    try {
      return await handler(this.vaultRoot, args);
    } finally {
      console.log = origLog;
      console.error = origError;
    }
  }

  handleMessage(msg) {
    const { id, method, params } = msg;

    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'obsidian-agent', version: PKG_VERSION },
          },
        };

      case 'notifications/initialized':
        return null;

      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };

      case 'tools/call':
        return this.handleToolCall(params.name, params.arguments || {}).then(result => ({
          jsonrpc: '2.0', id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        })).catch(err => ({
          jsonrpc: '2.0', id,
          error: { code: -32000, message: err.message },
        }));

      default:
        return {
          jsonrpc: '2.0', id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  }

  start() {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          const response = this.handleMessage(msg);
          if (response && typeof response.then === 'function') {
            response.then(r => { if (r) process.stdout.write(JSON.stringify(r) + '\n'); });
          } else if (response) {
            process.stdout.write(JSON.stringify(response) + '\n');
          }
        } catch {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0', id: null,
            error: { code: -32700, message: 'Parse error' },
          }) + '\n');
        }
      }
    });

    process.stderr.write('obsidian-agent MCP server started\n');
  }
}
