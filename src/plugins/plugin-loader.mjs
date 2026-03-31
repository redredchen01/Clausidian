/**
 * Plugin Loader — Dynamic plugin discovery and loading
 * Clausidian v3.5.0+
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { resolve, join, basename } from 'path';
import { pathToFileURL } from 'url';

export class PluginLoader {
  constructor(vault, pluginDir = null) {
    this.vault = vault;
    this.pluginDir = pluginDir || resolve(process.env.HOME || '/tmp', '.clausidian', 'plugins');
    this.loadedPlugins = new Map();
    this.pluginCache = new Map();
  }

  async discoverPlugins() {
    const plugins = [];
    if (!existsSync(this.pluginDir)) return plugins;

    try {
      const entries = readdirSync(this.pluginDir);
      for (const entry of entries) {
        const pluginPath = resolve(this.pluginDir, entry);
        const stat = statSync(pluginPath);
        if (!stat.isDirectory()) continue;

        const manifest = this.#loadManifest(pluginPath);
        if (!manifest) continue;

        plugins.push({
          name: manifest.name || entry,
          path: pluginPath,
          manifest,
          enabled: manifest.enabled !== false,
          version: manifest.version || '0.0.1',
        });
      }
    } catch (err) {
      console.error(`[PluginLoader] Error discovering plugins: ${err.message}`);
    }

    return plugins;
  }

  async loadPlugin(name, options = {}) {
    const { forceReload = false } = options;

    if (!forceReload && this.loadedPlugins.has(name)) {
      return { success: true, plugin: this.loadedPlugins.get(name) };
    }

    try {
      const pluginPath = resolve(this.pluginDir, name);
      if (!existsSync(pluginPath)) {
        return { success: false, error: `Plugin not found: ${name}` };
      }

      const manifest = this.#loadManifest(pluginPath);
      if (!manifest) {
        return { success: false, error: `No manifest found for plugin: ${name}` };
      }

      const validation = this.#validateManifest(manifest);
      if (!validation.valid) {
        return { success: false, error: validation.errors.join('; ') };
      }

      const compatResult = this.#checkVersionCompatibility(manifest);
      if (!compatResult.compatible) {
        return { success: false, error: `Plugin version incompatible: ${compatResult.reason}` };
      }

      const entryPoint = resolve(pluginPath, manifest.entry || 'index.mjs');
      if (!existsSync(entryPoint)) {
        return { success: false, error: `Entry point not found: ${entryPoint}` };
      }

      const module = await import(pathToFileURL(entryPoint).href);
      const PluginClass = module.default || module.Plugin;

      if (!PluginClass || typeof PluginClass !== 'function') {
        return { success: false, error: 'Plugin must export default class' };
      }

      const instance = new PluginClass(this.vault, manifest);
      if (typeof instance.init === 'function') {
        await instance.init();
      }

      const pluginData = {
        name: manifest.name,
        manifest,
        module,
        instance,
        loadedAt: new Date().toISOString(),
      };

      this.loadedPlugins.set(name, pluginData);
      return { success: true, plugin: pluginData };
    } catch (err) {
      return { success: false, error: `Failed to load plugin ${name}: ${err.message}` };
    }
  }

  async loadAllPlugins() {
    const plugins = await this.discoverPlugins();
    const result = { loaded: [], failed: [], total: plugins.length };

    for (const plugin of plugins) {
      if (!plugin.enabled) continue;
      const res = await this.loadPlugin(plugin.name);
      if (res.success) {
        result.loaded.push(plugin.name);
      } else {
        result.failed.push({ name: plugin.name, error: res.error });
      }
    }
    return result;
  }

  async unloadPlugin(name) {
    if (!this.loadedPlugins.has(name)) {
      return { success: false, error: `Plugin not loaded: ${name}` };
    }

    const plugin = this.loadedPlugins.get(name);
    if (typeof plugin.instance.destroy === 'function') {
      try { await plugin.instance.destroy(); } catch (err) {}
    }

    this.loadedPlugins.delete(name);
    return { success: true };
  }

  getPlugin(name) {
    return this.loadedPlugins.get(name);
  }

  listLoadedPlugins() {
    return Array.from(this.loadedPlugins.values()).map(p => ({
      name: p.name,
      version: p.manifest.version,
      loadedAt: p.loadedAt,
    }));
  }

  #loadManifest(pluginPath) {
    const configPath = resolve(pluginPath, 'plugin.config.json');
    if (existsSync(configPath)) {
      try {
        return JSON.parse(readFileSync(configPath, 'utf8'));
      } catch (err) {
        return null;
      }
    }

    const pkgPath = resolve(pluginPath, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        return {
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          clausidian: pkg.clausidian || {},
          entry: pkg.clausidian?.entry || 'index.mjs',
          minVersion: pkg.clausidian?.minVersion,
          enabled: pkg.clausidian?.enabled !== false,
        };
      } catch (err) {
        return null;
      }
    }

    return null;
  }

  #validateManifest(manifest) {
    const errors = [];
    if (!manifest.name) errors.push('Missing required field: name');
    if (!manifest.version) errors.push('Missing required field: version');
    return { valid: errors.length === 0, errors };
  }

  #checkVersionCompatibility(manifest) {
    const clausidianVersion = '3.5.0';
    const minVersion = manifest.minVersion || '3.0.0';

    const compareVersions = (v1, v2) => {
      const parts1 = v1.split('.').map(Number);
      const parts2 = v2.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 !== p2) return p1 > p2 ? 1 : -1;
      }
      return 0;
    };

    if (compareVersions(clausidianVersion, minVersion) < 0) {
      return { compatible: false, reason: `Requires Clausidian >= ${minVersion}` };
    }

    return { compatible: true };
  }
}

export default PluginLoader;
