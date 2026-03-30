import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { VaultRegistry } from '../src/vault-registry.mjs';
import { resolveVault } from '../src/vault-resolver.mjs';

test('VaultResolver', async (t) => {
  let tmpDir, vaultPath1, vaultPath2, vaultPath3, registryPath;

  t.before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vault-resolver-test-'));
    vaultPath1 = join(tmpDir, 'vault1');
    vaultPath2 = join(tmpDir, 'vault2');
    vaultPath3 = join(tmpDir, 'vault3');
    mkdirSync(vaultPath1, { recursive: true });
    mkdirSync(vaultPath2, { recursive: true });
    mkdirSync(vaultPath3, { recursive: true });
    registryPath = join(tmpDir, 'vaults.json');
  });

  t.after(() => {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch (err) {
      // ignore
    }
  });

  // Test 1: Uses --vault flag when provided
  await t.test('Uses --vault flag when provided', async () => {
    const registry = new VaultRegistry(registryPath);
    await registry.load();
    await registry.register('team', vaultPath1);

    const result = resolveVault({ vault: 'team' }, registry, tmpDir);

    assert.equal(result.vaultPath, vaultPath1);
    assert.equal(result.vaultName, 'team');
    assert.equal(result.source, 'flag');
  });

  // Test 2: Falls back to OA_VAULT when --vault not set
  await t.test('Falls back to OA_VAULT when --vault not set', async () => {
    const registry = new VaultRegistry(registryPath);
    await registry.load();

    const originalEnv = process.env.OA_VAULT;
    try {
      process.env.OA_VAULT = vaultPath2;
      const result = resolveVault({}, registry, tmpDir);

      assert.equal(result.vaultPath, vaultPath2);
      assert.equal(result.vaultName, null);
      assert.equal(result.source, 'env');
    } finally {
      if (originalEnv) {
        process.env.OA_VAULT = originalEnv;
      } else {
        delete process.env.OA_VAULT;
      }
    }
  });

  // Test 3: Falls back to registry default when neither flag nor env
  await t.test('Falls back to registry default when neither flag nor env', async () => {
    const registryPath2 = join(tmpDir, 'vaults2.json');
    const registry = new VaultRegistry(registryPath2);
    await registry.load();
    await registry.register('personal', vaultPath3);

    const originalEnv = process.env.OA_VAULT;
    try {
      delete process.env.OA_VAULT;
      const result = resolveVault({}, registry, tmpDir);

      assert.equal(result.vaultPath, vaultPath3);
      assert.equal(result.vaultName, 'personal');
      assert.equal(result.source, 'registry');
    } finally {
      if (originalEnv) {
        process.env.OA_VAULT = originalEnv;
      }
    }
  });

  // Test 4: Uses fallback path when nothing available
  await t.test('Uses fallback path when nothing available', async () => {
    const registryPath2 = join(tmpDir, 'vaults3.json');
    const registry = new VaultRegistry(registryPath2);
    await registry.load();

    const originalEnv = process.env.OA_VAULT;
    try {
      delete process.env.OA_VAULT;
      const result = resolveVault({}, registry, tmpDir);

      assert.equal(result.vaultPath, resolve(tmpDir));
      assert.equal(result.vaultName, null);
      assert.equal(result.source, 'fallback');
    } finally {
      if (originalEnv) {
        process.env.OA_VAULT = originalEnv;
      }
    }
  });

  // Test 5: Validates vault path exists
  await t.test('Validates vault path exists (flag)', async () => {
    const registry = new VaultRegistry(registryPath);
    await registry.load();
    await registry.register('nonexistent', vaultPath1);

    // Remove the vault directory
    rmSync(vaultPath1, { recursive: true });

    assert.throws(
      () => resolveVault({ vault: 'nonexistent' }, registry, tmpDir),
      (err) => err.message.includes('E2')
    );
  });

  // Test 6: Returns vault name in result
  await t.test('Returns vault name in result (flag)', async () => {
    const registryPath2 = join(tmpDir, 'vaults4.json');
    mkdirSync(vaultPath1, { recursive: true }); // Recreate
    const registry = new VaultRegistry(registryPath2);
    await registry.load();
    await registry.register('work', vaultPath1);

    const result = resolveVault({ vault: 'work' }, registry, tmpDir);

    assert.equal(result.vaultName, 'work');
    assert.ok(result.vaultPath);
  });

  // Test 7: Returns source in result
  await t.test('Returns source in result', async () => {
    const registryPath2 = join(tmpDir, 'vaults5.json');
    const registry = new VaultRegistry(registryPath2);
    await registry.load();

    const originalEnv = process.env.OA_VAULT;
    try {
      process.env.OA_VAULT = vaultPath2;
      const result = resolveVault({}, registry, tmpDir);

      assert.ok(['flag', 'env', 'registry', 'fallback'].includes(result.source));
      assert.equal(result.source, 'env');
    } finally {
      if (originalEnv) {
        process.env.OA_VAULT = originalEnv;
      } else {
        delete process.env.OA_VAULT;
      }
    }
  });

  // Test 8: Throws E2 error for invalid flag vault path
  await t.test('Throws E2 error for invalid flag vault path', async () => {
    const registryPath2 = join(tmpDir, 'vaults6.json');
    const registry = new VaultRegistry(registryPath2);
    await registry.load();
    const nonexistentPath = join(tmpDir, 'does-not-exist');
    // Register with valid path, then remove it
    mkdirSync(nonexistentPath, { recursive: true });
    await registry.register('deleted', nonexistentPath);
    rmSync(nonexistentPath, { recursive: true });

    assert.throws(
      () => resolveVault({ vault: 'deleted' }, registry, tmpDir),
      (err) => err.message.includes('E2')
    );
  });

  // Test 9: Throws E3 error when no vault available
  await t.test('Throws E3 error when no vault available', async () => {
    const registryPath2 = join(tmpDir, 'vaults7.json');
    const registry = new VaultRegistry(registryPath2);
    await registry.load();

    const originalEnv = process.env.OA_VAULT;
    try {
      delete process.env.OA_VAULT;
      // Pass non-existent fallback path
      assert.throws(
        () => resolveVault({}, registry, join(tmpDir, 'nonexistent')),
        (err) => err.message.includes('E3')
      );
    } finally {
      if (originalEnv) {
        process.env.OA_VAULT = originalEnv;
      }
    }
  });

  // Test 10: Throws E4 error for unknown vault name
  await t.test('Throws E4 error for unknown vault name', async () => {
    const registryPath2 = join(tmpDir, 'vaults8.json');
    const registry = new VaultRegistry(registryPath2);
    await registry.load();
    await registry.register('known', vaultPath1);

    assert.throws(
      () => resolveVault({ vault: 'unknown' }, registry, tmpDir),
      (err) => err.message.includes('E4')
    );
  });

  // Test 11: Precedence order is respected (flag > env > registry > fallback)
  await t.test('Precedence order is respected (flag > env > registry > fallback)', async () => {
    const registryPath2 = join(tmpDir, 'vaults9.json');
    const envVault = join(tmpDir, 'env-vault');
    const registryVault = join(tmpDir, 'registry-vault');
    const fallbackVault = join(tmpDir, 'fallback-vault');

    mkdirSync(envVault, { recursive: true });
    mkdirSync(registryVault, { recursive: true });
    mkdirSync(fallbackVault, { recursive: true });

    const registry = new VaultRegistry(registryPath2);
    await registry.load();
    await registry.register('registered', registryVault);

    const originalEnv = process.env.OA_VAULT;
    try {
      // Test with all levels set
      process.env.OA_VAULT = envVault;

      // Flag should win over env
      let result = resolveVault({ vault: 'registered' }, registry, fallbackVault);
      assert.equal(result.source, 'flag');
      assert.equal(result.vaultPath, registryVault);

      // Env should win over registry
      result = resolveVault({}, registry, fallbackVault);
      assert.equal(result.source, 'env');
      assert.equal(result.vaultPath, envVault);

      // Registry should win over fallback
      delete process.env.OA_VAULT;
      result = resolveVault({}, registry, fallbackVault);
      assert.equal(result.source, 'registry');
      assert.equal(result.vaultPath, registryVault);

      // Fallback as last resort
      const registryPath3 = join(tmpDir, 'vaults10.json');
      const registry2 = new VaultRegistry(registryPath3);
      await registry2.load();
      result = resolveVault({}, registry2, fallbackVault);
      assert.equal(result.source, 'fallback');
      assert.equal(result.vaultPath, fallbackVault);
    } finally {
      if (originalEnv) {
        process.env.OA_VAULT = originalEnv;
      } else {
        delete process.env.OA_VAULT;
      }
    }
  });

  // Test 12: Clear error messages with recovery suggestions
  await t.test('Clear error messages with recovery suggestions', async () => {
    const registryPath2 = join(tmpDir, 'vaults11.json');
    const registry = new VaultRegistry(registryPath2);
    await registry.load();
    await registry.register('vault-a', vaultPath1);

    // E4 error should mention available vaults
    try {
      resolveVault({ vault: 'nonexistent' }, registry, tmpDir);
      assert.fail('Should throw E4 error');
    } catch (err) {
      assert.ok(err.message.includes('E4'));
      assert.ok(err.message.includes('vault-a'));
      assert.ok(err.message.includes('clausidian vault list'));
    }

    // E3 error should mention 3 ways to select
    try {
      const registry2 = new VaultRegistry(join(tmpDir, 'vaults12.json'));
      await registry2.load();
      resolveVault({}, registry2, join(tmpDir, 'nonexistent'));
      assert.fail('Should throw E3 error');
    } catch (err) {
      assert.ok(err.message.includes('E3'));
      assert.ok(err.message.includes('--vault flag'));
      assert.ok(err.message.includes('OA_VAULT'));
      assert.ok(err.message.includes('vault default'));
    }
  });

  // Test 13: Works with both absolute and relative paths
  await t.test('Works with both absolute and relative paths', async () => {
    const registryPath2 = join(tmpDir, 'vaults13.json');
    const registry = new VaultRegistry(registryPath2);
    await registry.load();
    await registry.register('absolute', vaultPath2);

    // Test with absolute path in flag
    let result = resolveVault({ vault: 'absolute' }, registry, tmpDir);
    assert.ok(resolve(result.vaultPath) === result.vaultPath);
    assert.equal(result.vaultPath, vaultPath2);

    // Test with relative path in OA_VAULT (relative to cwd)
    const originalEnv = process.env.OA_VAULT;
    try {
      process.env.OA_VAULT = vaultPath3;
      result = resolveVault({}, registry, tmpDir);
      // Should be resolved to absolute
      assert.ok(resolve(result.vaultPath) === result.vaultPath);
      assert.equal(result.vaultPath, vaultPath3);
    } finally {
      if (originalEnv) {
        process.env.OA_VAULT = originalEnv;
      } else {
        delete process.env.OA_VAULT;
      }
    }
  });
});
