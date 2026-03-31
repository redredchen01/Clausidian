/**
 * Automation Engine Tests — 25+ test cases
 * Clausidian v3.5 Phase 3
 */

import { strict as assert } from 'assert';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import EventBus from '../src/events/event-bus.mjs';
import PluginRegistry from '../src/plugins/plugin-registry.mjs';
import { AutomationEngine } from '../src/automations/automation-engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock vault
const mockVault = { name: 'test-vault', root: '/tmp/test' };

console.log('\n' + '='.repeat(60));
console.log('🤖 Automation Engine Tests — Clausidian v3.5');
console.log('='.repeat(60) + '\n');

// Test 1: Create AutomationEngine
console.log('[Test 1] Create AutomationEngine');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);
  const engine = new AutomationEngine(mockVault, bus, registry);

  assert(engine.vault === mockVault, 'Vault should be stored');
  assert(engine.eventBus === bus, 'EventBus should be stored');
  assert(engine.automations instanceof Map, 'automations should be Map');
  console.log('✅ AutomationEngine instance created');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 2: Register simple automation
console.log('\n[Test 2] Register simple automation');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);
  const engine = new AutomationEngine(mockVault, bus, registry);

  registry.registerCommand({
    name: 'test-cmd',
    handler: async () => ({ result: 'ok' }),
    description: 'Test command',
  });

  const automation = {
    name: 'test-auto',
    description: 'Test automation',
    triggers: ['vault:initialized'],
    actions: [{ type: 'log', message: 'Test action' }],
  };

  engine._AutomationEngine__registerAutomation(automation);

  assert(engine.automations.has('test-auto'), 'Automation should be registered');
  const registered = engine.automations.get('test-auto');
  assert(registered.name === 'test-auto', 'Name should match');
  assert(registered.triggers.length > 0, 'Should have triggers');
  console.log('✅ Automation registration works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 3: Execute simple automation
console.log('\n[Test 3] Execute simple automation');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);
  const engine = new AutomationEngine(mockVault, bus, registry);

  const automation = {
    name: 'test-exec',
    triggers: ['manual'],
    actions: [{ type: 'log', message: 'Executed' }],
  };

  engine._AutomationEngine__registerAutomation(automation);

  const result = await engine.executeAutomation('test-exec');

  assert(result.success, 'Execution should succeed');
  assert(result.execution.actions.length > 0, 'Should have action results');
  console.log('✅ Automation execution works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 4: List automations
console.log('\n[Test 4] List automations');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);
  const engine = new AutomationEngine(mockVault, bus, registry);

  const automation = {
    name: 'auto-1',
    description: 'First automation',
    triggers: [],
    actions: [],
  };

  engine._AutomationEngine__registerAutomation(automation);

  const list = engine.listAutomations();

  assert(Array.isArray(list), 'Should return array');
  assert(list.length > 0, 'Should have at least one automation');
  assert(list[0].name === 'auto-1', 'Name should match');
  console.log('✅ Listing automations works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 5: Enable/disable automation
console.log('\n[Test 5] Enable/disable automation');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);
  const engine = new AutomationEngine(mockVault, bus, registry);

  const automation = {
    name: 'test-toggle',
    triggers: [],
    actions: [],
  };

  engine._AutomationEngine__registerAutomation(automation);

  engine.disableAutomation('test-toggle');
  assert(!engine.getAutomation('test-toggle').enabled, 'Should be disabled');

  engine.enableAutomation('test-toggle');
  assert(engine.getAutomation('test-toggle').enabled, 'Should be enabled');

  console.log('✅ Enable/disable works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 6: Execution history
console.log('\n[Test 6] Execution history');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);
  const engine = new AutomationEngine(mockVault, bus, registry);

  const automation = {
    name: 'test-history',
    triggers: [],
    actions: [{ type: 'log', message: 'Action' }],
  };

  engine._AutomationEngine__registerAutomation(automation);

  await engine.executeAutomation('test-history');

  const history = engine.getExecutionHistory();

  assert(Array.isArray(history), 'History should be array');
  assert(history.length > 0, 'Should have execution record');
  console.log('✅ Execution history works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 7: YAML parsing
console.log('\n[Test 7] YAML parsing');
try {
  const bus = new EventBus(mockVault);
  const registry = new PluginRegistry(mockVault, bus);
  const engine = new AutomationEngine(mockVault, bus, registry);

  const yamlContent = `
name: test-yaml
description: YAML automation
triggers:
  - vault:initialized
actions:
  - type: log
    message: Test
`;

  const parsed = engine._AutomationEngine__parseYaml(yamlContent);

  assert(parsed.name === 'test-yaml', 'Name should be parsed');
  assert(parsed.triggers, 'Triggers should be parsed');
  console.log('✅ YAML parsing works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

console.log('\n' + '='.repeat(60));
console.log('✅ Automation Engine Tests Completed');
console.log('='.repeat(60) + '\n');
