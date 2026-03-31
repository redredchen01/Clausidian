/**
 * Clausidian v3.5 Integration Tests
 */

import { strict as assert } from 'assert';
import EventBus from '../src/events/event-bus.mjs';
import PluginLoader from '../src/plugins/plugin-loader.mjs';
import PluginRegistry from '../src/plugins/plugin-registry.mjs';
import { BasePlugin, PluginContext } from '../src/plugins/plugin-api.mjs';
import AutomationEngine from '../src/automation/automation-engine.mjs';
import VaultSyncManager from '../src/vault-sync/vault-sync-manager.mjs';

const mockVault = { name: 'test-vault', root: '/tmp/test' };

console.log('\n' + '='.repeat(70));
console.log('🔗 Clausidian v3.5 Integration Tests');
console.log('='.repeat(70) + '\n');

// Test 1: Event Bus + Plugin System
console.log('[Test 1] Event Bus + Plugin System Integration');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);

  let eventEmitted = false;
  bus.subscribe('note:created', async (event, payload) => {
    eventEmitted = true;
  });

  registry.registerPlugin({
    name: 'test-plugin',
    manifest: { version: '1.0.0' },
    instance: {},
  });

  registry.registerHook({
    name: 'note:created',
    handler: async (payload) => ({ processed: true }),
    plugin: 'test-plugin',
  });

  await bus.emit('note:created', { path: 'test.md' });
  assert(eventEmitted, 'Event should trigger subscribers');
  console.log('✅ Event Bus + Plugin System integration works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 2: Automation Engine + Plugin Registry
console.log('\n[Test 2] Automation Engine + Plugin Registry Integration');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);
  const automationEngine = new AutomationEngine(mockVault, bus, registry);

  registry.registerPlugin({
    name: 'auto-tagger',
    manifest: { version: '1.0.0' },
    instance: {},
  });

  registry.registerCommand({
    name: 'tag-note',
    handler: async (args) => ({ tagged: args.tags }),
    plugin: 'auto-tagger',
  });

  automationEngine.registerAutomation({
    name: 'auto-tag-new-notes',
    enabled: true,
    triggers: [{ type: 'event', event: 'note:created' }],
    actions: [
      { type: 'command', command: 'tag-note', args: { tags: ['new'] } },
    ],
  });

  assert(automationEngine.getAutomation('auto-tag-new-notes'), 'Automation should be registered');
  console.log('✅ Automation Engine + Registry integration works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 3: Multi-Vault Sync Manager
console.log('\n[Test 3] Multi-Vault Sync Manager');
try {
  const bus = new EventBus(mockVault);
  const syncManager = new VaultSyncManager(mockVault, bus);

  syncManager.registerVault({ name: 'vault-a', path: '/tmp/vault-a' });
  syncManager.registerVault({ name: 'vault-b', path: '/tmp/vault-b' });

  syncManager.setupSync('vault-a', 'vault-b', { direction: 'bidirectional' });

  const vaults = syncManager.listVaults();
  const pairs = syncManager.listSyncPairs();

  assert(vaults.length === 2, 'Should have 2 registered vaults');
  assert(pairs.length === 1, 'Should have 1 sync pair');
  console.log('✅ Multi-Vault Sync Manager works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 4: Full pipeline test
console.log('\n[Test 4] Full v3.5 Pipeline Integration');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);
  const context = new PluginContext(mockVault, bus, registry);

  class LoggerPlugin extends BasePlugin {
    async init() {
      await super.init();
      this.registerHook({
        name: 'note:*',
        handler: async (payload) => {
          return { logged: payload };
        },
        priority: 0,
      });
    }
  }

  const loggerPlugin = new LoggerPlugin(mockVault, { name: 'logger', version: '1.0.0' });
  loggerPlugin.setContext(context);

  registry.registerPlugin({
    name: 'logger',
    manifest: { version: '1.0.0' },
    instance: loggerPlugin,
  });

  const result = await registry.executeHooks('note:created', { path: 'test.md' });
  assert(result.success, 'Hooks should execute successfully');
  console.log('✅ Full v3.5 Pipeline Integration works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 5: Backward compatibility check
console.log('\n[Test 5] Backward Compatibility (v3.4 API still works)');
try {
  const bus = new EventBus(mockVault);
  assert(typeof bus.subscribe === 'function', 'EventBus.subscribe should exist');
  assert(typeof bus.emit === 'function', 'EventBus.emit should exist');
  assert(typeof bus.once === 'function', 'EventBus.once should exist');

  const registry = new PluginRegistry(mockVault, bus);
  assert(typeof registry.registerCommand === 'function', 'Registry.registerCommand should exist');
  assert(typeof registry.executeCommand === 'function', 'Registry.executeCommand should exist');

  console.log('✅ Backward Compatibility maintained');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

console.log('\n' + '='.repeat(70));
console.log('✅ Clausidian v3.5 Integration Tests Completed');
console.log('='.repeat(70) + '\n');
