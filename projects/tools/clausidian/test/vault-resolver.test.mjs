import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { resolveVault } from '../src/vault-resolver.mjs';
import { VaultRegistry } from '../src/vault-registry.mjs';

test('VaultResolver — resolveVault precedence', async (t) => {
  let tmpDir, vaultPath1, vaultPath2;

  t.before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vault-resolver-test-'));
    vaultPath1 = join(tmpDir, 'vault1');
    vaultPath2 = join(tmpDir, 'vault2');
    mkdirSync(vaultPath1, { recursive: true });
    mkdirSync(vaultPath2, { recursive: true });
  });

  t.after(() => {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch (err) {
      // ignore
    }
  });

  await t.test('resolveVault uses --vault flag (highest precedence)', async () => {
    const registryPath = join(tmpDir, 'vault-flag-registry.json');
    const registry = new VaultRegistry(registryPath);
    await registry.load();
    await registry.register('team', vaultPath1);
    await registry.register('personal', vaultPath2);

    const result = resolveVault({ vault: 'personal' }, registry, vaultPath1);
    assert.equal(result.vaultPath, vaultPath2);
    assert.equal(result.vaultName, 'personal');
    assert.equal(result.source, 'flag');
  });

  await t.test('resolveVault throws E4 when --vault vault not found', () => {
    const registryPath = join(tmpDir, 'vault-flag-notfound-registry.json');
    const registry = new VaultRegistry(registryPath);
    registry.vaults = [{ name: 'team', path: vaultPath1 }];

    assert.throws(
      () => resolveVault({ vault: 'nonexistent' }, registry, vaultPath1),
      /E4: Vault not found/
    );
  });

  await t.test('resolveVault throws E2 when --vault path is invalid', async () => {
    const registryPath = join(tmpDir, 'vault-flag-invalid-registry.json');
    const registry = new VaultRegistry(registryPath);
    await registry.load();
    await registry.register('good', vaultPath1);
    // Manually insert a vault with invalid path (bypass path validation in register)
    registry.vaults.push({ name: 'broken', path: join(tmpDir, 'nonexistent') });

    assert.throws(
      () => resolveVault({ vault: 'broken' }, registry, vaultPath1),
      /E2: Invalid vault path/
    );
  });

  await t.test('resolveVault uses OA_VAULT env var when --vault not set', () => {
    const originalOA = process.env.OA_VAULT;
    try {
      process.env.OA_VAULT = vaultPath1;
      const registry = new VaultRegistry();
      registry.vaults = [{ name: 'team', path: vaultPath2 }];

      const result = resolveVault({}, registry, join(tmpDir, 'fallback'));
      assert.equal(result.vaultPath, vaultPath1);
      assert.equal(result.vaultName, null);
      assert.equal(result.source, 'env');
    } finally {
      if (originalOA) {
        process.env.OA_VAULT = originalOA;
      } else {
        delete process.env.OA_VAULT;
      }
    }
  });

  await t.test('resolveVault throws E2 when OA_VAULT path is invalid', () => {
    const originalOA = process.env.OA_VAULT;
    try {
      process.env.OA_VAULT = join(tmpDir, 'nonexistent');
      const registry = new VaultRegistry();
      registry.vaults = [{ name: 'team', path: vaultPath1 }];

      assert.throws(
        () => resolveVault({}, registry, vaultPath1),
        /E2: Invalid vault path from OA_VAULT/
      );
    } finally {
      if (originalOA) {
        process.env.OA_VAULT = originalOA;
      } else {
        delete process.env.OA_VAULT;
      }
    }
  });

  await t.test('resolveVault uses registry default when env var not set', async () => {
    const originalOA = process.env.OA_VAULT;
    try {
      delete process.env.OA_VAULT;
      const registryPath = join(tmpDir, 'vault-default-registry.json');
      const registry = new VaultRegistry(registryPath);
      await registry.load();
      await registry.register('team', vaultPath1);
      await registry.register('personal', vaultPath2);
      await registry.setDefault('personal');

      const result = resolveVault({}, registry, join(tmpDir, 'fallback'));
      assert.equal(result.vaultPath, vaultPath2);
      assert.equal(result.vaultName, 'personal');
      assert.equal(result.source, 'registry');
    } finally {
      if (originalOA) {
        process.env.OA_VAULT = originalOA;
      }
    }
  });

  await t.test('resolveVault throws E2 when registry default path is invalid', async () => {
    const originalOA = process.env.OA_VAULT;
    try {
      delete process.env.OA_VAULT;
      const registryPath = join(tmpDir, 'vault-default-invalid-registry.json');
      const registry = new VaultRegistry(registryPath);
      await registry.load();
      await registry.register('good', vaultPath1);
      // Manually insert a vault with invalid path and set as default
      registry.vaults.push({ name: 'broken', path: join(tmpDir, 'nonexistent') });
      registry.defaultVaultName = 'broken';

      assert.throws(
        () => resolveVault({}, registry, vaultPath1),
        /E2: Invalid vault path: default vault/
      );
    } finally {
      if (originalOA) {
        process.env.OA_VAULT = originalOA;
      }
    }
  });

  await t.test('resolveVault uses fallback when no vault available', () => {
    const originalOA = process.env.OA_VAULT;
    try {
      delete process.env.OA_VAULT;
      const registry = new VaultRegistry();
      registry.vaults = [];

      const result = resolveVault({}, registry, vaultPath1);
      assert.equal(result.vaultPath, vaultPath1);
      assert.equal(result.vaultName, null);
      assert.equal(result.source, 'fallback');
    } finally {
      if (originalOA) {
        process.env.OA_VAULT = originalOA;
      }
    }
  });

  await t.test('resolveVault throws E3 when no vault available and fallback invalid', () => {
    const originalOA = process.env.OA_VAULT;
    try {
      delete process.env.OA_VAULT;
      const registry = new VaultRegistry();
      registry.vaults = [];

      assert.throws(
        () => resolveVault({}, registry, join(tmpDir, 'nonexistent')),
        /E3: No vault selected/
      );
    } finally {
      if (originalOA) {
        process.env.OA_VAULT = originalOA;
      }
    }
  });

  await t.test('resolveVault E3 message includes registered vaults', () => {
    const originalOA = process.env.OA_VAULT;
    try {
      delete process.env.OA_VAULT;
      const registry = new VaultRegistry();
      registry.vaults = [
        { name: 'team', path: vaultPath1 },
        { name: 'personal', path: vaultPath2 },
      ];

      assert.throws(
        () => resolveVault({}, registry, join(tmpDir, 'nonexistent')),
        /Registered vaults: team, personal/
      );
    } finally {
      if (originalOA) {
        process.env.OA_VAULT = originalOA;
      }
    }
  });

  await t.test('resolveVault E3 message offers 3 selection methods', () => {
    const originalOA = process.env.OA_VAULT;
    try {
      delete process.env.OA_VAULT;
      const registry = new VaultRegistry();
      registry.vaults = [];

      assert.throws(
        () => resolveVault({}, registry, join(tmpDir, 'nonexistent')),
        /1\. Use --vault flag/
      );
    } finally {
      if (originalOA) {
        process.env.OA_VAULT = originalOA;
      }
    }
  });

  await t.test('resolveVault E4 message lists available vaults', async () => {
    const registryPath = join(tmpDir, 'vault-e4-registry.json');
    const registry = new VaultRegistry(registryPath);
    await registry.load();
    await registry.register('team', vaultPath1);
    await registry.register('personal', vaultPath2);

    assert.throws(
      () => resolveVault({ vault: 'unknown' }, registry, vaultPath1),
      /Available vaults: team, personal/
    );
  });

  await t.test('resolveVault returns vaultName=null for env/fallback sources', () => {
    const originalOA = process.env.OA_VAULT;
    try {
      process.env.OA_VAULT = vaultPath1;
      const registry = new VaultRegistry();
      registry.vaults = [];

      const result = resolveVault({}, registry, vaultPath2);
      assert.equal(result.vaultName, null);
      assert(result.source !== 'flag');
    } finally {
      if (originalOA) {
        process.env.OA_VAULT = originalOA;
      } else {
        delete process.env.OA_VAULT;
      }
    }
  });
});
