/**
 * Command registry — single source of truth for CLI + MCP
 *
 * Each entry: { name, description, args, mcpSchema, run(root, flags, positional) }
 * CLI and MCP server both consume this registry.
 */

// ── Registry ────────────────────────────────────────────

const COMMANDS = [
  // ── CRUD ──
  {
    name: 'init',
    description: 'Initialize a new agent-friendly vault',
    usage: 'init <path>',
    async run(root, flags, pos) {
      const { init } = await import('./commands/init.mjs');
      return init(pos[0] || '.');
    },
  },
  {
    name: 'journal',
    description: 'Create or open today\'s journal entry',
    usage: 'journal [--date DATE]',
    mcpSchema: { date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' } },
    async run(root, flags) {
      const { journal } = await import('./commands/journal.mjs');
      return journal(root, { date: flags.date });
    },
  },
  {
    name: 'note',
    description: 'Create a new note with automatic linking',
    usage: 'note <title> <type>',
    mcpSchema: {
      title: { type: 'string', description: 'Note title' },
      type: { type: 'string', enum: ['area', 'project', 'resource', 'idea'], description: 'Note type' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
      summary: { type: 'string', description: 'One-line summary' },
    },
    mcpRequired: ['title', 'type'],
    async run(root, flags, pos) {
      const { note } = await import('./commands/note.mjs');
      const title = flags.title || pos[0];
      const type = flags.type || pos[1];
      if (!title || !type) throw new Error('Usage: obsidian-agent note <title> <type>');
      const tags = flags.tags ? (Array.isArray(flags.tags) ? flags.tags : flags.tags.split(',')) : [];
      return note(root, title, type, { tags, goal: flags.goal, summary: flags.summary });
    },
  },
  {
    name: 'capture',
    description: 'Quick idea capture',
    usage: 'capture <idea>',
    mcpSchema: { idea: { type: 'string', description: 'Idea text' } },
    mcpRequired: ['idea'],
    async run(root, flags, pos) {
      const { capture } = await import('./commands/capture.mjs');
      const idea = flags.idea || pos.join(' ');
      if (!idea) throw new Error('Usage: obsidian-agent capture <idea text>');
      return capture(root, idea);
    },
  },
  {
    name: 'read',
    description: 'Read a note\'s full content',
    usage: 'read <note>',
    mcpSchema: {
      note: { type: 'string', description: 'Note filename (without .md)' },
      section: { type: 'string', description: 'Optional: read only this heading section' },
    },
    mcpRequired: ['note'],
    async run(root, flags, pos) {
      const { read } = await import('./commands/read.mjs');
      return read(root, flags.note || pos[0], { section: flags.section });
    },
  },
  {
    name: 'delete',
    description: 'Delete a note and clean up references',
    usage: 'delete <note>',
    mcpSchema: { note: { type: 'string', description: 'Note filename' } },
    mcpRequired: ['note'],
    async run(root, flags, pos) {
      const { deleteNote } = await import('./commands/delete.mjs');
      return deleteNote(root, flags.note || pos[0]);
    },
  },
  {
    name: 'archive',
    description: 'Set note status to archived',
    usage: 'archive <note>',
    mcpSchema: { note: { type: 'string', description: 'Note filename' } },
    mcpRequired: ['note'],
    async run(root, flags, pos) {
      const { archive } = await import('./commands/archive.mjs');
      return archive(root, flags.note || pos[0]);
    },
  },

  // ── Search & List ──
  {
    name: 'search',
    description: 'Full-text search across all notes (supports regex)',
    usage: 'search <keyword>',
    mcpSchema: {
      keyword: { type: 'string', description: 'Search keyword or regex pattern' },
      type: { type: 'string', description: 'Filter by note type' },
      tag: { type: 'string', description: 'Filter by tag' },
      status: { type: 'string', description: 'Filter by status' },
      regex: { type: 'boolean', description: 'Treat keyword as regex pattern' },
    },
    mcpRequired: ['keyword'],
    async run(root, flags, pos) {
      const { search } = await import('./commands/search.mjs');
      return search(root, flags.keyword || pos[0], {
        type: flags.type, tag: flags.tag, status: flags.status,
        regex: flags.regex === true,
      });
    },
  },
  {
    name: 'list',
    description: 'List notes with optional filters',
    usage: 'list [type]',
    mcpSchema: {
      type: { type: 'string', description: 'Filter by type' },
      tag: { type: 'string', description: 'Filter by tag' },
      status: { type: 'string', description: 'Filter by status' },
      recent: { type: 'number', description: 'Show notes updated in last N days' },
    },
    async run(root, flags, pos) {
      const { list } = await import('./commands/list.mjs');
      return list(root, {
        type: flags.type || pos[0], tag: flags.tag, status: flags.status,
        recent: flags.recent ? parseInt(flags.recent) : undefined,
      });
    },
  },
  {
    name: 'recent',
    description: 'Show recently updated notes',
    usage: 'recent [days]',
    mcpSchema: { days: { type: 'number', description: 'Number of days (default: 7)' } },
    async run(root, flags, pos) {
      const { recent } = await import('./commands/recent.mjs');
      return recent(root, {
        days: flags.days ? parseInt(flags.days) : pos[0] ? parseInt(pos[0]) : 7,
      });
    },
  },
  {
    name: 'backlinks',
    description: 'Show notes that link to a given note',
    usage: 'backlinks <note>',
    mcpSchema: { note: { type: 'string', description: 'Note filename (without .md)' } },
    mcpRequired: ['note'],
    async run(root, flags, pos) {
      const { backlinks } = await import('./commands/backlinks.mjs');
      return backlinks(root, flags.note || pos[0]);
    },
  },
  {
    name: 'orphans',
    description: 'Find notes with no inbound links',
    usage: 'orphans',
    mcpSchema: {},
    async run(root) {
      const { orphans } = await import('./commands/orphans.mjs');
      return orphans(root);
    },
  },

  // ── Update ──
  {
    name: 'update',
    description: 'Update note frontmatter fields',
    usage: 'update <note>',
    mcpSchema: {
      note: { type: 'string', description: 'Note filename' },
      status: { type: 'string', description: 'New status' },
      tags: { type: 'string', description: 'Comma-separated tags' },
      summary: { type: 'string', description: 'New summary' },
    },
    mcpRequired: ['note'],
    async run(root, flags, pos) {
      const { update } = await import('./commands/update.mjs');
      return update(root, flags.note || pos[0], {
        status: flags.status, tags: flags.tags, tag: flags.tag, summary: flags.summary,
      });
    },
  },
  {
    name: 'patch',
    description: 'Edit a section of a note by heading',
    usage: 'patch <note>',
    mcpSchema: {
      note: { type: 'string', description: 'Note filename' },
      heading: { type: 'string', description: 'Target heading text' },
      append: { type: 'string', description: 'Text to append' },
      prepend: { type: 'string', description: 'Text to prepend' },
      replace: { type: 'string', description: 'Text to replace section with' },
    },
    mcpRequired: ['note', 'heading'],
    async run(root, flags, pos) {
      const { patch } = await import('./commands/patch.mjs');
      return patch(root, flags.note || pos[0], {
        heading: flags.heading, append: flags.append, prepend: flags.prepend, replace: flags.replace,
      });
    },
  },

  // ── Structure ops ──
  {
    name: 'rename',
    description: 'Rename a note and update all references',
    usage: 'rename <note> <new-title>',
    mcpSchema: {
      note: { type: 'string', description: 'Note filename' },
      new_title: { type: 'string', description: 'New title' },
    },
    mcpRequired: ['note', 'new_title'],
    async run(root, flags, pos) {
      const { rename } = await import('./commands/rename.mjs');
      const n = flags.note || pos[0];
      const t = flags.new_title || pos[1];
      if (!n || !t) throw new Error('Usage: obsidian-agent rename <note-name> <new-title>');
      return rename(root, n, t);
    },
  },
  {
    name: 'move',
    description: 'Move a note to a different type/directory',
    usage: 'move <note> <new-type>',
    mcpSchema: {
      note: { type: 'string', description: 'Note filename' },
      new_type: { type: 'string', enum: ['area', 'project', 'resource', 'idea'], description: 'New type' },
    },
    mcpRequired: ['note', 'new_type'],
    async run(root, flags, pos) {
      const { move } = await import('./commands/move.mjs');
      const n = flags.note || pos[0];
      const t = flags.new_type || pos[1];
      if (!n || !t) throw new Error('Usage: obsidian-agent move <note-name> <new-type>');
      return move(root, n, t);
    },
  },
  {
    name: 'merge',
    description: 'Merge source note into target note',
    usage: 'merge <source> <target>',
    mcpSchema: {
      source: { type: 'string', description: 'Source note filename' },
      target: { type: 'string', description: 'Target note filename' },
    },
    mcpRequired: ['source', 'target'],
    async run(root, flags, pos) {
      const { merge } = await import('./commands/merge.mjs');
      const s = flags.source || pos[0];
      const t = flags.target || pos[1];
      if (!s || !t) throw new Error('Usage: obsidian-agent merge <source-note> <target-note>');
      return merge(root, s, t);
    },
  },
  {
    name: 'duplicates',
    description: 'Find potentially duplicate notes',
    usage: 'duplicates',
    mcpSchema: { threshold: { type: 'number', description: 'Similarity threshold 0-1 (default: 0.5)' } },
    async run(root, flags) {
      const { duplicates } = await import('./commands/duplicates.mjs');
      return duplicates(root, { threshold: flags.threshold ? parseFloat(flags.threshold) : undefined });
    },
  },
  {
    name: 'broken-links',
    description: 'Find broken [[wikilinks]]',
    usage: 'broken-links',
    mcpName: 'broken_links',
    mcpSchema: {},
    async run(root) {
      const { brokenLinks } = await import('./commands/broken-links.mjs');
      return brokenLinks(root);
    },
  },

  // ── Batch ops ──
  {
    name: 'batch',
    description: 'Batch operations on notes',
    usage: 'batch <update|tag|archive>',
    subcommands: {
      update: {
        mcpName: 'batch_update',
        description: 'Batch update matching notes',
        mcpSchema: {
          type: { type: 'string' }, tag: { type: 'string' }, status: { type: 'string' },
          set_status: { type: 'string' }, set_summary: { type: 'string' },
        },
        async run(root, flags) {
          const { batchUpdate } = await import('./commands/batch.mjs');
          return batchUpdate(root, {
            type: flags.type, tag: flags.tag, status: flags.status,
            setStatus: flags['set-status'] || flags.set_status,
            setSummary: flags['set-summary'] || flags.set_summary,
          });
        },
      },
      tag: {
        mcpName: 'batch_tag',
        description: 'Batch add/remove tags',
        mcpSchema: {
          type: { type: 'string' }, tag: { type: 'string' }, status: { type: 'string' },
          add: { type: 'string' }, remove: { type: 'string' },
        },
        async run(root, flags) {
          const { batchTag } = await import('./commands/batch.mjs');
          return batchTag(root, {
            type: flags.type, tag: flags.tag, status: flags.status,
            add: flags.add, remove: flags.remove,
          });
        },
      },
      archive: {
        mcpName: 'batch_archive',
        description: 'Batch archive matching notes',
        mcpSchema: {
          type: { type: 'string' }, tag: { type: 'string' }, status: { type: 'string' },
        },
        async run(root, flags) {
          const { batchArchive } = await import('./commands/batch.mjs');
          return batchArchive(root, { type: flags.type, tag: flags.tag, status: flags.status });
        },
      },
    },
  },

  // ── Import/Export ──
  {
    name: 'export',
    description: 'Export notes to JSON or markdown',
    usage: 'export [output]',
    mcpSchema: {
      type: { type: 'string' }, tag: { type: 'string' }, status: { type: 'string' },
      format: { type: 'string', enum: ['json', 'markdown'] },
      output: { type: 'string', description: 'Output file path' },
    },
    async run(root, flags, pos) {
      const { exportNotes } = await import('./commands/export.mjs');
      return exportNotes(root, {
        type: flags.type, tag: flags.tag, status: flags.status,
        format: flags.format, output: flags.output || pos[0],
      });
    },
  },
  {
    name: 'import',
    description: 'Import notes from JSON or markdown',
    usage: 'import <file>',
    async run(root, flags, pos) {
      const { importNotes } = await import('./commands/import.mjs');
      return importNotes(root, pos[0]);
    },
  },

  // ── Smart maintenance ──
  {
    name: 'link',
    description: 'Auto-link related but unlinked notes (TF-IDF weighted)',
    usage: 'link [--dry-run] [--threshold N] [--top N]',
    mcpSchema: {
      dry_run: { type: 'boolean', description: 'Preview only, do not write' },
      threshold: { type: 'number', description: 'Min TF-IDF score (default: 1.5)' },
      top: { type: 'number', description: 'Max links to create (default: 10)' },
    },
    async run(root, flags) {
      const { link } = await import('./commands/link.mjs');
      return link(root, {
        dryRun: flags['dry-run'] === true || flags.dry_run === true,
        threshold: flags.threshold ? parseFloat(flags.threshold) : undefined,
        top: flags.top ? parseInt(flags.top) : undefined,
      });
    },
  },
  {
    name: 'validate',
    description: 'Check frontmatter completeness',
    usage: 'validate',
    mcpSchema: {},
    async run(root) {
      const { validate } = await import('./commands/validate.mjs');
      return validate(root);
    },
  },
  {
    name: 'relink',
    description: 'Fix broken links with closest matches',
    usage: 'relink',
    mcpSchema: { dry_run: { type: 'boolean', description: 'Preview only' } },
    async run(root, flags) {
      const { relink } = await import('./commands/relink.mjs');
      return relink(root, { dryRun: flags['dry-run'] === true || flags.dry_run === true });
    },
  },

  // ── Timeline & review ──
  {
    name: 'timeline',
    description: 'Chronological activity feed',
    usage: 'timeline',
    mcpSchema: {
      days: { type: 'number', description: 'Days to look back (default: 30)' },
      type: { type: 'string' },
      limit: { type: 'number', description: 'Max entries (default: 50)' },
    },
    async run(root, flags) {
      const { timeline } = await import('./commands/timeline.mjs');
      return timeline(root, {
        days: flags.days ? parseInt(flags.days) : undefined,
        type: flags.type,
        limit: flags.limit ? parseInt(flags.limit) : undefined,
      });
    },
  },
  {
    name: 'review',
    description: 'Generate weekly or monthly review',
    usage: 'review [monthly]',
    async run(root, flags, pos) {
      if (pos[0] === 'monthly') {
        const { monthlyReview } = await import('./commands/review.mjs');
        return monthlyReview(root, {
          year: flags.year ? parseInt(flags.year) : undefined,
          month: flags.month ? parseInt(flags.month) : undefined,
        });
      }
      const { review } = await import('./commands/review.mjs');
      return review(root, { date: flags.date });
    },
  },

  // ── Pin ──
  {
    name: 'pin',
    description: 'Pin a note as favorite',
    usage: 'pin <note|list>',
    mcpSchema: { note: { type: 'string' } },
    mcpRequired: ['note'],
    subcommands: {
      list: {
        mcpName: 'pin_list',
        description: 'Show all pinned notes',
        mcpSchema: {},
        async run(root) {
          const { listPinned } = await import('./commands/pin.mjs');
          return listPinned(root);
        },
      },
    },
    async run(root, flags, pos) {
      if (pos[0] === 'list') {
        const { listPinned } = await import('./commands/pin.mjs');
        return listPinned(root);
      }
      const { pin } = await import('./commands/pin.mjs');
      return pin(root, flags.note || pos[0]);
    },
  },
  {
    name: 'unpin',
    description: 'Unpin a note',
    usage: 'unpin <note>',
    mcpSchema: { note: { type: 'string' } },
    mcpRequired: ['note'],
    async run(root, flags, pos) {
      const { unpin } = await import('./commands/pin.mjs');
      return unpin(root, flags.note || pos[0]);
    },
  },

  // ── Stats & analysis ──
  {
    name: 'stats',
    description: 'Show vault statistics',
    usage: 'stats',
    mcpSchema: {},
    async run(root) {
      const { stats } = await import('./commands/stats.mjs');
      return stats(root);
    },
  },
  {
    name: 'graph',
    description: 'Generate Mermaid knowledge graph',
    usage: 'graph',
    mcpSchema: { type: { type: 'string', description: 'Filter by note type' } },
    async run(root, flags) {
      const { graph } = await import('./commands/graph.mjs');
      return graph(root, { type: flags.type });
    },
  },
  {
    name: 'health',
    description: 'Vault health scoring',
    usage: 'health',
    mcpSchema: {},
    async run(root) {
      const { health } = await import('./commands/health.mjs');
      return health(root);
    },
  },
  {
    name: 'sync',
    description: 'Rebuild tag and graph indices',
    usage: 'sync',
    mcpSchema: {},
    async run(root) {
      const { sync } = await import('./commands/sync.mjs');
      return sync(root);
    },
  },
  {
    name: 'suggest',
    description: 'Actionable vault improvement suggestions',
    usage: 'suggest',
    mcpSchema: { limit: { type: 'number', description: 'Max suggestions (default: 10)' } },
    async run(root, flags) {
      const { suggest } = await import('./commands/suggest.mjs');
      return suggest(root, { limit: flags.limit ? parseInt(flags.limit) : undefined });
    },
  },
  {
    name: 'daily',
    description: 'Daily dashboard (journal status, activity, pinned, projects)',
    usage: 'daily',
    mcpSchema: {},
    async run(root) {
      const { daily } = await import('./commands/daily.mjs');
      return daily(root);
    },
  },
  {
    name: 'count',
    description: 'Word/line/note count statistics',
    usage: 'count',
    mcpSchema: { type: { type: 'string', description: 'Filter by note type' } },
    async run(root, flags) {
      const { count } = await import('./commands/count.mjs');
      return count(root, { type: flags.type });
    },
  },
  {
    name: 'agenda',
    description: 'Pending TODO items from journals and projects',
    usage: 'agenda',
    mcpSchema: {
      days: { type: 'number', description: 'Days to scan (default: 7)' },
      all: { type: 'boolean', description: 'Scan all notes, not just recent' },
    },
    async run(root, flags) {
      const { agenda } = await import('./commands/agenda.mjs');
      return agenda(root, {
        days: flags.days ? parseInt(flags.days) : undefined,
        all: flags.all === true,
      });
    },
  },
  {
    name: 'changelog',
    description: 'Generate vault changelog from recent activity',
    usage: 'changelog [output]',
    mcpSchema: { days: { type: 'number', description: 'Days (default: 7)' } },
    async run(root, flags, pos) {
      const { changelog } = await import('./commands/changelog.mjs');
      return changelog(root, { days: flags.days ? parseInt(flags.days) : undefined, output: pos[0] });
    },
  },
  {
    name: 'neighbors',
    description: 'Show connected notes within N hops',
    usage: 'neighbors <note>',
    mcpSchema: {
      note: { type: 'string' },
      depth: { type: 'number', description: 'Max hops (default: 2)' },
    },
    mcpRequired: ['note'],
    async run(root, flags, pos) {
      const { neighbors } = await import('./commands/neighbors.mjs');
      return neighbors(root, flags.note || pos[0], {
        depth: flags.depth ? parseInt(flags.depth) : undefined,
      });
    },
  },
  {
    name: 'random',
    description: 'Pick random note(s) for serendipitous review',
    usage: 'random [count]',
    mcpSchema: {
      count: { type: 'number', description: 'How many (default: 1)' },
      type: { type: 'string' }, status: { type: 'string' },
    },
    async run(root, flags, pos) {
      const { random } = await import('./commands/random.mjs');
      return random(root, {
        count: flags.count ? parseInt(flags.count) : pos[0] ? parseInt(pos[0]) : undefined,
        type: flags.type, status: flags.status,
      });
    },
  },
  {
    name: 'focus',
    description: 'Suggest what to work on next',
    usage: 'focus',
    mcpSchema: {},
    async run(root) {
      const { focus } = await import('./commands/focus.mjs');
      return focus(root);
    },
  },

  // ── Tags ──
  {
    name: 'tag',
    description: 'Tag operations',
    usage: 'tag <list|rename>',
    subcommands: {
      list: {
        mcpName: 'tag_list',
        description: 'List all tags with counts',
        mcpSchema: {},
        async run(root) {
          const { tagList } = await import('./commands/tag.mjs');
          return tagList(root);
        },
      },
      rename: {
        mcpName: 'tag_rename',
        description: 'Rename a tag across the vault',
        mcpSchema: { old_tag: { type: 'string' }, new_tag: { type: 'string' } },
        mcpRequired: ['old_tag', 'new_tag'],
        async run(root, flags, pos) {
          const { tagRename } = await import('./commands/tag.mjs');
          return tagRename(root, flags.old_tag || pos[0], flags.new_tag || pos[1]);
        },
      },
    },
    async run(root, flags, pos) {
      const sub = pos[0];
      if (sub === 'rename') {
        const { tagRename } = await import('./commands/tag.mjs');
        return tagRename(root, pos[1], pos[2]);
      } else if (sub === 'list') {
        const { tagList } = await import('./commands/tag.mjs');
        return tagList(root);
      }
      throw new Error('Usage: obsidian-agent tag <rename|list>');
    },
  },

  // ── Utility ──
  {
    name: 'setup',
    description: 'Install MCP server + skill',
    usage: 'setup [vault-path]',
    async run(root, flags, pos) {
      const { setup } = await import('./commands/setup.mjs');
      return setup(pos[0]);
    },
  },
  {
    name: 'watch',
    description: 'Auto-rebuild indices on file changes',
    usage: 'watch',
    noReturn: true,
    async run(root) {
      const { watch } = await import('./commands/watch.mjs');
      return watch(root);
    },
  },
  {
    name: 'hook',
    description: 'Handle agent hook events',
    usage: 'hook <event>',
    async run(root, flags, pos) {
      const event = pos[0];
      if (event === 'session-stop') {
        const { sessionStop } = await import('./commands/hook.mjs');
        return sessionStop(root, { scanRoot: flags['scan-root'] });
      } else if (event === 'daily-backfill') {
        const { dailyBackfill } = await import('./commands/hook.mjs');
        return dailyBackfill(root, {
          date: flags.date, scanRoot: flags['scan-root'], force: flags.force === true,
        });
      }
      throw new Error(`Unknown hook event: ${event}\nAvailable: session-stop, daily-backfill`);
    },
  },
  {
    name: 'serve',
    description: 'Start MCP server (stdio transport)',
    usage: 'serve',
    noReturn: true,
    async run(root) {
      const { McpServer } = await import('./mcp-server.mjs');
      const server = new McpServer(root);
      server.start();
    },
  },
  {
    name: 'open',
    description: 'Open a note in Obsidian.app (macOS)',
    usage: 'open [note] [--reveal]',
    mcpSchema: {
      note: { type: 'string', description: 'Note filename (opens vault root if omitted)' },
      reveal: { type: 'boolean', description: 'Reveal in file explorer instead of opening' },
    },
    async run(root, flags, pos) {
      const { open } = await import('./commands/open.mjs');
      return open(root, flags.note || pos[0], { reveal: flags.reveal === true });
    },
  },
  {
    name: 'quicknote',
    description: 'Capture from clipboard as an idea note',
    usage: 'quicknote [--title TITLE]',
    mcpSchema: {
      title: { type: 'string', description: 'Optional title override' },
    },
    async run(root, flags) {
      const { quicknote } = await import('./commands/quicknote.mjs');
      return quicknote(root, { title: flags.title });
    },
  },
  {
    name: 'launchd',
    description: 'Install/uninstall macOS LaunchAgents for automated vault maintenance',
    usage: 'launchd <install|uninstall|status>',
    async run(root, flags, pos) {
      const { launchd } = await import('./commands/launchd.mjs');
      return launchd(root, pos[0], flags);
    },
  },
  // ── Canvas ──
  {
    name: 'canvas',
    description: 'Manage JSON Canvas (.canvas) files',
    usage: 'canvas <create|read|add-node|add-edge> <name>',
    subcommands: {
      create: {
        mcpName: 'canvas_create',
        description: 'Create a new canvas file',
        mcpSchema: { name: { type: 'string', description: 'Canvas filename' } },
        mcpRequired: ['name'],
        async run(root, flags) {
          const { canvasCreate } = await import('./commands/canvas.mjs');
          return canvasCreate(root, flags.name);
        },
      },
      read: {
        mcpName: 'canvas_read',
        description: 'Read and parse a canvas file',
        mcpSchema: { name: { type: 'string', description: 'Canvas filename' } },
        mcpRequired: ['name'],
        async run(root, flags) {
          const { canvasRead } = await import('./commands/canvas.mjs');
          return canvasRead(root, flags.name);
        },
      },
      'add-node': {
        mcpName: 'canvas_add_node',
        description: 'Add a node to a canvas (text, file, link, or group)',
        mcpSchema: {
          name: { type: 'string', description: 'Canvas filename' },
          type: { type: 'string', enum: ['text', 'file', 'link', 'group'], description: 'Node type' },
          text: { type: 'string', description: 'Text content (for text nodes)' },
          file: { type: 'string', description: 'File path (for file nodes)' },
          url: { type: 'string', description: 'URL (for link nodes)' },
          label: { type: 'string', description: 'Label (for group nodes)' },
          color: { type: 'string', description: 'Color (1-6 or hex)' },
        },
        mcpRequired: ['name'],
        async run(root, flags) {
          const { canvasAddNode } = await import('./commands/canvas.mjs');
          return canvasAddNode(root, flags.name, flags);
        },
      },
      'add-edge': {
        mcpName: 'canvas_add_edge',
        description: 'Add an edge between two nodes in a canvas',
        mcpSchema: {
          name: { type: 'string', description: 'Canvas filename' },
          from: { type: 'string', description: 'Source node ID' },
          to: { type: 'string', description: 'Target node ID' },
          label: { type: 'string', description: 'Edge label' },
          color: { type: 'string', description: 'Edge color' },
        },
        mcpRequired: ['name', 'from', 'to'],
        async run(root, flags) {
          const { canvasAddEdge } = await import('./commands/canvas.mjs');
          return canvasAddEdge(root, flags.name, flags);
        },
      },
    },
    async run(root, flags, pos) {
      const sub = pos[0];
      const name = flags.name || pos[1];
      switch (sub) {
        case 'create': {
          const { canvasCreate } = await import('./commands/canvas.mjs');
          return canvasCreate(root, name);
        }
        case 'read': {
          const { canvasRead } = await import('./commands/canvas.mjs');
          return canvasRead(root, name);
        }
        case 'add-node': {
          const { canvasAddNode } = await import('./commands/canvas.mjs');
          return canvasAddNode(root, name, flags);
        }
        case 'add-edge': {
          const { canvasAddEdge } = await import('./commands/canvas.mjs');
          return canvasAddEdge(root, name, flags);
        }
        default:
          throw new Error('Usage: canvas <create|read|add-node|add-edge> <name>');
      }
    },
  },
  // ── Smart Search ──
  {
    name: 'smart-search',
    description: 'BM25 ranked search — better relevance than keyword matching',
    usage: 'smart-search <query>',
    mcpName: 'smart_search',
    mcpSchema: {
      query: { type: 'string', description: 'Search query (supports multi-word)' },
      type: { type: 'string', description: 'Filter by note type' },
      tag: { type: 'string', description: 'Filter by tag' },
      status: { type: 'string', description: 'Filter by status' },
      limit: { type: 'number', description: 'Max results (default: 20)' },
    },
    mcpRequired: ['query'],
    async run(root, flags, pos) {
      const { smartSearch } = await import('./commands/smart-search.mjs');
      const query = flags.query || pos.join(' ');
      if (!query) throw new Error('Usage: obsidian-agent smart-search <query>');
      return smartSearch(root, query, { type: flags.type, tag: flags.tag, status: flags.status, limit: flags.limit });
    },
  },
  // ── Embed Search ──
  {
    name: 'embed-search',
    description: 'Semantic search using embeddings (Ollama or OpenAI, falls back to BM25)',
    usage: 'embed-search <query>',
    mcpName: 'embed_search',
    mcpSchema: {
      query: { type: 'string', description: 'Search query (natural language)' },
      type: { type: 'string', description: 'Filter by note type' },
      tag: { type: 'string', description: 'Filter by tag' },
      provider: { type: 'string', enum: ['auto', 'ollama', 'openai', 'off'], description: 'Embedding provider (default: auto-detect)' },
      limit: { type: 'number', description: 'Max results (default: 20)' },
    },
    mcpRequired: ['query'],
    async run(root, flags, pos) {
      const { embedSearch } = await import('./commands/embed-search.mjs');
      const query = flags.query || pos.join(' ');
      if (!query) throw new Error('Usage: obsidian-agent embed-search <query>');
      return embedSearch(root, query, flags);
    },
  },
  {
    name: 'embed-status',
    description: 'Show embedding provider status (Ollama, OpenAI)',
    usage: 'embed-status',
    mcpName: 'embed_status',
    mcpSchema: {},
    async run() {
      const { embedStatus } = await import('./commands/embed-search.mjs');
      const s = embedStatus();
      console.log(`Ollama: ${s.ollama}`);
      console.log(`OpenAI: ${s.openai}`);
      console.log(`Active: ${s.active}`);
      return s;
    },
  },
  // ── Bridge ──
  {
    name: 'bridge-status',
    description: 'Show Obsidian CLI bridge status (official CLI detection)',
    usage: 'bridge-status',
    mcpName: 'bridge_status',
    mcpSchema: {},
    async run() {
      const { bridgeStatus } = await import('./obsidian-cli.mjs');
      const s = bridgeStatus();
      if (s.officialCli.available) {
        console.log(`Obsidian CLI: ✓ detected (${s.officialCli.version})`);
        console.log(`  Path: ${s.officialCli.path}`);
      } else {
        console.log(`Obsidian CLI: ✗ not available (${s.officialCli.reason})`);
      }
      console.log(`Bridge mode: ${s.envOverride}`);
      console.log(`Bridgeable commands: ${s.bridgeableCommands.join(', ')}`);
      return s;
    },
  },
];

// ── Lookup helpers ──────────────────────────────────────

const _byName = new Map();
for (const cmd of COMMANDS) _byName.set(cmd.name, cmd);

export function getCommand(name) {
  return _byName.get(name);
}

export function getAllCommands() {
  return COMMANDS;
}

export function getCommandNames() {
  return COMMANDS.map(c => c.name);
}

// ── MCP tool definitions (generated from registry) ─────

export function getMcpTools() {
  const tools = [];
  for (const cmd of COMMANDS) {
    if (cmd.mcpSchema) {
      tools.push({
        name: cmd.mcpName || cmd.name,
        description: cmd.description,
        inputSchema: {
          type: 'object',
          properties: cmd.mcpSchema,
          ...(cmd.mcpRequired ? { required: cmd.mcpRequired } : {}),
        },
      });
    }
    // Flatten subcommands into MCP tools
    if (cmd.subcommands) {
      for (const [, sub] of Object.entries(cmd.subcommands)) {
        if (sub.mcpSchema) {
          tools.push({
            name: sub.mcpName,
            description: sub.description,
            inputSchema: {
              type: 'object',
              properties: sub.mcpSchema,
              ...(sub.mcpRequired ? { required: sub.mcpRequired } : {}),
            },
          });
        }
      }
    }
  }
  return tools;
}

// ── MCP dispatch (tool name → handler) ─────────────────

export function getMcpDispatch() {
  const dispatch = {};
  for (const cmd of COMMANDS) {
    if (cmd.mcpSchema) {
      const name = cmd.mcpName || cmd.name;
      dispatch[name] = (root, args) => cmd.run(root, args, []);
    }
    if (cmd.subcommands) {
      for (const [, sub] of Object.entries(cmd.subcommands)) {
        if (sub.mcpName) {
          dispatch[sub.mcpName] = (root, args) => sub.run(root, args, []);
        }
      }
    }
  }
  return dispatch;
}
