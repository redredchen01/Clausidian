/**
 * System commands
 */

export default [

  // ── Utility ──
  {
    name: 'setup',
    description: 'Install MCP server + skill',
    usage: 'setup [vault-path]',
    async run(root, flags, pos) {
      const { setup } = await import('../commands/setup.mjs');
      return setup(pos[0]);
    },
  },,
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
];
