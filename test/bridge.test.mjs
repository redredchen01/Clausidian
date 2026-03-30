import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('Obsidian CLI bridge', () => {
  describe('detectOfficialCli()', () => {
    it('should return a status object', async () => {
      // Reset cached detection
      const mod = await import('../src/obsidian-cli.mjs');
      const status = mod.detectOfficialCli();
      assert.ok(typeof status === 'object');
      assert.ok('available' in status);
      assert.ok(typeof status.available === 'boolean');
      if (!status.available) {
        assert.ok('reason' in status);
      }
    });
  });

  describe('tryBridge()', () => {
    it('should skip native-only commands', async () => {
      const { tryBridge } = await import('../src/obsidian-cli.mjs');
      const result = tryBridge('init', [], {});
      assert.strictEqual(result.bridged, false);
      assert.match(result.reason, /native only/);
    });

    it('should skip unmapped commands', async () => {
      const { tryBridge } = await import('../src/obsidian-cli.mjs');
      const result = tryBridge('graph', [], {});
      assert.strictEqual(result.bridged, false);
    });

    it('should skip commands in NEVER_BRIDGE set', async () => {
      const { tryBridge } = await import('../src/obsidian-cli.mjs');
      const neverBridge = [
        'init', 'serve', 'setup', 'help', 'sync', 'health', 'graph',
        'review', 'capture', 'note', 'archive', 'hook', 'watch',
        'suggest', 'focus', 'neighbors', 'timeline', 'validate',
        'changelog', 'agenda', 'count', 'stats', 'export', 'import',
        'merge', 'link', 'relink', 'pin', 'unpin', 'batch',
        'quicknote', 'launchd', 'daily', 'duplicates', 'broken-links',
        'recent', 'rename', 'move', 'update', 'patch', 'tag', 'list',
      ];
      for (const cmd of neverBridge) {
        const r = tryBridge(cmd, [], {});
        assert.strictEqual(r.bridged, false, `${cmd} should not be bridged`);
      }
    });

    it('should attempt bridge for mapped commands', async () => {
      const { tryBridge } = await import('../src/obsidian-cli.mjs');
      const result = tryBridge('search', ['test'], {});
      // Either bridged successfully or gracefully fell back
      assert.ok(typeof result.bridged === 'boolean');
      if (!result.bridged) {
        assert.ok(typeof result.reason === 'string');
      }
    });
  });

  describe('bridgeStatus()', () => {
    it('should return complete status info', async () => {
      const { bridgeStatus } = await import('../src/obsidian-cli.mjs');
      const status = bridgeStatus();
      assert.ok(status.officialCli);
      assert.ok(Array.isArray(status.bridgeableCommands));
      assert.ok(Array.isArray(status.nativeOnlyCommands));
      assert.ok(status.bridgeableCommands.length > 0);
      assert.ok(status.nativeOnlyCommands.length > 0);
      assert.ok(status.bridgeableCommands.includes('search'));
      assert.ok(status.nativeOnlyCommands.includes('init'));
    });
  });
});
