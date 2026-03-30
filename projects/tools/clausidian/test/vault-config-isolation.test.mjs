import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { Vault } from '../src/vault.mjs';

test('vault config isolation', async (t) => {
  let tmpDir, vault1, vault2;

  t.before(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vault-config-test-'));
    vault1 = join(tmpDir, 'vault1');
    vault2 = join(tmpDir, 'vault2');
    mkdirSync(vault1, { recursive: true });
    mkdirSync(vault2, { recursive: true });
  });

  t.after(() => {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch (err) {
      // ignore
    }
  });

  await t.test('I6-TS01: Different PARA dirs respected per vault', async () => {
    // Create config for vault1 with custom dirs
    writeFileSync(join(vault1, '.clausidian.json'), JSON.stringify({
      dirs: ['areas', 'projects', 'notes']
    }, null, 2));

    // Create config for vault2 with different dirs
    writeFileSync(join(vault2, '.clausidian.json'), JSON.stringify({
      dirs: ['projects', 'research', 'inbox']
    }, null, 2));

    const v1 = new Vault(vault1);
    const v2 = new Vault(vault2);

    assert.deepEqual(v1.dirs, ['areas', 'projects', 'notes']);
    assert.deepEqual(v2.dirs, ['projects', 'research', 'inbox']);
  });

  await t.test('I6-TS02: Config file missing uses default dirs', async () => {
    const v1 = new Vault(vault1);
    // vault1 has config from TS01
    assert.deepEqual(v1.dirs, ['areas', 'projects', 'notes']);

    // vault3 has no config
    const vault3 = join(tmpDir, 'vault3');
    mkdirSync(vault3, { recursive: true });
    const v3 = new Vault(vault3);
    assert.deepEqual(v3.dirs, ['areas', 'projects', 'resources', 'journal', 'ideas']);
  });

  await t.test('I6-TS03: Corrupted config falls back to default', async () => {
    const vault3 = join(tmpDir, 'vault3-corrupt');
    mkdirSync(vault3, { recursive: true });

    // Write invalid JSON
    writeFileSync(join(vault3, '.clausidian.json'), 'invalid json {');

    const v3 = new Vault(vault3);
    // Should fall back to DEFAULT_DIRS
    assert.deepEqual(v3.dirs, ['areas', 'projects', 'resources', 'journal', 'ideas']);
  });

  await t.test('I6-TS04: No cross-vault fallback', async () => {
    const vaultA = join(tmpDir, 'vaultA');
    const vaultB = join(tmpDir, 'vaultB');
    mkdirSync(vaultA, { recursive: true });
    mkdirSync(vaultB, { recursive: true });

    // Only vaultA has config
    writeFileSync(join(vaultA, '.clausidian.json'), JSON.stringify({
      dirs: ['custom-a']
    }, null, 2));

    const va = new Vault(vaultA);
    const vb = new Vault(vaultB);

    // vaultB should NOT inherit vaultA's config
    assert.deepEqual(va.dirs, ['custom-a']);
    assert.deepEqual(vb.dirs, ['areas', 'projects', 'resources', 'journal', 'ideas']);
  });

  await t.test('I6-TS05: Cache file isolation - separate .clausidian roots', async () => {
    const vaultX = join(tmpDir, 'vaultX');
    const vaultY = join(tmpDir, 'vaultY');
    mkdirSync(vaultX, { recursive: true });
    mkdirSync(vaultY, { recursive: true });

    const vx = new Vault(vaultX);
    const vy = new Vault(vaultY);

    // Both should have independent cache paths
    assert.equal(vx.path('.clausidian', 'cache.json'), join(vaultX, '.clausidian', 'cache.json'));
    assert.equal(vy.path('.clausidian', 'cache.json'), join(vaultY, '.clausidian', 'cache.json'));
  });

  await t.test('I6-TS06: Vault detects dirs from config file', async () => {
    const vault4 = join(tmpDir, 'vault4');
    mkdirSync(vault4, { recursive: true });

    // Create config with specific dirs
    writeFileSync(join(vault4, '.clausidian.json'), JSON.stringify({
      dirs: ['one', 'two', 'three']
    }, null, 2));

    const v4 = new Vault(vault4);
    assert.deepEqual(v4.dirs, ['one', 'two', 'three']);
  });

  await t.test('I6-TS07: No shared state between vault instances', async () => {
    const vault5 = join(tmpDir, 'vault5');
    const vault6 = join(tmpDir, 'vault6');
    mkdirSync(vault5, { recursive: true });
    mkdirSync(vault6, { recursive: true });

    // Create distinct configs
    writeFileSync(join(vault5, '.clausidian.json'), JSON.stringify({
      dirs: ['dirs-for-5']
    }, null, 2));
    writeFileSync(join(vault6, '.clausidian.json'), JSON.stringify({
      dirs: ['dirs-for-6']
    }, null, 2));

    const v5 = new Vault(vault5);
    const v6 = new Vault(vault6);

    // Modifying one vault's dirs should not affect the other
    v5.dirs = ['modified'];
    assert.deepEqual(v5.dirs, ['modified']);
    assert.deepEqual(v6.dirs, ['dirs-for-6']);
  });

  await t.test('I6-TS08: Per-vault vaultName parameter isolated', async () => {
    const vaultTeam = join(tmpDir, 'vault-team');
    const vaultPersonal = join(tmpDir, 'vault-personal');
    mkdirSync(vaultTeam, { recursive: true });
    mkdirSync(vaultPersonal, { recursive: true });

    const vteam = new Vault(vaultTeam, { vaultName: 'team' });
    const vpersonal = new Vault(vaultPersonal, { vaultName: 'personal' });

    assert.equal(vteam.vaultName, 'team');
    assert.equal(vpersonal.vaultName, 'personal');
  });

  await t.test('I6-TS09: Config with non-array dirs field ignored', async () => {
    const vault7 = join(tmpDir, 'vault7');
    mkdirSync(vault7, { recursive: true });

    // Write config with dirs as non-array
    writeFileSync(join(vault7, '.clausidian.json'), JSON.stringify({
      dirs: 'not-an-array'
    }, null, 2));

    const v7 = new Vault(vault7);
    // Should fall back to DEFAULT_DIRS
    assert.deepEqual(v7.dirs, ['areas', 'projects', 'resources', 'journal', 'ideas']);
  });

  await t.test('I6-TS10: Default dirs fallback when no config', async () => {
    const vault8 = join(tmpDir, 'vault8');
    mkdirSync(vault8, { recursive: true });

    const v8 = new Vault(vault8);
    assert.deepEqual(v8.dirs, ['areas', 'projects', 'resources', 'journal', 'ideas']);
  });
});
