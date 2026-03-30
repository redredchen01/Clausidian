/**
 * watch — auto-rebuild indices on file changes + spawn hook events + time-aware automation
 */
import { watch as fsWatch, existsSync } from 'fs';
import { spawn } from 'child_process';
import { Vault } from '../vault.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr } from '../dates.mjs';

export function watch(vaultRoot) {
  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);

  let debounce = null;
  const changedFiles = new Set();
  const fileState = new Map(); // Track file existence

  // Time-aware state
  let lastDailyBackfillDate = null;
  let lastWeeklyReviewDate = null;
  let lastSyncResult = null;

  // Initialize file state
  const initialNotes = vault.scanNotes();
  for (const note of initialNotes) {
    fileState.set(note.file, { exists: true, timestamp: Date.now() });
  }

  const rebuild = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      try {
        const result = idx.sync();
        const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
        const today = todayStr();

        // Calculate delta from last sync
        let delta = '';
        if (lastSyncResult) {
          const tagDelta = result.tags - lastSyncResult.tags;
          const notesDelta = result.notes - lastSyncResult.notes;
          const linksDelta = result.relationships - lastSyncResult.relationships;
          delta = ` [${tagDelta > 0 ? '+' : ''}${tagDelta}T ${notesDelta > 0 ? '+' : ''}${notesDelta}N ${linksDelta > 0 ? '+' : ''}${linksDelta}L]`;
        }

        console.log(`[${ts}] Synced: ${result.tags} tags, ${result.notes} notes, ${result.relationships} links${delta}`);
        lastSyncResult = result;

        // Spawn hook events for changed files
        spawnHookEvents(vaultRoot, changedFiles);
        changedFiles.clear();

        // Time-aware automation
        triggerTimeAwareEvents(vaultRoot, today, {
          lastDailyBackfillDate,
          lastWeeklyReviewDate,
          onDailyBackfill: (newDate) => { lastDailyBackfillDate = newDate; },
          onWeeklyReview: (newDate) => { lastWeeklyReviewDate = newDate; }
        });
      } catch (err) {
        console.error(`[sync error] ${err.message}`);
      }
    }, 500);
  };

  // Single recursive watcher on vault root (macOS FSEvents supports recursive natively)
  const watchDirs = vault.dirs;
  const watchers = [];

  try {
    const w = fsWatch(vault.root, { recursive: true }, (event, filename) => {
      if (!filename) return;
      if (!filename.endsWith('.md')) return;
      if (filename.startsWith('.git/') || filename.startsWith('node_modules/') || filename.startsWith('.obsidian/')) return;
      const base = filename.split('/').pop();
      if (base.startsWith('_')) return;

      // Track file change for event spawning
      const noteName = base.replace(/\.md$/, '');
      const fullPath = vault.path(filename);
      const exists = existsSync(fullPath);

      if (exists) {
        // Created or updated
        if (!fileState.has(noteName)) {
          changedFiles.set(noteName, 'created');
        } else {
          changedFiles.set(noteName, 'updated');
        }
        fileState.set(noteName, { exists: true, timestamp: Date.now() });
      } else {
        // Deleted
        changedFiles.set(noteName, 'deleted');
        fileState.delete(noteName);
      }

      rebuild();
    });
    watchers.push(w);
  } catch {
    // Fallback: watch each content directory individually (non-recursive)
    for (const dir of watchDirs) {
      const dirPath = vault.path(dir);
      try {
        const w = fsWatch(dirPath, { recursive: false }, (event, filename) => {
          if (filename && filename.endsWith('.md') && !filename.startsWith('_')) {
            const noteName = filename.replace(/\.md$/, '');
            const fullPath = vault.path(`${dir}/${filename}`);
            const exists = existsSync(fullPath);
            if (exists) {
              changedFiles.set(noteName, fileState.has(noteName) ? 'updated' : 'created');
              fileState.set(noteName, { exists: true, timestamp: Date.now() });
            } else {
              changedFiles.set(noteName, 'deleted');
              fileState.delete(noteName);
            }
            rebuild();
          }
        });
        watchers.push(w);
      } catch {
        // Directory may not exist yet
      }
    }
  }

  // Initial sync
  const result = idx.sync();
  console.log(`clausidian watching ${vault.root}`);
  console.log(`Initial: ${result.tags} tags, ${result.notes} notes, ${result.relationships} links`);
  console.log('Press Ctrl+C to stop.\n');

  // Keep process alive
  process.on('SIGINT', () => {
    for (const w of watchers) w.close();
    console.log('\nStopped watching.');
    process.exit(0);
  });

  return { status: 'watching', dirs: watchDirs.length };
}

function spawnHookEvents(vaultRoot, changedFiles) {
  if (changedFiles.size === 0) return;

  for (const [noteName, eventType] of changedFiles) {
    const eventMap = {
      created: 'note-created',
      updated: 'note-updated',
      deleted: 'note-deleted'
    };
    const hookEvent = eventMap[eventType];

    const payload = {
      event: hookEvent,
      note: noteName,
      timestamp: new Date().toISOString(),
      changes: { [eventType]: true }
    };

    // Spawn hook subprocess with JSON payload on stdin
    const proc = spawn(process.execPath, [process.argv[1], 'hook', hookEvent], {
      cwd: vaultRoot,
      stdio: ['pipe', 'pipe', 'inherit']
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();

    proc.stdout.on('data', (data) => {
      try {
        const result = JSON.parse(data.toString());
        if (result.suggestions) {
          console.log(`  → ${noteName}: ${result.suggestions.length} link suggestions`);
        }
      } catch {
        // Ignore non-JSON stdout
      }
    });

    proc.on('error', (err) => {
      console.error(`[hook spawn error] ${err.message}`);
    });
  }
}

function triggerTimeAwareEvents(vaultRoot, today, state) {
  const { lastDailyBackfillDate, lastWeeklyReviewDate, onDailyBackfill, onWeeklyReview } = state;

  // Trigger daily-backfill once per day
  if (lastDailyBackfillDate !== today) {
    console.log(`[automation] Triggering daily-backfill for ${today}...`);
    const payload = { event: 'daily-backfill', date: today, timestamp: new Date().toISOString() };
    const proc = spawn(process.execPath, [process.argv[1], 'hook', 'daily-backfill'], {
      cwd: vaultRoot,
      stdio: ['pipe', 'inherit', 'inherit']
    });
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
    onDailyBackfill(today);
  }

  // Trigger weekly review on Sunday (only once per week)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const weekIdentifier = `${today}-W${Math.ceil((now.getDate()) / 7)}`;

  if (dayOfWeek === 0 && lastWeeklyReviewDate !== weekIdentifier) {
    console.log(`[automation] Triggering weekly review...`);
    const proc = spawn(process.execPath, [process.argv[1], 'review'], {
      cwd: vaultRoot,
      stdio: ['inherit', 'inherit', 'inherit']
    });
    proc.on('error', (err) => {
      console.error(`[weekly review error] ${err.message}`);
    });
    onWeeklyReview(weekIdentifier);
  }
}
