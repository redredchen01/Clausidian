/**
 * Shortcuts commands
 */

export default [
  // ── Bridge (cross-system integrations) ──
  {
    name: 'cache',
    description: 'Manage search cache (stats, clear)',
    usage: 'cache <stats|clear>',
    mcpSchema: {
      subcommand: { type: 'string', enum: ['stats', 'clear'], description: 'Subcommand: stats or clear' },
    },
    mcpRequired: ['subcommand'],
    async run(root, flags) {
      const { cache } = await import('../commands/cache.mjs');
      return cache(root, { subcommand: flags.subcommand });
    },
  },
];
