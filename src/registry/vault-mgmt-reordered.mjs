/**
 * Vault Mgmt Reordered commands
 */

export default [
  {
    name: 'vault',
    description: 'Manage registered vaults',
    usage: 'vault <list|register|default|info|remove>',
    subcommands: {
      list: {
        mcpName: 'vault_list',
        description: 'List all registered vaults',
        mcpSchema: {},
        async run(root, flags) {
          const { vault } = await import('../commands/vault.mjs');
          return vault(root, { subcommand: 'list' });
        },
      },
      register: {
        mcpName: 'vault_register',
        description: 'Register a new vault',
        mcpSchema: {
          name: { type: 'string', description: 'Vault name' },
          path: { type: 'string', description: 'Vault path' },
        },
        mcpRequired: ['name', 'path'],
        async run(root, flags, pos) {
          const { vault } = await import('../commands/vault.mjs');
          return vault(root, { subcommand: 'register', name: flags.name || pos[0], path: flags.path || pos[1] });
        },
      },
      default: {
        mcpName: 'vault_default',
        description: 'Set default vault',
        mcpSchema: {
          name: { type: 'string', description: 'Vault name' },
        },
        mcpRequired: ['name'],
        async run(root, flags, pos) {
          const { vault } = await import('../commands/vault.mjs');
          return vault(root, { subcommand: 'default', name: flags.name || pos[0] });
        },
      },
      info: {
        mcpName: 'vault_info',
        description: 'Get vault info',
        mcpSchema: {
          name: { type: 'string', description: 'Vault name' },
        },
        mcpRequired: ['name'],
        async run(root, flags, pos) {
          const { vault } = await import('../commands/vault.mjs');
          return vault(root, { subcommand: 'info', name: flags.name || pos[0] });
        },
      },
      remove: {
        mcpName: 'vault_remove',
        description: 'Remove a vault',
        mcpSchema: {
          name: { type: 'string', description: 'Vault name' },
        },
        mcpRequired: ['name'],
        async run(root, flags, pos) {
          const { vault } = await import('../commands/vault.mjs');
          return vault(root, { subcommand: 'remove', name: flags.name || pos[0] });
        },
      },
    },
  },,

  // ── v3.5 Event System ──
];
