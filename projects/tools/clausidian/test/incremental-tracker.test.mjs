/**
 * Test IncrementalTracker — dirty set tracking for incremental rebuilds
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IncrementalTracker } from '../src/incremental-tracker.mjs';

describe('IncrementalTracker', () => {
  it('should initialize with empty dirty set', () => {
    const tracker = new IncrementalTracker();
    assert.strictEqual(tracker.count(), 0);
    assert.ok(!tracker.hasDirty());
  });

  it('should mark single file as dirty', () => {
    const tracker = new IncrementalTracker();
    tracker.markDirty('note-a');
    assert.ok(tracker.isDirty('note-a'));
    assert.strictEqual(tracker.count(), 1);
  });

  it('should mark multiple files as dirty', () => {
    const tracker = new IncrementalTracker();
    tracker.markDirtyBulk(['note-a', 'note-b', 'note-c']);
    assert.ok(tracker.isDirty('note-a'));
    assert.ok(tracker.isDirty('note-b'));
    assert.ok(tracker.isDirty('note-c'));
    assert.strictEqual(tracker.count(), 3);
  });

  it('should return copy of dirty set', () => {
    const tracker = new IncrementalTracker();
    tracker.markDirty('note-a');
    const dirtySet = tracker.getDirtySet();
    dirtySet.add('note-b');
    assert.ok(!tracker.isDirty('note-b'), 'Original should not be modified');
  });

  it('should detect when no files are dirty', () => {
    const tracker = new IncrementalTracker();
    assert.ok(!tracker.hasDirty());
    tracker.markDirty('note-a');
    assert.ok(tracker.hasDirty());
  });

  it('should clear dirty set', () => {
    const tracker = new IncrementalTracker();
    tracker.markDirtyBulk(['note-a', 'note-b']);
    assert.ok(tracker.hasDirty());
    tracker.clearDirty();
    assert.ok(!tracker.hasDirty());
    assert.strictEqual(tracker.count(), 0);
  });

  it('should handle duplicate marks', () => {
    const tracker = new IncrementalTracker();
    tracker.markDirty('note-a');
    tracker.markDirty('note-a');
    assert.strictEqual(tracker.count(), 1);
  });

  it('should return false for non-dirty files', () => {
    const tracker = new IncrementalTracker();
    tracker.markDirty('note-a');
    assert.ok(!tracker.isDirty('note-b'));
  });
});
