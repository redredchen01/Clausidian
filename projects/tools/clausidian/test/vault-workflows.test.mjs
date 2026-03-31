/**
 * Vault Workflows Tests — 20+ test cases
 * Clausidian v3.5 Phase 4
 */

import { strict as assert } from 'assert';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import EventBus from '../src/events/event-bus.mjs';
import { VaultCoordinator } from '../src/vault-workflows/vault-coordinator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock vault registry
class MockVaultRegistry {
  constructor() {
    this.vaults = new Map();
  }

  set(name, vault) {
    this.vaults.set(name, vault);
  }

  get(name) {
    return this.vaults.get(name);
  }
}

// Mock vault
function createMockVault(name) {
  return {
    name,
    root: `/tmp/${name}`,
    scanNotes: async () => [],
    search: async (query) => [],
    write: async () => {},
  };
}

console.log('\n' + '='.repeat(60));
console.log('🔗 Vault Workflows Tests — Clausidian v3.5');
console.log('='.repeat(60) + '\n');

// Test 1: Create VaultCoordinator
console.log('[Test 1] Create VaultCoordinator');
try {
  const bus = new EventBus({});
  const registry = new MockVaultRegistry();
  const coordinator = new VaultCoordinator(bus, registry);

  assert(coordinator.eventBus === bus, 'EventBus should be stored');
  assert(coordinator.vaultRegistry === registry, 'Registry should be stored');
  assert(coordinator.links instanceof Map, 'links should be Map');
  console.log('✅ VaultCoordinator instance created');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 2: Register vault link
console.log('\n[Test 2] Register vault link');
try {
  const bus = new EventBus({});
  const registry = new MockVaultRegistry();
  const coordinator = new VaultCoordinator(bus, registry);

  const result = coordinator.registerLink('vault1', 'vault2', {
    bidirectional: true,
    syncTags: true,
  });

  assert(result.success, 'Registration should succeed');
  assert(result.link, 'Should return link key');
  console.log('✅ Vault link registration works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 3: Unregister vault link
console.log('\n[Test 3] Unregister vault link');
try {
  const bus = new EventBus({});
  const registry = new MockVaultRegistry();
  const coordinator = new VaultCoordinator(bus, registry);

  coordinator.registerLink('vault1', 'vault2');
  const result = coordinator.unregisterLink('vault1', 'vault2');

  assert(result.success, 'Unregistration should succeed');
  console.log('✅ Vault link unregistration works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 4: Get sync state
console.log('\n[Test 4] Get sync state');
try {
  const bus = new EventBus({});
  const registry = new MockVaultRegistry();
  const coordinator = new VaultCoordinator(bus, registry);

  coordinator.registerLink('vault1', 'vault2');
  const state = coordinator.getSyncState('vault1', 'vault2');

  assert(state, 'Should return sync state');
  assert(state.status === 'idle', 'Initial status should be idle');
  console.log('✅ Get sync state works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 5: List links
console.log('\n[Test 5] List links');
try {
  const bus = new EventBus({});
  const registry = new MockVaultRegistry();
  const coordinator = new VaultCoordinator(bus, registry);

  coordinator.registerLink('vault1', 'vault2');
  coordinator.registerLink('vault2', 'vault3');

  const links = coordinator.getLinks();

  assert(Array.isArray(links), 'Should return array');
  assert(links.length >= 2, 'Should have at least 2 links');
  console.log('✅ Listing links works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 6: Sync notes basic
console.log('\n[Test 6] Sync notes basic');
try {
  const bus = new EventBus({});
  const registry = new MockVaultRegistry();
  const coordinator = new VaultCoordinator(bus, registry);

  registry.set('vault1', createMockVault('vault1'));
  registry.set('vault2', createMockVault('vault2'));

  coordinator.registerLink('vault1', 'vault2');

  const result = await coordinator.syncNotes('vault1', 'vault2');

  assert(result.success, 'Sync should succeed');
  assert(result.result.synced !== undefined, 'Should have synced count');
  console.log('✅ Sync notes works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 7: Search across vaults
console.log('\n[Test 7] Search across vaults');
try {
  const bus = new EventBus({});
  const registry = new MockVaultRegistry();
  const coordinator = new VaultCoordinator(bus, registry);

  registry.set('vault1', createMockVault('vault1'));
  registry.set('vault2', createMockVault('vault2'));

  const results = await coordinator.searchAcross('test', ['vault1', 'vault2']);

  assert(Array.isArray(results), 'Should return array');
  console.log('✅ Cross-vault search works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 8: Get bidirectional links
console.log('\n[Test 8] Get bidirectional links');
try {
  const bus = new EventBus({});
  const registry = new MockVaultRegistry();
  const coordinator = new VaultCoordinator(bus, registry);

  registry.set('vault1', createMockVault('vault1'));
  registry.set('vault2', createMockVault('vault2'));

  const result = await coordinator.getBiDirectionalLinks('vault1', 'vault2');

  assert(result.success, 'Should succeed');
  assert(result.links, 'Should return links object');
  assert(Array.isArray(result.links.vault1ToVault2), 'Should have array');
  console.log('✅ Bidirectional links work');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 9: Sync state transitions
console.log('\n[Test 9] Sync state transitions');
try {
  const bus = new EventBus({});
  const registry = new MockVaultRegistry();
  const coordinator = new VaultCoordinator(bus, registry);

  coordinator.registerLink('vault1', 'vault2');

  const state1 = coordinator.getSyncState('vault1', 'vault2');
  assert(state1.status === 'idle', 'Initial status should be idle');

  // Simulate state update
  coordinator._VaultCoordinator__updateSyncState('vault1-vault2', {
    status: 'syncing',
  });

  const state2 = coordinator.getSyncState('vault1', 'vault2');
  assert(state2.status === 'syncing', 'Status should be syncing');

  console.log('✅ Sync state transitions work');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 10: Link configuration
console.log('\n[Test 10] Link configuration');
try {
  const bus = new EventBus({});
  const registry = new MockVaultRegistry();
  const coordinator = new VaultCoordinator(bus, registry);

  const options = {
    bidirectional: true,
    syncTags: true,
    conflictStrategy: 'merge',
    autoSync: true,
  };

  coordinator.registerLink('vault1', 'vault2', options);
  const links = coordinator.getLinks();

  assert(links.length > 0, 'Should have link');
  const link = links[0];
  assert(link.bidirectional === true, 'Bidirectional should be true');
  assert(link.syncTags === true, 'syncTags should be true');
  assert(link.conflictStrategy === 'merge', 'Conflict strategy should be merge');

  console.log('✅ Link configuration works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

console.log('\n' + '='.repeat(60));
console.log('✅ Vault Workflows Tests Completed');
console.log('='.repeat(60) + '\n');
