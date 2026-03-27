/**
 * watch — auto-rebuild indices on file changes
 */
import { watch as fsWatch } from 'fs';
import { Vault } from '../vault.mjs';
import { IndexManager } from '../index-manager.mjs';

export function watch(vaultRoot) {
  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);

  let debounce = null;
  const rebuild = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      try {
        const result = idx.sync();
        const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
        console.log(`[${ts}] Synced: ${result.tags} tags, ${result.notes} notes, ${result.relationships} links`);
      } catch (err) {
        console.error(`[sync error] ${err.message}`);
      }
    }, 500);
  };

  // Watch each content directory
  const watchDirs = vault.dirs;
  const watchers = [];

  for (const dir of watchDirs) {
    const dirPath = vault.path(dir);
    try {
      const w = fsWatch(dirPath, { recursive: false }, (event, filename) => {
        if (filename && filename.endsWith('.md') && !filename.startsWith('_')) {
          rebuild();
        }
      });
      watchers.push(w);
    } catch {
      // Directory may not exist yet
    }
  }

  // Initial sync
  const result = idx.sync();
  console.log(`obsidian-agent watching ${vault.root}`);
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
