/**
 * Update commands
 */

export default [

  // ── Update ──

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
      const { rename } = await import('../commands/rename.mjs');
      const n = flags.note || pos[0];
      const t = flags.new_title || pos[1];
      if (!n || !t) throw new Error('Usage: clausidian rename <note-name> <new-title>');
      return rename(root, n, t);
    },
  },,
];
