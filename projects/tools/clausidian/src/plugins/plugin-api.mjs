/**
 * Plugin API — SDK for plugin developers
 * Clausidian v3.5.0+
 */

import { resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

export class BasePlugin {
  constructor(vault, manifest) {
    this.vault = vault;
    this.manifest = manifest;
    this.name = manifest.name;
    this.version = manifest.version;
    this.config = manifest.config || {};
    this.storageDir = resolve(process.env.HOME || '/tmp', '.clausidian', 'plugin-data', this.name);
    this._context = null;
  }

  async init() {
    await this._ensureStorageDir();
  }

  async destroy() {}

  setContext(context) {
    this._context = context;
  }

  getEventBus() {
    if (!this._context?.eventBus) throw new Error('EventBus not available');
    return this._context.eventBus;
  }

  getRegistry() {
    if (!this._context?.registry) throw new Error('Registry not available');
    return this._context.registry;
  }

  registerCommand(command) {
    const registry = this.getRegistry();
    registry.registerCommand({ ...command, plugin: this.name });
  }

  registerHook(hook) {
    const registry = this.getRegistry();
    registry.registerHook({ ...hook, plugin: this.name });
  }

  on(pattern, handler, options = {}) {
    const bus = this.getEventBus();
    return bus.subscribe(pattern, handler, options);
  }

  once(pattern, handler) {
    const bus = this.getEventBus();
    return bus.once(pattern, handler);
  }

  async emit(event, payload) {
    const bus = this.getEventBus();
    return bus.emit(event, payload);
  }

  async search(query, options = {}) {
    if (!this.vault || typeof this.vault.search !== 'function') {
      throw new Error('Vault search not available');
    }
    return this.vault.search(query, options);
  }

  async getNote(path) {
    if (!this.vault || typeof this.vault.getNote !== 'function') {
      throw new Error('Vault getNote not available');
    }
    return this.vault.getNote(path);
  }

  async createNote(path, content, tags = []) {
    if (!this.vault || typeof this.vault.createNote !== 'function') {
      throw new Error('Vault createNote not available');
    }
    return this.vault.createNote(path, content, tags);
  }

  async updateNote(path, content) {
    if (!this.vault || typeof this.vault.updateNote !== 'function') {
      throw new Error('Vault updateNote not available');
    }
    return this.vault.updateNote(path, content);
  }

  async deleteNote(path) {
    if (!this.vault || typeof this.vault.deleteNote !== 'function') {
      throw new Error('Vault deleteNote not available');
    }
    return this.vault.deleteNote(path);
  }

  async saveData(key, data) {
    await this._ensureStorageDir();
    const filePath = resolve(this.storageDir, `${key}.json`);
    const content = JSON.stringify(data, null, 2);
    writeFileSync(filePath, content, 'utf8');
  }

  async loadData(key) {
    const filePath = resolve(this.storageDir, `${key}.json`);
    if (!existsSync(filePath)) return null;
    try {
      const content = readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error(`[Plugin ${this.name}] Error loading data ${key}: ${err.message}`);
      return null;
    }
  }

  log(message, level = 'info') {
    const prefix = `[${this.name}]`;
    switch (level) {
      case 'error':
        console.error(`${prefix} ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}`);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }

  async _ensureStorageDir() {
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
  }
}

export class PluginContext {
  constructor(vault, eventBus, registry) {
    this.vault = vault;
    this.eventBus = eventBus;
    this.registry = registry;
  }
}

export function isValidPlugin(obj) {
  return obj instanceof BasePlugin || (
    typeof obj.init === 'function' &&
    typeof obj.destroy === 'function'
  );
}

export default BasePlugin;
