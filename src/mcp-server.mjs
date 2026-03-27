/**
 * MCP Server — expose vault operations as MCP tools via stdio
 *
 * Implements Model Context Protocol (JSON-RPC 2.0 over stdio)
 * Zero dependencies — raw readline + JSON parsing
 */
import { Vault } from './vault.mjs';
import { TemplateEngine } from './templates.mjs';
import { IndexManager } from './index-manager.mjs';
import { todayStr, weekdayShort, prevDate, nextDate, getWeekDates, getWeekLabel, getMonthRange } from './dates.mjs';

const TOOLS = [
  {
    name: 'journal',
    description: 'Create or open today\'s journal entry',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
      },
    },
  },
  {
    name: 'note',
    description: 'Create a new note with automatic linking',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title' },
        type: { type: 'string', enum: ['area', 'project', 'resource', 'idea'], description: 'Note type' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
        summary: { type: 'string', description: 'One-line summary' },
      },
      required: ['title', 'type'],
    },
  },
  {
    name: 'capture',
    description: 'Quick idea capture',
    inputSchema: {
      type: 'object',
      properties: {
        idea: { type: 'string', description: 'Idea text' },
      },
      required: ['idea'],
    },
  },
  {
    name: 'search',
    description: 'Full-text search across all notes',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Search keyword' },
        type: { type: 'string', description: 'Filter by note type' },
        tag: { type: 'string', description: 'Filter by tag' },
        status: { type: 'string', description: 'Filter by status' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'list',
    description: 'List notes with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Filter by type' },
        tag: { type: 'string', description: 'Filter by tag' },
        status: { type: 'string', description: 'Filter by status' },
        recent: { type: 'number', description: 'Show notes updated in last N days' },
      },
    },
  },
  {
    name: 'backlinks',
    description: 'Show notes that link to a given note',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Note filename (without .md)' },
      },
      required: ['note'],
    },
  },
  {
    name: 'update',
    description: 'Update note frontmatter fields',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Note filename' },
        status: { type: 'string', description: 'New status' },
        tags: { type: 'string', description: 'Comma-separated tags' },
        summary: { type: 'string', description: 'New summary' },
      },
      required: ['note'],
    },
  },
  {
    name: 'archive',
    description: 'Set note status to archived',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Note filename' },
      },
      required: ['note'],
    },
  },
  {
    name: 'patch',
    description: 'Edit a section of a note by heading',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Note filename' },
        heading: { type: 'string', description: 'Target heading text' },
        append: { type: 'string', description: 'Text to append' },
        prepend: { type: 'string', description: 'Text to prepend' },
        replace: { type: 'string', description: 'Text to replace section with' },
      },
      required: ['note', 'heading'],
    },
  },
  {
    name: 'stats',
    description: 'Show vault statistics',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'orphans',
    description: 'Find notes with no inbound links',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'graph',
    description: 'Generate Mermaid knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Filter by note type' },
      },
    },
  },
  {
    name: 'read',
    description: 'Read a note\'s full content',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Note filename (without .md)' },
        section: { type: 'string', description: 'Optional: read only this heading section' },
      },
      required: ['note'],
    },
  },
  {
    name: 'delete',
    description: 'Delete a note and clean up references in other notes',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Note filename' },
      },
      required: ['note'],
    },
  },
  {
    name: 'recent',
    description: 'Show recently updated notes',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days (default: 7)' },
      },
    },
  },
  {
    name: 'health',
    description: 'Vault health scoring (completeness, connectivity, freshness, organization)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'sync',
    description: 'Rebuild tag and graph indices',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tag_list',
    description: 'List all tags with counts',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tag_rename',
    description: 'Rename a tag across the vault',
    inputSchema: {
      type: 'object',
      properties: {
        old_tag: { type: 'string' },
        new_tag: { type: 'string' },
      },
      required: ['old_tag', 'new_tag'],
    },
  },
];

export class McpServer {
  constructor(vaultRoot) {
    this.vaultRoot = vaultRoot;
  }

  async handleToolCall(name, args) {
    // Suppress console.log during tool execution
    const origLog = console.log;
    const origError = console.error;
    console.log = () => {};
    console.error = () => {};

    try {
      switch (name) {
        case 'journal': {
          const { journal } = await import('./commands/journal.mjs');
          return journal(this.vaultRoot, { date: args.date });
        }
        case 'note': {
          const { note } = await import('./commands/note.mjs');
          return note(this.vaultRoot, args.title, args.type, {
            tags: args.tags || [],
            summary: args.summary || '',
          });
        }
        case 'capture': {
          const { capture } = await import('./commands/capture.mjs');
          return capture(this.vaultRoot, args.idea);
        }
        case 'search': {
          const { search } = await import('./commands/search.mjs');
          return search(this.vaultRoot, args.keyword, {
            type: args.type, tag: args.tag, status: args.status,
          });
        }
        case 'list': {
          const { list } = await import('./commands/list.mjs');
          return list(this.vaultRoot, args);
        }
        case 'backlinks': {
          const { backlinks } = await import('./commands/backlinks.mjs');
          return backlinks(this.vaultRoot, args.note);
        }
        case 'update': {
          const { update } = await import('./commands/update.mjs');
          return update(this.vaultRoot, args.note, {
            status: args.status, tags: args.tags, summary: args.summary,
          });
        }
        case 'archive': {
          const { archive } = await import('./commands/archive.mjs');
          return archive(this.vaultRoot, args.note);
        }
        case 'patch': {
          const { patch } = await import('./commands/patch.mjs');
          return patch(this.vaultRoot, args.note, {
            heading: args.heading,
            append: args.append,
            prepend: args.prepend,
            replace: args.replace,
          });
        }
        case 'stats': {
          const { stats } = await import('./commands/stats.mjs');
          return stats(this.vaultRoot);
        }
        case 'orphans': {
          const { orphans } = await import('./commands/orphans.mjs');
          return orphans(this.vaultRoot);
        }
        case 'graph': {
          const { graph } = await import('./commands/graph.mjs');
          return graph(this.vaultRoot, { type: args.type });
        }
        case 'read': {
          const { read } = await import('./commands/read.mjs');
          return read(this.vaultRoot, args.note, { section: args.section });
        }
        case 'delete': {
          const { deleteNote } = await import('./commands/delete.mjs');
          return deleteNote(this.vaultRoot, args.note);
        }
        case 'recent': {
          const { recent } = await import('./commands/recent.mjs');
          return recent(this.vaultRoot, { days: args.days || 7 });
        }
        case 'health': {
          const { health } = await import('./commands/health.mjs');
          return health(this.vaultRoot);
        }
        case 'sync': {
          const { sync } = await import('./commands/sync.mjs');
          return sync(this.vaultRoot);
        }
        case 'tag_list': {
          const { tagList } = await import('./commands/tag.mjs');
          return tagList(this.vaultRoot);
        }
        case 'tag_rename': {
          const { tagRename } = await import('./commands/tag.mjs');
          return tagRename(this.vaultRoot, args.old_tag, args.new_tag);
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
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
            serverInfo: { name: 'obsidian-agent', version: '0.5.0' },
          },
        };

      case 'notifications/initialized':
        return null; // No response needed

      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };

      case 'tools/call':
        return this.handleToolCall(params.name, params.arguments || {}).then(result => ({
          jsonrpc: '2.0', id,
          result: {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2),
            }],
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
      buffer = lines.pop(); // Keep incomplete line in buffer
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          const response = this.handleMessage(msg);
          if (response && typeof response.then === 'function') {
            response.then(r => {
              if (r) process.stdout.write(JSON.stringify(r) + '\n');
            });
          } else if (response) {
            process.stdout.write(JSON.stringify(response) + '\n');
          }
        } catch (e) {
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
