/**
 * Integration commands
 */

export default [
  // ── Phase 3: Memory System ──
  {
    name: 'context-for-topic',
    description: 'Get vault context for a topic (search + neighbors + backlinks)',
    usage: 'context-for-topic <topic>',
    mcpName: 'context_for_topic',
    mcpSchema: {
      topic: { type: 'string', description: 'Topic to search for' },
      depth: { type: 'number', description: 'Relationship depth (default: 1)' },
    },
    mcpRequired: ['topic'],
    async run(root, flags, pos) {
      const { contextForTopic } = await import('../commands/memory.mjs');
      return contextForTopic(root, flags.topic || pos[0], { depth: flags.depth });
    },
  },,
  // ── Phase 4: CLAUDE.md Management ──
];
