/**
 * Discovery commands
 */

export default [
  {
    name: 'suggest',
    description: 'Actionable vault improvement suggestions',
    usage: 'suggest',
    mcpSchema: { limit: { type: 'number', description: 'Max suggestions (default: 10)' } },
    async run(root, flags) {
      const { suggest } = await import('../commands/suggest.mjs');
      return suggest(root, { limit: flags.limit ? parseInt(flags.limit) : undefined });
    },
  },,
  {
    name: 'daily',
    description: 'Daily dashboard (journal status, activity, pinned, projects)',
    usage: 'daily',
    mcpSchema: {},
    async run(root) {
      const { daily } = await import('../commands/daily.mjs');
      return daily(root);
    },
  },,
  {
    name: 'auto-tag',
    description: 'Auto-suggest TF-IDF tags for untagged notes',
    usage: 'auto-tag [--dry-run]',
    mcpSchema: { dry_run: { type: 'boolean', description: 'Preview suggestions only' } },
    async run(root, flags) {
      const { autoTag } = await import('../commands/auto-tag.mjs');
      return autoTag(root, { dryRun: flags['dry-run'] === true || flags.dry_run === true });
    },
  },,
  {
    name: 'count',
    description: 'Word/line/note count statistics',
    usage: 'count',
    mcpSchema: { type: { type: 'string', description: 'Filter by note type' } },
    async run(root, flags) {
      const { count } = await import('../commands/count.mjs');
      return count(root, { type: flags.type });
    },
  },,
  {
    name: 'agenda',
    description: 'Pending TODO items from journals and projects',
    usage: 'agenda',
    mcpSchema: {
      days: { type: 'number', description: 'Days to scan (default: 7)' },
      all: { type: 'boolean', description: 'Scan all notes, not just recent' },
    },
    async run(root, flags) {
      const { agenda } = await import('../commands/agenda.mjs');
      return agenda(root, {
        days: flags.days ? parseInt(flags.days) : undefined,
        all: flags.all === true,
      });
    },
  },,
];
