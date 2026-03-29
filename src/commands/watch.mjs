/**
 * watch — auto-rebuild indices on file changes (cross-platform)
 *
 * fs.watch({ recursive: true }) works on macOS and Windows.
 * On Linux, recursive is not supported — we watch each directory individually
 * and use a polling fallback for subdirectories.
 */
import { watch as fsWatch, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { Vault } from '../vault.mjs';
import { IndexManager } from '../index-manager.mjs';

const isLinux = process.platform === 'linux';

export function watch(vaultRoot) {
  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);

  let debounce = null;
  const rebuild = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      try {
        vault.invalidateCache();
        const result = idx.sync();
        const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
        console.log(`[${ts}] Synced: ${result.tags} tags, ${result.notes} notes, ${result.relationships} links`);
      } catch (err) {
        console.error(`[sync error] ${err.message}`);
      }
    }, 500);
  };

  const isMdChange = (filename) =>
    filename && filename.endsWith('.md') && !filename.startsWith('_');

  const watchers = [];

  if (isLinux) {
    // Linux: fs.watch does not support recursive — watch each dir individually
    for (const dir of vault.dirs) {
      const dirPath = vault.path(dir);
      if (!existsSync(dirPath)) continue;
      try {
        const w = fsWatch(dirPath, (event, filename) => {
          if (isMdChange(filename)) rebuild();
        });
        watchers.push(w);
      } catch { /* dir may not exist */ }
    }
    // Also poll periodically as a fallback for missed events
    const pollInterval = setInterval(() => { rebuild(); }, 5000);
    watchers.push({ close: () => clearInterval(pollInterval) });
  } else {
    // macOS / Windows: recursive watching works
    for (const dir of vault.dirs) {
      const dirPath = vault.path(dir);
      if (!existsSync(dirPath)) continue;
      try {
        const w = fsWatch(dirPath, { recursive: true }, (event, filename) => {
          if (isMdChange(filename)) rebuild();
        });
        watchers.push(w);
      } catch { /* dir may not exist */ }
    }
  }

  // Initial sync
  const result = idx.sync();
  console.log(`obsidian-agent watching ${vault.root}${isLinux ? ' (polling fallback)' : ''}`);
  console.log(`Initial: ${result.tags} tags, ${result.notes} notes, ${result.relationships} links`);
  console.log('Press Ctrl+C to stop.\n');

  // Graceful shutdown — works on all platforms (Node.js emulates SIGINT on Windows)
  process.on('SIGINT', () => {
    for (const w of watchers) w.close();
    console.log('\nStopped watching.');
    process.exit(0);
  });

  return { status: 'watching', dirs: vault.dirs.length, platform: process.platform };
}
