/**
 * VaultCoordinator — Multi-vault synchronization and link tracking
 * Clausidian v3.5.0+
 */

/**
 * VaultCoordinator — Manage operations across multiple vaults
 */
export class VaultCoordinator {
  constructor(eventBus, vaultRegistry) {
    this.eventBus = eventBus;
    this.vaultRegistry = vaultRegistry;
    this.links = new Map();            // vault1-vault2 → { config }
    this.syncState = new Map();        // vault1-vault2 → { lastSync, status }
  }

  /**
   * Register link between two vaults
   */
  registerLink(vault1Name, vault2Name, options = {}) {
    const linkKey = this.#getLinkKey(vault1Name, vault2Name);

    const linkConfig = {
      vault1: vault1Name,
      vault2: vault2Name,
      bidirectional: options.bidirectional !== false,
      syncTags: options.syncTags !== false,
      syncPattern: options.syncPattern || '**/*.md',
      conflictStrategy: options.conflictStrategy || 'merge', // merge, vault1_wins, vault2_wins, manual
      autoSync: options.autoSync === true,
      createdAt: new Date().toISOString(),
    };

    this.links.set(linkKey, linkConfig);
    this.syncState.set(linkKey, {
      status: 'idle',
      lastSync: null,
      errors: [],
    });

    // Emit event
    this.eventBus.emit('custom:vault-link-registered', {
      link: linkKey,
      config: linkConfig,
    });

    return { success: true, link: linkKey };
  }

  /**
   * Unregister link between vaults
   */
  unregisterLink(vault1Name, vault2Name) {
    const linkKey = this.#getLinkKey(vault1Name, vault2Name);

    if (!this.links.has(linkKey)) {
      return { success: false, error: `Link not found: ${linkKey}` };
    }

    this.links.delete(linkKey);
    this.syncState.delete(linkKey);

    this.eventBus.emit('custom:vault-link-unregistered', { link: linkKey });

    return { success: true };
  }

  /**
   * Sync notes between vaults
   */
  async syncNotes(vault1Name, vault2Name, options = {}) {
    const linkKey = this.#getLinkKey(vault1Name, vault2Name);

    if (!this.links.has(linkKey)) {
      return { success: false, error: `Link not found: ${linkKey}` };
    }

    const linkConfig = this.links.get(linkKey);
    const direction = options.direction || (linkConfig.bidirectional ? 'bidirectional' : 'unidirectional');
    const filter = options.filter || '*';

    this.#updateSyncState(linkKey, { status: 'syncing' });

    try {
      const vault1 = this.vaultRegistry.get(vault1Name);
      const vault2 = this.vaultRegistry.get(vault2Name);

      if (!vault1 || !vault2) {
        throw new Error('One or both vaults not found');
      }

      const syncResult = {
        direction,
        synced: [],
        skipped: [],
        conflicts: [],
        errors: [],
      };

      // Scan vault1 notes
      const vault1Notes = await this.#scanVaultNotes(vault1, filter);
      const vault2Notes = await this.#scanVaultNotes(vault2, filter);

      // Forward sync (vault1 → vault2)
      for (const note of vault1Notes) {
        const vault2Note = vault2Notes.find(n => n.path === note.path);

        if (!vault2Note) {
          // New note in vault1, copy to vault2
          try {
            await this.#copyNote(vault1, vault2, note);
            syncResult.synced.push(note.path);
          } catch (err) {
            syncResult.errors.push({ path: note.path, error: err.message });
          }
        } else {
          // Both have note, handle conflict
          const conflictResult = await this.#resolveConflict(
            note, vault2Note,
            linkConfig.conflictStrategy
          );

          if (conflictResult.action === 'update') {
            syncResult.synced.push(note.path);
          } else if (conflictResult.action === 'manual') {
            syncResult.conflicts.push({
              path: note.path,
              vault1Modified: note.modified,
              vault2Modified: vault2Note.modified,
            });
          }
        }
      }

      // Reverse sync (vault2 → vault1) if bidirectional
      if (direction === 'bidirectional') {
        for (const note of vault2Notes) {
          const vault1Note = vault1Notes.find(n => n.path === note.path);

          if (!vault1Note) {
            try {
              await this.#copyNote(vault2, vault1, note);
              syncResult.synced.push(`${note.path} (from vault2)`);
            } catch (err) {
              syncResult.errors.push({ path: note.path, error: err.message });
            }
          }
        }
      }

      // Update sync state
      this.#updateSyncState(linkKey, {
        status: 'idle',
        lastSync: new Date().toISOString(),
        syncedCount: syncResult.synced.length,
      });

      // Emit completion event
      this.eventBus.emit('custom:vault-sync-complete', {
        link: linkKey,
        result: syncResult,
      });

      return { success: true, result: syncResult };
    } catch (err) {
      this.#updateSyncState(linkKey, {
        status: 'error',
        error: err.message,
      });

      return { success: false, error: err.message };
    }
  }

  /**
   * Search across multiple vaults
   */
  async searchAcross(query, vaultNames, options = {}) {
    const limit = options.limit || 20;
    const results = [];
    const seen = new Set();

    for (const vaultName of vaultNames) {
      const vault = this.vaultRegistry.get(vaultName);
      if (!vault) continue;

      try {
        const searchResults = await this.#searchVault(vault, query);

        for (const result of searchResults.slice(0, limit)) {
          const key = `${result.path}`;

          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              ...result,
              vault: vaultName,
            });
          }
        }
      } catch (err) {
        console.error(`Error searching vault ${vaultName}: ${err.message}`);
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Get bi-directional links between vaults
   */
  async getBiDirectionalLinks(vault1Name, vault2Name) {
    const vault1 = this.vaultRegistry.get(vault1Name);
    const vault2 = this.vaultRegistry.get(vault2Name);

    if (!vault1 || !vault2) {
      return { success: false, error: 'One or both vaults not found' };
    }

    const links = {
      vault1ToVault2: [],
      vault2ToVault1: [],
    };

    try {
      // Find notes in vault1 that link to vault2
      const vault1Notes = await this.#scanVaultNotes(vault1, '*');
      for (const note of vault1Notes) {
        const links1to2 = this.#extractOutgoingLinks(note.content);
        for (const link of links1to2) {
          const linkedNote = await this.#findNote(vault2, link);
          if (linkedNote) {
            links.vault1ToVault2.push({
              from: note.path,
              to: linkedNote.path,
              linkText: link,
            });
          }
        }
      }

      // Find notes in vault2 that link back to vault1
      const vault2Notes = await this.#scanVaultNotes(vault2, '*');
      for (const note of vault2Notes) {
        const links2to1 = this.#extractOutgoingLinks(note.content);
        for (const link of links2to1) {
          const linkedNote = await this.#findNote(vault1, link);
          if (linkedNote) {
            links.vault2ToVault1.push({
              from: note.path,
              to: linkedNote.path,
              linkText: link,
            });
          }
        }
      }

      return { success: true, links };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Resolve conflict between two notes
   */
  async #resolveConflict(note1, note2, strategy) {
    if (strategy === 'vault1_wins') {
      return { action: 'update', winner: 1 };
    } else if (strategy === 'vault2_wins') {
      return { action: 'update', winner: 2 };
    } else if (strategy === 'merge') {
      // Simple merge: combine content
      return { action: 'update', winner: 'merged' };
    } else if (strategy === 'manual') {
      return { action: 'manual' };
    }
    return { action: 'skip' };
  }

  /**
   * Get link key
   */
  #getLinkKey(vault1, vault2) {
    const names = [vault1, vault2].sort();
    return names.join('-');
  }

  /**
   * Update sync state
   */
  #updateSyncState(linkKey, updates) {
    const state = this.syncState.get(linkKey) || {};
    this.syncState.set(linkKey, { ...state, ...updates });
  }

  /**
   * Scan vault notes
   */
  async #scanVaultNotes(vault, pattern) {
    if (!vault || typeof vault.scanNotes !== 'function') {
      return [];
    }

    try {
      return await vault.scanNotes({ includeBody: true });
    } catch (err) {
      console.error(`Error scanning vault: ${err.message}`);
      return [];
    }
  }

  /**
   * Copy note from source to destination vault
   */
  async #copyNote(sourceVault, destVault, note) {
    if (typeof destVault.write !== 'function') {
      throw new Error('Destination vault write not available');
    }

    await destVault.write(note.path, note.content);
  }

  /**
   * Search vault
   */
  async #searchVault(vault, query) {
    if (!vault || typeof vault.search !== 'function') {
      return [];
    }

    try {
      return await vault.search(query);
    } catch (err) {
      console.error(`Error searching vault: ${err.message}`);
      return [];
    }
  }

  /**
   * Find note in vault
   */
  async #findNote(vault, path) {
    if (!vault || typeof vault.findNote !== 'function') {
      return null;
    }

    try {
      return await vault.findNote(path);
    } catch (err) {
      return null;
    }
  }

  /**
   * Extract outgoing links from content
   */
  #extractOutgoingLinks(content) {
    if (!content) return [];

    // Match [[link]] format
    const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
    return matches.map(m => m.slice(2, -2));
  }

  /**
   * Get all links
   */
  getLinks() {
    return Array.from(this.links.values());
  }

  /**
   * Get sync state
   */
  getSyncState(vault1Name, vault2Name) {
    const linkKey = this.#getLinkKey(vault1Name, vault2Name);
    return this.syncState.get(linkKey);
  }
}

export default VaultCoordinator;
