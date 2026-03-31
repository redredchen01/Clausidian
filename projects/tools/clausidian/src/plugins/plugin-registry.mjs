/**
 * Plugin Registry — Central store for plugins, commands, and hooks
 * Clausidian v3.5.0+
 */

/**
 * PluginRegistry — Single source of truth for plugin ecosystem
 */
export class PluginRegistry {
  constructor(vault, eventBus) {
    this.vault = vault;
    this.eventBus = eventBus;
    this.plugins = new Map();      // name → { manifest, instance, enabled }
    this.commands = new Map();     // name → { handler, plugin, description, flags }
    this.hooks = new Map();        // event → [{ handler, plugin, priority }]
    this.searches = new Map();     // name → { handler, plugin }
  }

  /**
   * Register a plugin
   */
  registerPlugin(plugin) {
    if (!plugin.name) throw new Error('Plugin must have a name');

    this.plugins.set(plugin.name, {
      name: plugin.name,
      manifest: plugin.manifest || {},
      instance: plugin.instance || {},
      enabled: plugin.enabled !== false,
      registeredAt: new Date().toISOString(),
    });

    return { success: true, name: plugin.name };
  }

  /**
   * Unregister a plugin
   */
  unregisterPlugin(name) {
    if (!this.plugins.has(name)) {
      return { success: false, error: `Plugin not found: ${name}` };
    }

    // Remove all commands registered by this plugin
    for (const [cmdName, cmd] of this.commands) {
      if (cmd.plugin === name) {
        this.commands.delete(cmdName);
      }
    }

    // Remove all hooks registered by this plugin
    for (const [event, handlers] of this.hooks) {
      const remaining = handlers.filter(h => h.plugin !== name);
      if (remaining.length === 0) {
        this.hooks.delete(event);
      } else {
        this.hooks.set(event, remaining);
      }
    }

    this.plugins.delete(name);
    return { success: true };
  }

  /**
   * Register a command
   */
  registerCommand(cmd) {
    if (!cmd.name || !cmd.handler) {
      throw new Error('Command must have name and handler');
    }

    this.commands.set(cmd.name, {
      name: cmd.name,
      handler: cmd.handler,
      plugin: cmd.plugin || 'core',
      description: cmd.description || '',
      flags: cmd.flags || {},
    });

    return { success: true, name: cmd.name };
  }

  /**
   * Unregister a command
   */
  unregisterCommand(name) {
    return { success: this.commands.delete(name) };
  }

  /**
   * Execute a command
   */
  async executeCommand(name, args = {}) {
    if (!this.commands.has(name)) {
      return { success: false, error: `Command not found: ${name}` };
    }

    const cmd = this.commands.get(name);
    const plugin = cmd.plugin ? this.plugins.get(cmd.plugin) : null;

    if (plugin && !plugin.enabled) {
      return { success: false, error: `Plugin disabled: ${cmd.plugin}` };
    }

    try {
      const result = await cmd.handler(args);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get a command
   */
  getCommand(name) {
    return this.commands.get(name);
  }

  /**
   * List all commands
   */
  listCommands() {
    return Array.from(this.commands.values()).map(cmd => ({
      name: cmd.name,
      plugin: cmd.plugin,
      description: cmd.description,
    }));
  }

  /**
   * Register a hook/event handler
   */
  registerHook(hook) {
    if (!hook.name || !hook.handler) {
      throw new Error('Hook must have name and handler');
    }

    if (!this.hooks.has(hook.name)) {
      this.hooks.set(hook.name, []);
    }

    const handler = {
      name: hook.name,
      handler: hook.handler,
      plugin: hook.plugin || 'core',
      priority: hook.priority || 0,
    };

    const handlers = this.hooks.get(hook.name);
    handlers.push(handler);

    // Sort by priority (higher first)
    handlers.sort((a, b) => b.priority - a.priority);

    return { success: true, event: hook.name };
  }

  /**
   * Unregister a hook
   */
  unregisterHook(event, plugin) {
    if (!this.hooks.has(event)) {
      return { success: false, error: `Event not found: ${event}` };
    }

    const handlers = this.hooks.get(event);
    const remaining = handlers.filter(h => h.plugin !== plugin);

    if (remaining.length === 0) {
      this.hooks.delete(event);
    } else {
      this.hooks.set(event, remaining);
    }

    return { success: true };
  }

  /**
   * Execute all hooks for an event
   */
  async executeHooks(event, payload = {}) {
    if (!this.hooks.has(event)) {
      return { success: true, results: [], event };
    }

    const handlers = this.hooks.get(event);
    const results = [];
    const errors = [];

    for (const hook of handlers) {
      const plugin = this.plugins.get(hook.plugin);
      if (plugin && !plugin.enabled) continue;

      try {
        const result = await hook.handler(payload);
        results.push({ plugin: hook.plugin, result });
      } catch (err) {
        errors.push({ plugin: hook.plugin, error: err.message });
      }
    }

    return { success: errors.length === 0, event, results, errors };
  }

  /**
   * Get hooks for an event
   */
  getHooks(event) {
    return this.hooks.get(event) || [];
  }

  /**
   * List all hooks
   */
  listHooks() {
    const result = {};
    for (const [event, handlers] of this.hooks) {
      result[event] = handlers.map(h => ({
        plugin: h.plugin,
        priority: h.priority,
      }));
    }
    return result;
  }

  /**
   * Register search customizer
   */
  registerSearchCustomizer(name, handler) {
    this.searches.set(name, {
      name,
      handler,
      registeredAt: new Date().toISOString(),
    });
    return { success: true };
  }

  /**
   * Get search customizer
   */
  getSearchCustomizer(name) {
    return this.searches.get(name);
  }

  /**
   * Enable a plugin
   */
  enablePlugin(name) {
    if (!this.plugins.has(name)) {
      return { success: false, error: `Plugin not found: ${name}` };
    }
    this.plugins.get(name).enabled = true;
    return { success: true };
  }

  /**
   * Disable a plugin
   */
  disablePlugin(name) {
    if (!this.plugins.has(name)) {
      return { success: false, error: `Plugin not found: ${name}` };
    }
    this.plugins.get(name).enabled = false;
    return { success: true };
  }

  /**
   * Get plugin info
   */
  getPlugin(name) {
    return this.plugins.get(name);
  }

  /**
   * List all plugins
   */
  listPlugins() {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      enabled: p.enabled,
      registeredAt: p.registeredAt,
    }));
  }
}

export default PluginRegistry;
