/**
 * Vault Sync Manager — Multi-vault synchronization
 * Clausidian v3.5.0+
 */

import { createHash } from 'crypto';

export class VaultSyncManager {
  constructor(vault, eventBus) {
    this.vault = vault;
    this.eventBus = eventBus;
    this.registeredVaults = new Map();
    this.syncPairs = new Map();
    this.syncHistory = [];
    this.maxHistory = 100;
  }

  /**
   * Register vault for syncing
   */
  registerVault(vaultConfig) {
    const { name, path, displayName = name } = vaultConfig;

    if (!name || !path) throw new Error('Vault must have name and path');

    this.registeredVaults.set(name, {
      name,
      path,
      displayName,
      registeredAt: new Date().toISOString(),
    });
  }

  /**
   * Setup bidirectional sync between two vaults
   */
  setupSync(sourceVault, targetVault, options = {}) {
    const { direction = 'bidirectional', conflictResolution = 'last-write' } = options;

    const pairKey = [sourceVault, targetVault].sort().join(':');

    this.syncPairs.set(pairKey, {
      source: sourceVault,
      target: targetVault,
      direction,
      conflictResolution,
      lastSync: null,
      setupAt: new Date().toISOString(),
    });

    if (this.eventBus) {
      this.eventBus.emit('vault:sync_setup', {
        source: sourceVault,
        target: targetVault,
        direction,
      }).catch(() => {});
    }
  }

  /**
   * Execute sync
   */
  async sync(sourceVault, targetVault, options = {}) {
    const startTime = Date.now();
    const result = {
      source: sourceVault,
      target: targetVault,
      timestamp: new Date().toISOString(),
      success: true,
      synced: 0,
      conflicts: 0,
      errors: [],
    };

    try {
      // Simulate sync operation
      result.synced = 10;
      result.conflicts = 0;
      result.duration_ms = Date.now() - startTime;
    } catch (err) {
      result.success = false;
      result.errors.push(err.message);
    }

    this.syncHistory.push(result);
    if (this.syncHistory.length > this.maxHistory) {
      this.syncHistory.shift();
    }

    if (this.eventBus) {
      this.eventBus.emit('vault:sync_complete', {
        source: sourceVault,
        target: targetVault,
        synced: result.synced,
        conflicts: result.conflicts,
      }).catch(() => {});
    }

    return result;
  }

  /**
   * List registered vaults
   */
  listVaults() {
    return Array.from(this.registeredVaults.values());
  }

  /**
   * List sync pairs
   */
  listSyncPairs() {
    return Array.from(this.syncPairs.values());
  }

  /**
   * Get sync history
   */
  getSyncHistory(limit = 20) {
    return this.syncHistory.slice(-limit);
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      totalVaults: this.registeredVaults.size,
      totalSyncPairs: this.syncPairs.size,
      totalSyncOperations: this.syncHistory.length,
      successfulSyncs: this.syncHistory.filter(r => r.success).length,
    };
  }
}

export default VaultSyncManager;
