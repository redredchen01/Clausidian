/**
 * CommandFactory — Unified command creation with auto-generated run() methods
 *
 * Eliminates boilerplate in registry.mjs by:
 * 1. Caching dynamic imports (not re-importing on every call)
 * 2. Auto-generating run() with ParamSpec parsing
 * 3. Consistent error handling
 *
 * Usage:
 *   const factory = new CommandFactory();
 *   const cmd = factory.createCommand({
 *     name: 'note',
 *     description: 'Create a new note',
 *     paramSpec: new ParamSpec().string('title', { required: true }),
 *     modulePath: './commands/note.mjs',
 *     handlerName: 'note'
 *   });
 */

export class CommandFactory {
  constructor() {
    this.importCache = new Map();
  }

  /**
   * Create a command object from config
   * @param {Object} config - Command configuration
   * @param {string} config.name - Command name
   * @param {string} config.description - Command description
   * @param {string} config.usage - Command usage
   * @param {ParamSpec} config.paramSpec - Parameter specification
   * @param {string} config.modulePath - Path to command module
   * @param {string} config.handlerName - Handler function name in module
   * @param {boolean} [config.cached=true] - Cache the import
   * @returns {Object} Command object compatible with registry
   */
  createCommand(config) {
    const { name, description, usage, paramSpec, modulePath, handlerName, cached = true } = config;

    const factory = this;

    return {
      name,
      description,
      usage,
      mcpSchema: paramSpec.toMcpSchema(),
      mcpRequired: paramSpec.getRequired(),
      mcpName: config.mcpName || undefined,

      async run(root, flags, pos) {
        try {
          // Parse arguments using ParamSpec
          const parser = paramSpec.makeParser();
          const args = parser(flags, pos);

          // Import handler (cached)
          const mod = cached ? await factory._importCached(modulePath) : await import(modulePath);

          // Get handler function
          if (!(handlerName in mod)) {
            throw new Error(`Handler "${handlerName}" not found in ${modulePath}`);
          }
          const handler = mod[handlerName];

          // Execute handler
          return await handler(root, args);
        } catch (err) {
          // Re-throw with better context
          if (err.message.includes('Missing required parameter') || err.message.includes('Invalid value')) {
            throw err; // Validation errors, pass through
          }
          if (err.code === 'MODULE_NOT_FOUND') {
            throw new Error(`Command module not found: ${modulePath}`);
          }
          throw err;
        }
      }
    };
  }

  /**
   * Import a module with caching
   * @private
   */
  async _importCached(modulePath) {
    if (!this.importCache.has(modulePath)) {
      this.importCache.set(modulePath, await import(modulePath));
    }
    return this.importCache.get(modulePath);
  }

  /**
   * Clear the import cache (for memory management in long-running processes)
   */
  clearImportCache() {
    this.importCache.clear();
  }

  /**
   * Get import cache stats (for debugging)
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.importCache.size,
      modules: Array.from(this.importCache.keys())
    };
  }
}
