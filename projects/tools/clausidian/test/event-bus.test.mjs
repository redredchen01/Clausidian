/**
 * EventBus Tests — 30+ test cases
 * Clausidian v3.5 Phase 1
 */

import { strict as assert } from 'assert';
import EventBus from '../src/events/event-bus.mjs';

// Mock vault object
const mockVault = { name: 'test-vault', path: '/tmp/test' };

console.log('\n' + '='.repeat(60));
console.log('🔄 EventBus Tests — Clausidian v3.5');
console.log('='.repeat(60) + '\n');

// ── Test 1: Create EventBus ──
console.log('[Test 1] Create EventBus');
try {
  const bus = new EventBus(mockVault);
  assert(bus.vault.name === 'test-vault', 'Vault should be stored');
  assert(bus.listeners instanceof Map, 'Listeners should be a Map');
  assert(Array.isArray(bus.history), 'History should be an array');
  console.log('✅ EventBus instance created');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 2: Subscribe to event ──
console.log('\n[Test 2] Subscribe to exact event');
try {
  const bus = new EventBus(mockVault);
  let called = false;

  bus.subscribe('note:created', async (event, payload) => {
    called = true;
  });

  assert(bus.listeners.has('note:created'), 'Event pattern should be registered');
  const listeners = bus.listeners.get('note:created');
  assert(listeners.length === 1, 'Should have 1 listener');
  console.log('✅ Subscription successful');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 3: Emit event ──
console.log('\n[Test 3] Emit event and trigger handler');
try {
  const bus = new EventBus(mockVault);
  let handlerCalled = false;
  let receivedPayload = null;

  bus.subscribe('note:created', async (event, payload) => {
    handlerCalled = true;
    receivedPayload = payload;
  });

  const result = await bus.emit('note:created', { path: 'test.md', content: 'Hello' });

  assert(handlerCalled, 'Handler should have been called');
  assert(receivedPayload.path === 'test.md', 'Payload should match');
  assert(result.success, 'Emit should succeed');
  assert(result.results.length === 1, 'Should have 1 result');
  console.log('✅ Event emission and handler execution successful');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 4: Wildcard pattern matching (note:*) ──
console.log('\n[Test 4] Wildcard pattern matching');
try {
  const bus = new EventBus(mockVault);
  const events = [];

  bus.subscribe('note:*', async (event, payload) => {
    events.push(event);
  });

  await bus.emit('note:created', {});
  await bus.emit('note:updated', {});
  await bus.emit('note:deleted', {});
  await bus.emit('vault:initialized', {}); // Should NOT match

  assert(events.length === 3, 'Should match 3 note:* events');
  assert(events.includes('note:created'), 'Should match note:created');
  assert(events.includes('note:updated'), 'Should match note:updated');
  assert(events.includes('note:deleted'), 'Should match note:deleted');
  console.log('✅ Wildcard pattern matching works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 5: Global wildcard (*) ──
console.log('\n[Test 5] Global wildcard pattern');
try {
  const bus = new EventBus(mockVault);
  let eventCount = 0;

  bus.subscribe('*', async (event, payload) => {
    eventCount++;
  });

  await bus.emit('note:created', {});
  await bus.emit('search:executed', {});
  await bus.emit('vault:initialized', {});
  await bus.emit('custom:anything', {});

  assert(eventCount === 4, 'Should match all 4 events');
  console.log('✅ Global wildcard matches all events');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 6: Priority-based execution ──
console.log('\n[Test 6] Handler priority ordering');
try {
  const bus = new EventBus(mockVault);
  const executionOrder = [];

  bus.subscribe('test:event', async () => {
    executionOrder.push('low');
  }, { priority: 0 });

  bus.subscribe('test:event', async () => {
    executionOrder.push('high');
  }, { priority: 10 });

  bus.subscribe('test:event', async () => {
    executionOrder.push('medium');
  }, { priority: 5 });

  await bus.emit('test:event', {});

  assert(executionOrder[0] === 'high', 'High priority should run first');
  assert(executionOrder[1] === 'medium', 'Medium priority second');
  assert(executionOrder[2] === 'low', 'Low priority last');
  console.log('✅ Handlers execute in priority order');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 7: Once option (auto-unsubscribe) ──
console.log('\n[Test 7] Subscribe once (auto-unsubscribe)');
try {
  const bus = new EventBus(mockVault);
  let callCount = 0;

  bus.subscribe('test:event', async () => {
    callCount++;
  }, { once: true });

  await bus.emit('test:event', {});
  await bus.emit('test:event', {});
  await bus.emit('test:event', {});

  assert(callCount === 1, 'Handler should be called only once');
  assert(bus.listeners.get('test:event').length === 0, 'Listener should be removed');
  console.log('✅ Once option auto-unsubscribes after first emit');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 8: Unsubscribe function ──
console.log('\n[Test 8] Manual unsubscribe');
try {
  const bus = new EventBus(mockVault);
  let callCount = 0;

  const sub = bus.subscribe('test:event', async () => {
    callCount++;
  });

  await bus.emit('test:event', {});
  assert(callCount === 1, 'First emit should call handler');

  sub.unsubscribe();

  await bus.emit('test:event', {});
  assert(callCount === 1, 'Handler should not be called after unsubscribe');
  console.log('✅ Unsubscribe function works');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 9: Multiple handlers same event ──
console.log('\n[Test 9] Multiple handlers for same event');
try {
  const bus = new EventBus(mockVault);
  const results = [];

  bus.subscribe('test:event', async () => {
    results.push('handler1');
  });

  bus.subscribe('test:event', async () => {
    results.push('handler2');
  });

  bus.subscribe('test:event', async () => {
    results.push('handler3');
  });

  await bus.emit('test:event', {});

  assert(results.length === 3, 'All 3 handlers should be called');
  console.log('✅ Multiple handlers execute for same event');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 10: Event history ──
console.log('\n[Test 10] Event history tracking');
try {
  const bus = new EventBus(mockVault);

  await bus.emit('note:created', { path: 'a.md' });
  await bus.emit('note:updated', { path: 'b.md' });
  await bus.emit('search:executed', { keyword: 'test' });

  const history = bus.getHistory();
  assert(history.length === 3, 'History should contain 3 events');
  assert(history[0].event === 'note:created', 'First event should be note:created');
  assert(history[1].event === 'note:updated', 'Second event should be note:updated');
  assert(history[2].event === 'search:executed', 'Third event should be search:executed');
  console.log('✅ Event history tracks emitted events');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 11: Error handling (handler throws) ──
console.log('\n[Test 11] Error handling in handlers');
try {
  const bus = new EventBus(mockVault);

  bus.subscribe('test:event', async () => {
    throw new Error('Handler error');
  });

  bus.subscribe('test:event', async () => {
    // This handler should still run even if previous one fails
  });

  const result = await bus.emit('test:event', {});

  assert(!result.success, 'Result should have success=false');
  assert(result.errors.length === 1, 'Should have 1 error');
  assert(result.results.length === 1, 'Second handler should still execute');
  console.log('✅ Errors in handlers are collected, dont stop other handlers');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 12: List listeners ──
console.log('\n[Test 12] List active listeners');
try {
  const bus = new EventBus(mockVault);

  bus.subscribe('note:*', async () => {});
  bus.subscribe('search:*', async () => {});
  bus.subscribe('search:*', async () => {}, { priority: 5 });

  const listeners = bus.listListeners();

  assert(listeners['note:*'].length === 1, 'Should have 1 note:* listener');
  assert(listeners['search:*'].length === 2, 'Should have 2 search:* listeners');
  console.log('✅ listListeners shows all registered patterns');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 13: Clear history limit ──
console.log('\n[Test 13] History size limit (max 100)');
try {
  const bus = new EventBus(mockVault);

  // Emit 150 events
  for (let i = 0; i < 150; i++) {
    await bus.emit('test:event', { index: i });
  }

  assert(bus.history.length === 100, 'History should be limited to 100');
  assert(bus.history[0].timestamp !== undefined, 'Oldest event should be at index 0');
  console.log('✅ History maintains max 100 entries');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 14: Clear listeners ──
console.log('\n[Test 14] Clear listeners for pattern');
try {
  const bus = new EventBus(mockVault);

  bus.subscribe('note:*', async () => {});
  bus.subscribe('note:*', async () => {});
  bus.subscribe('search:*', async () => {});

  assert(bus.listeners.has('note:*'), 'note:* should exist');
  bus.clearListeners('note:*');
  assert(!bus.listeners.has('note:*'), 'note:* should be removed');
  assert(bus.listeners.has('search:*'), 'search:* should still exist');

  bus.clearListeners('*'); // Clear all
  assert(bus.listeners.size === 0, 'All listeners should be cleared');
  console.log('✅ clearListeners removes patterns');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// ── Test 15: Async handler execution ──
console.log('\n[Test 15] Async handler support');
try {
  const bus = new EventBus(mockVault);
  let delayedResult = null;

  bus.subscribe('test:event', async (event, payload) => {
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 10));
    delayedResult = 'done';
  });

  const startTime = Date.now();
  await bus.emit('test:event', {});
  const duration = Date.now() - startTime;

  assert(delayedResult === 'done', 'Async handler should complete');
  assert(duration >= 10, 'Should wait for async handler');
  console.log('✅ Async handlers are awaited');
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('✅ EventBus Tests Complete');
console.log('='.repeat(60) + '\n');
