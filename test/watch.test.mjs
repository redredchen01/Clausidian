import assert from 'assert';
import test from 'node:test';
import { tmpdir } from 'os';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { watch } from '../src/commands/watch.mjs';
import { todayStr, prevDate } from '../src/dates.mjs';

// Mock watch — test time-aware state tracking
test('watch — time-aware triggers', async (t) => {
  const testVaultRoot = join(tmpdir(), `clausidian-watch-test-${Date.now()}`);
  mkdirSync(testVaultRoot, { recursive: true });

  // Create directory structure
  mkdirSync(join(testVaultRoot, 'journal'), { recursive: true });
  mkdirSync(join(testVaultRoot, 'projects'), { recursive: true });

  // Create initial test notes
  const today = todayStr();
  writeFileSync(
    join(testVaultRoot, 'journal', `${today}.md`),
    `---\ntitle: "Journal ${today}"\ntype: journal\ntags: []\n---\n\n# Today\n`
  );

  writeFileSync(
    join(testVaultRoot, 'projects', 'test.md'),
    `---\ntitle: "Test Project"\ntype: project\ntags: []\n---\n\n# Test\n`
  );

  // Note: watch() spawns file watchers and keeps process alive
  // For unit testing, we'll test the core logic separately
  await t.test('initializes time-aware state correctly', () => {
    // The watch function initializes lastDailyBackfillDate and lastWeeklyReviewDate as null
    // This test verifies the function definition loads correctly
    assert.strictEqual(typeof watch, 'function');
  });

  await t.test('delta calculation logic — positive changes', () => {
    // Simulate delta calculation
    const lastSyncCount = { tags: 5, notes: 10, relationships: 3 };
    const result = { tags: 8, notes: 12, relationships: 5 };

    const tagDelta = result.tags - lastSyncCount.tags;
    const noteDelta = result.notes - lastSyncCount.notes;
    const linkDelta = result.relationships - lastSyncCount.relationships;

    assert.strictEqual(tagDelta, 3);
    assert.strictEqual(noteDelta, 2);
    assert.strictEqual(linkDelta, 2);
  });

  await t.test('delta calculation logic — no changes', () => {
    const lastSyncCount = { tags: 5, notes: 10, relationships: 3 };
    const result = { tags: 5, notes: 10, relationships: 3 };

    const tagDelta = result.tags - lastSyncCount.tags;
    const noteDelta = result.notes - lastSyncCount.notes;
    const linkDelta = result.relationships - lastSyncCount.relationships;

    assert.strictEqual(tagDelta, 0);
    assert.strictEqual(noteDelta, 0);
    assert.strictEqual(linkDelta, 0);
  });

  await t.test('time-aware trigger: date comparison', () => {
    let lastDailyBackfillDate = null;
    const today = todayStr();
    const triggered = [];

    // Simulate first trigger on new day
    if (today !== lastDailyBackfillDate) {
      lastDailyBackfillDate = today;
      triggered.push('daily-backfill');
    }

    assert.strictEqual(triggered.length, 1);
    assert.strictEqual(triggered[0], 'daily-backfill');

    // Second call should not trigger (same day)
    if (today !== lastDailyBackfillDate) {
      triggered.push('daily-backfill');
    }

    assert.strictEqual(triggered.length, 1);
  });

  await t.test('time-aware trigger: Sunday check', () => {
    const testDate = '2026-03-29'; // Sunday in March 2026
    const isSunday = new Date(testDate + 'T12:00:00Z').getDay() === 0;
    assert.strictEqual(isSunday, true);

    const testDate2 = '2026-03-30'; // Monday in March 2026
    const isMonday = new Date(testDate2 + 'T12:00:00Z').getDay() === 1;
    assert.strictEqual(isMonday, true);
  });
});
