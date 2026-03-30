/**
 * cache — manage persistent search cache (stats, clear, status)
 */

import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { Vault } from '../vault.mjs';

/**
 * Main cache command dispatcher
 * @param {string} vaultRoot - Vault root path
 * @param {Object} options - Command options
 * @param {string} options.subcommand - Subcommand: stats, clear, or status
 */
export async function cache(vaultRoot, { subcommand } = {}) {
  if (subcommand === 'stats') {
    return cacheStats(vaultRoot);
  } else if (subcommand === 'clear') {
    return cacheClear(vaultRoot);
  } else if (subcommand === 'status') {
    return cacheStatus(vaultRoot);
  } else {
    throw new Error(`Unknown cache subcommand: ${subcommand}. Use 'stats', 'clear', or 'status'.`);
  }
}

/**
 * Show cache statistics (hits, misses, size, hit rate)
 */
function cacheStats(vaultRoot) {
  const vault = new Vault(vaultRoot);
  const stats = vault._clusterCache.stats();

  const hitRate = stats.hits + stats.misses === 0
    ? 'N/A'
    : `${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)}%`;

  return {
    hits: stats.hits,
    misses: stats.misses,
    size: `${(stats.size / 1024).toFixed(2)} KB`,
    age: `${Math.floor(stats.age / 1000)} seconds`,
    vaultVersion: stats.vaultVersion.slice(0, 8) + '...',
    hitRate
  };
}

/**
 * Clear all cached search results
 */
function cacheClear(vaultRoot) {
  const vault = new Vault(vaultRoot);
  const cacheDir = join(vaultRoot, '.clausidian');
  const cachePath = join(cacheDir, 'cache.json');

  try {
    if (existsSync(cachePath)) {
      unlinkSync(cachePath);
    }
    vault._clusterCache.invalidate();
    return { success: true, message: 'Cache cleared' };
  } catch (err) {
    return { success: false, message: `Failed to clear cache: ${err.message}` };
  }
}

/**
 * Show cache status in human-readable format
 */
function cacheStatus(vaultRoot) {
  const vault = new Vault(vaultRoot);
  const stats = vault._clusterCache.stats();

  const hitRate = stats.hits + stats.misses === 0
    ? 'N/A'
    : `${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)}%`;

  return `Cache — Size: ${(stats.size / 1024).toFixed(2)} KB | Hits: ${stats.hits} | Misses: ${stats.misses} | Hit Rate: ${hitRate}`;
}
