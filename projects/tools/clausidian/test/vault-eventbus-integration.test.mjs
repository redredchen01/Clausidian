/**
 * EventBus Integration Tests — Clausidian v3.5 Phase 1
 * Tests EventBus + EventHistory integration with Vault
 */

import { strict as assert } from 'assert';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { Vault } from '../src/vault.mjs';

console.log('\n' + '='.repeat(60));
console.log('🔄 Vault EventBus Integration Tests — Clausidian v3.5');
console.log('='.repeat(60) + '\n');

// Test 1: Vault initializes EventBus and EventHistory
console.log('[Test 1] Vault initializes EventBus and EventHistory');
try {
  const tmpDir = mkdtempSync(join('/tmp', 'clausidian-test-'));
  const vault = new Vault(tmpDir, { vaultName: 'test-vault' });

  assert(vault.eventBus, 'EventBus should be initialized');
  assert(vault.eventHistory, 'EventHistory should be initialized');
  assert(vault.vaultName === 'test-vault', 'Vault name should be set');

  rmSync(tmpDir, { recursive: true });
  console.log('✅ EventBus and EventHistory initialized');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 2: EventBus emits note:created when note is written
console.log('\n[Test 2] EventBus emits note:created when note is written');
try {
  const tmpDir = mkdtempSync(join('/tmp', 'clausidian-test-'));
  const vault = new Vault(tmpDir, { vaultName: 'test-vault' });
  let eventEmitted = false;
  let eventPayload = null;

  vault.eventBus.subscribe('note:created', (event, payload) => {
    eventEmitted = true;
    eventPayload = payload;
  });

  // Create areas directory and write a note
  vault.write('areas', 'test-area.md', '---\ntitle: Test Area\n---\nContent');

  // Give it a moment for async event handling
  await new Promise(resolve => setTimeout(resolve, 10));

  assert(eventEmitted, 'note:created event should be emitted');
  assert(eventPayload.note === 'test-area', 'Event payload should contain note name');
  assert(eventPayload.dir === 'areas', 'Event payload should contain directory');

  rmSync(tmpDir, { recursive: true });
  console.log('✅ note:created event emitted correctly');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 3: EventBus emits note:updated when existing note is written
console.log('\n[Test 3] EventBus emits note:updated when existing note is written');
try {
  const tmpDir = mkdtempSync(join('/tmp', 'clausidian-test-'));
  const vault = new Vault(tmpDir, { vaultName: 'test-vault' });
  let createEventCount = 0;
  let updateEventCount = 0;

  vault.eventBus.subscribe('note:created', () => { createEventCount++; });
  vault.eventBus.subscribe('note:updated', () => { updateEventCount++; });

  // Write initial note
  vault.write('areas', 'test.md', '---\ntitle: Test\n---\nv1');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert(createEventCount === 1, 'Should emit 1 create event');

  // Update the note
  vault.write('areas', 'test.md', '---\ntitle: Test\n---\nv2');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert(updateEventCount === 1, 'Should emit 1 update event');

  rmSync(tmpDir, { recursive: true });
  console.log('✅ note:updated event emitted for existing note');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 4: EventHistory persists events to disk
console.log('\n[Test 4] EventHistory persists events to disk');
try {
  const tmpDir = mkdtempSync(join('/tmp', 'clausidian-test-'));
  const vault = new Vault(tmpDir, { vaultName: 'test-vault' });

  // Write some notes
  vault.write('areas', 'area1.md', '---\ntitle: Area 1\n---\nContent');
  vault.write('projects', 'proj1.md', '---\ntitle: Project 1\n---\nContent');

  // Check history was recorded
  const history = vault.eventHistory.getRecent(10);
  assert(history.length >= 2, 'History should have at least 2 events');

  // Check that events are in history
  const noteCreatedEvents = history.filter(e => e.event === 'note:created');
  assert(noteCreatedEvents.length >= 2, 'Should have at least 2 note:created events');

  rmSync(tmpDir, { recursive: true });
  console.log('✅ EventHistory persists events correctly');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 5: EventHistory query by event type
console.log('\n[Test 5] EventHistory query by event type');
try {
  const tmpDir = mkdtempSync(join('/tmp', 'clausidian-test-'));
  const vault = new Vault(tmpDir, { vaultName: 'test-vault' });

  // Emit multiple events
  vault.eventBus.emit('note:created', { note: 'test1' });
  vault.eventHistory.append('note:created', { note: 'test1' });

  vault.eventBus.emit('note:updated', { note: 'test2' });
  vault.eventHistory.append('note:updated', { note: 'test2' });

  vault.eventBus.emit('note:created', { note: 'test3' });
  vault.eventHistory.append('note:created', { note: 'test3' });

  // Query by event type
  const created = vault.eventHistory.queryByEvent('note:created');
  const updated = vault.eventHistory.queryByEvent('note:updated');

  assert(created.length >= 2, 'Should find 2 note:created events');
  assert(updated.length >= 1, 'Should find 1 note:updated event');

  rmSync(tmpDir, { recursive: true });
  console.log('✅ EventHistory query by event type works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 6: EventBus wildcard subscription integration
console.log('\n[Test 6] EventBus wildcard subscription with Vault integration');
try {
  const tmpDir = mkdtempSync(join('/tmp', 'clausidian-test-'));
  const vault = new Vault(tmpDir, { vaultName: 'test-vault' });
  const noteEvents = [];

  vault.eventBus.subscribe('note:*', (event, payload) => {
    noteEvents.push(event);
  });

  vault.write('areas', 'test.md', '---\ntitle: Test\n---\nContent');
  await new Promise(resolve => setTimeout(resolve, 10));

  vault.write('areas', 'test.md', '---\ntitle: Test Updated\n---\nContent Updated');
  await new Promise(resolve => setTimeout(resolve, 10));

  assert(noteEvents.includes('note:created'), 'Should capture note:created');
  assert(noteEvents.includes('note:updated'), 'Should capture note:updated');

  rmSync(tmpDir, { recursive: true });
  console.log('✅ Wildcard pattern matching works with Vault');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 7: EventBus priority-based execution
console.log('\n[Test 7] EventBus priority-based handler execution');
try {
  const tmpDir = mkdtempSync(join('/tmp', 'clausidian-test-'));
  const vault = new Vault(tmpDir, { vaultName: 'test-vault' });
  const executionOrder = [];

  vault.eventBus.subscribe('note:created', () => {
    executionOrder.push('low');
  }, { priority: 0 });

  vault.eventBus.subscribe('note:created', () => {
    executionOrder.push('high');
  }, { priority: 10 });

  vault.write('areas', 'test.md', '---\ntitle: Test\n---\nContent');
  await new Promise(resolve => setTimeout(resolve, 10));

  assert(executionOrder[0] === 'high', 'High priority should execute first');
  assert(executionOrder[1] === 'low', 'Low priority should execute second');

  rmSync(tmpDir, { recursive: true });
  console.log('✅ Priority-based handler execution works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 8: EventHistory maximum entries enforcement
console.log('\n[Test 8] EventHistory enforces max entries (1000)');
try {
  const tmpDir = mkdtempSync(join('/tmp', 'clausidian-test-'));
  const vault = new Vault(tmpDir, { vaultName: 'test-vault' });

  // Add 1100 events
  for (let i = 0; i < 1100; i++) {
    vault.eventHistory.append('test:event', { index: i });
  }

  const history = vault.eventHistory.cache;
  assert(history.length === 1000, 'History should be limited to 1000 entries');
  assert(history[0].payload.index >= 100, 'Oldest entry should be from index 100+');

  rmSync(tmpDir, { recursive: true });
  console.log('✅ EventHistory max entries enforcement works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 9: EventBus get statistics
console.log('\n[Test 9] EventBus and EventHistory statistics');
try {
  const tmpDir = mkdtempSync(join('/tmp', 'clausidian-test-'));
  const vault = new Vault(tmpDir, { vaultName: 'test-vault' });

  vault.eventBus.emit('note:created', { note: 'test1' });
  vault.eventHistory.append('note:created', { note: 'test1' });

  vault.eventBus.emit('note:created', { note: 'test2' });
  vault.eventHistory.append('note:created', { note: 'test2' });

  vault.eventBus.emit('note:updated', { note: 'test3' });
  vault.eventHistory.append('note:updated', { note: 'test3' });

  const stats = vault.eventHistory.getStats();
  assert(stats.totalEvents >= 3, 'Total events should be >= 3');
  assert(stats.byEvent['note:created'] >= 2, 'Should have >= 2 note:created events');
  assert(stats.byEvent['note:updated'] >= 1, 'Should have >= 1 note:updated event');

  rmSync(tmpDir, { recursive: true });
  console.log('✅ EventBus and EventHistory statistics work');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Test 10: Multiple vaults maintain separate event histories
console.log('\n[Test 10] Multiple vaults maintain separate event histories');
try {
  const tmpDir1 = mkdtempSync(join('/tmp', 'clausidian-test-'));
  const tmpDir2 = mkdtempSync(join('/tmp', 'clausidian-test-'));

  const vault1 = new Vault(tmpDir1, { vaultName: 'vault-1' });
  const vault2 = new Vault(tmpDir2, { vaultName: 'vault-2' });

  // Each vault writes to its own directory, which triggers events
  vault1.write('areas', 'test1.md', '---\ntitle: Test 1\n---\nV1 Content');
  vault2.write('areas', 'test2.md', '---\ntitle: Test 2\n---\nV2 Content');

  // Check that each vault has events in its own history
  const vault1AllEvents = vault1.eventHistory.cache;
  const vault2AllEvents = vault2.eventHistory.cache;

  assert(vault1AllEvents.length > 0, 'Vault 1 should have events');
  assert(vault2AllEvents.length > 0, 'Vault 2 should have events');
  assert(vault1AllEvents.every(e => e.vault === 'vault-1'), 'All vault 1 events should be marked as vault-1');
  assert(vault2AllEvents.every(e => e.vault === 'vault-2'), 'All vault 2 events should be marked as vault-2');

  // Verify separate storage (different files)
  assert(vault1.eventHistory.historyFile.includes('vault-1'), 'Vault 1 should have vault-1 history file');
  assert(vault2.eventHistory.historyFile.includes('vault-2'), 'Vault 2 should have vault-2 history file');
  assert(vault1.eventHistory.historyFile !== vault2.eventHistory.historyFile, 'History files should be different');

  rmSync(tmpDir1, { recursive: true });
  rmSync(tmpDir2, { recursive: true });
  console.log('✅ Multiple vaults maintain separate event histories');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('✅ Vault EventBus Integration Tests Complete');
console.log('='.repeat(60) + '\n');
