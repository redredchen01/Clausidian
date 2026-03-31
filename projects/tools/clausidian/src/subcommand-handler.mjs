/**
 * SubcommandHandler — Unified subcommand dispatch
 *
 * Eliminates duplicate subcommand routing logic from batch, bridge, pin, tag commands.
 *
 * Usage:
 *   const handler = createSubcommandHandler({
 *     name: 'batch',
 *     description: 'Batch operations on notes',
 *     module: 'batch',
 *     subcommands: {
 *       update: { fn: 'batchUpdate', description: 'Batch update' },
 *       tag: { fn: 'batchTag', description: 'Batch tag' }
 *     }
 *   });
 */

/**
 * Create a subcommand handler command
 * @param {Object} config - Handler configuration
 * @param {string} config.name - Command name (e.g., 'batch')
 * @param {string} config.description - Command description
 * @param {string} config.module - Module name (e.g., 'batch' → './commands/batch.mjs')
 * @param {Object} config.subcommands - Subcommand definitions
 * @returns {Object} Command object compatible with registry
 */
export function createSubcommandHandler(config) {
  const { name, description, module, subcommands } = config;

  return {
    name,
    description,
    usage: `${name} <subcommand>`,
    async run(root, flags, pos) {
      // Get subcommand name from positional or flags
      const subname = pos[0] || flags.subcommand;

      if (!subname) {
        const available = Object.keys(subcommands).join(', ');
        throw new Error(
          `Usage: ${name} <subcommand>\n` +
          `Available subcommands: ${available}\n` +
          `Use: --help for more information`
        );
      }

      const subconfig = subcommands[subname];
      if (!subconfig) {
        const available = Object.keys(subcommands).join(', ');
        throw new Error(
          `Unknown subcommand: ${subname}\n` +
          `Available subcommands: ${available}`
        );
      }

      // Dynamically import the module
      const mod = await import(`./commands/${module}.mjs`);
      const handler = mod[subconfig.fn];

      if (!handler) {
        throw new Error(
          `Handler function "${subconfig.fn}" not found in commands/${module}.mjs`
        );
      }

      // Execute with all flags and the subcommand name
      return handler(root, { ...flags, subcommand: subname });
    }
  };
}
