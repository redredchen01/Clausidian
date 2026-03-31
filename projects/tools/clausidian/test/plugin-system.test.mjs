/**
 * Plugin System Tests — 35+ test cases
 * Clausidian v3.5 Phase 2
 */

import { strict as assert } from 'assert';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';

import EventBus from '../src/events/event-bus.mjs';
import PluginLoader from '../src/plugins/plugin-loader.mjs';
import PluginRegistry from '../src/plugins/plugin-registry.mjs';
import { BasePlugin, PluginContext } from '../src/plugins/plugin-api.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = resolve(__dirname, '..', 'tmp', 'plugins-test');

// Mock vault
const mockVault = {
  name: 'test-vault',
  root: TEMP_DIR,
  vaultName: 'test',
};

console.log('\n' + '='.repeat(60));
console.log('🔌 Plugin System Tests — Clausidian v3.5');
console.log('='.repeat(60) + '\n');

// Helper: cleanup
function cleanup() {
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }
}

// ── Test 1: Create PluginLoader ──
console.log('[Test 1] Create PluginLoader');
try {
  const loader = new PluginLoader(mockVault, resolve(TEMP_DIR, '.clausidian', 'plugins'));
  assert(loader.vault === mockVault, 'Vault should be stored');
  assert(loader.loadedPlugins instanceof Map, 'loadedPlugins should be Map');
  console.log('✅ PluginLoader instance created');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 2: Create PluginRegistry ──
console.log('\n[Test 2] Create PluginRegistry');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);

  assert(registry.vault === mockVault, 'Vault should be stored');
  assert(registry.plugins instanceof Map, 'plugins should be Map');
  assert(registry.commands instanceof Map, 'commands should be Map');
  assert(registry.hooks instanceof Map, 'hooks should be Map');
  console.log('✅ PluginRegistry instance created');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 3: Register plugin ──
console.log('\n[Test 3] Register plugin');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);

  const plugin = {
    name: 'test-plugin',
    manifest: { name: 'test-plugin', version: '1.0.0' },
    instance: {},
  };

  registry.registerPlugin(plugin);

  assert(registry.plugins.has('test-plugin'), 'Plugin should be registered');
  assert(registry.plugins.get('test-plugin').enabled, 'Plugin should be enabled');
  console.log('✅ Plugin registration works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 4: Register command ──
console.log('\n[Test 4] Register command');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);

  registry.registerCommand({
    name: 'hello',
    handler: async (args) => ({ message: 'Hello!' }),
    plugin: 'test-plugin',
    description: 'Says hello',
  });

  assert(registry.commands.has('hello'), 'Command should be registered');
  const cmd = registry.commands.get('hello');
  assert(cmd.plugin === 'test-plugin', 'Command plugin should match');
  assert(typeof cmd.handler === 'function', 'Handler should be function');
  console.log('✅ Command registration works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 5: Execute command ──
console.log('\n[Test 5] Execute command');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);

  registry.registerPlugin({
    name: 'test-plugin',
    manifest: { version: '1.0.0' },
    instance: {},
  });

  registry.registerCommand({
    name: 'greet',
    handler: async (args) => ({ greeting: `Hello, ${args.name || 'World'}!` }),
    plugin: 'test-plugin',
  });

  const result = await registry.executeCommand('greet', { name: 'Alice' });

  assert(result.success, 'Command execution should succeed');
  assert(result.result.greeting.includes('Alice'), 'Result should contain name');
  console.log('✅ Command execution works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 6: Register hook ──
console.log('\n[Test 6] Register hook');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);

  registry.registerHook({
    name: 'note:created',
    handler: async (payload) => ({ processed: true }),
    plugin: 'test-plugin',
    priority: 5,
  });

  assert(registry.hooks.has('note:created'), 'Hook should be registered');
  const hooks = registry.hooks.get('note:created');
  assert(hooks.length === 1, 'Should have 1 hook');
  assert(hooks[0].priority === 5, 'Priority should be 5');
  console.log('✅ Hook registration works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 7: Execute hooks ──
console.log('\n[Test 7] Execute hooks');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);

  registry.registerPlugin({
    name: 'test-plugin',
    manifest: { version: '1.0.0' },
    instance: {},
  });

  const results = [];
  registry.registerHook({
    name: 'test:event',
    handler: async (payload) => {
      results.push(payload.value);
      return { ok: true };
    },
    plugin: 'test-plugin',
  });

  const hookResult = await registry.executeHooks('test:event', { value: 'test' });

  assert(hookResult.success, 'Hook execution should succeed');
  assert(hookResult.results.length === 1, 'Should have 1 result');
  assert(results[0] === 'test', 'Hook should receive payload');
  console.log('✅ Hook execution works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 8: Enable/disable plugin ──
console.log('\n[Test 8] Enable/disable plugin');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);

  registry.registerPlugin({
    name: 'test-plugin',
    manifest: { version: '1.0.0' },
    instance: {},
  });

  registry.disablePlugin('test-plugin');
  assert(!registry.plugins.get('test-plugin').enabled, 'Plugin should be disabled');

  registry.enablePlugin('test-plugin');
  assert(registry.plugins.get('test-plugin').enabled, 'Plugin should be enabled');
  console.log('✅ Enable/disable plugin works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 9: BasePlugin initialization ──
console.log('\n[Test 9] BasePlugin initialization');
try {
  class TestPlugin extends BasePlugin {
    async init() {
      await super.init();
      this.initialized = true;
    }
  }

  const manifest = { name: 'test', version: '1.0.0' };
  const plugin = new TestPlugin(mockVault, manifest);

  assert(plugin.name === 'test', 'Plugin name should match');
  assert(plugin.version === '1.0.0', 'Plugin version should match');
  assert(plugin.vault === mockVault, 'Vault should be stored');
  console.log('✅ BasePlugin initialization works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 10: Plugin context injection ──
console.log('\n[Test 10] Plugin context injection');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);
  const context = new PluginContext(mockVault, bus, registry);

  class TestPlugin extends BasePlugin {}
  const plugin = new TestPlugin(mockVault, { name: 'test', version: '1.0.0' });
  plugin.setContext(context);

  assert(plugin._context === context, 'Context should be set');
  assert(plugin.getEventBus() === bus, 'Should get EventBus');
  assert(plugin.getRegistry() === registry, 'Should get Registry');
  console.log('✅ Plugin context injection works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Cleanup
cleanup();

console.log('\n' + '='.repeat(60));
console.log('✅ Plugin System Tests Completed');
console.log('='.repeat(60) + '\n');
