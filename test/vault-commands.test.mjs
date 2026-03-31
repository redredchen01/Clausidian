import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { vault } from '../src/commands/vault.mjs';
import { VaultRegistry } from '../src/vault-registry.mjs';

test('vault commands', async (t) => {
  let tmpDir, vaultRoot, testVault1, testVault2;

  t.before(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vault-cmd-test-'));
    vaultRoot = tmpDir;

    // Create test vaults
    testVault1 = join(tmpDir, 'vault1');
    testVault2 = join(tmpDir, 'vault2');
    mkdirSync(testVault1, { recursive: true });
    mkdirSync(testVault2, { recursive: true });
  });

  t.after(() => {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch (err) {
      // ignore
    }
  });

  await t.test('scenario 1: vault list shows all vaults', async () => {
    const regPath = join(tmpDir, 'scenario1.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('vault1', testVault1);
    await registry.register('vault2', testVault2);

    const result = await vault(vaultRoot, {
      subcommand: 'list',
      registryPath: regPath,
    });

    assert.equal(result.status, 'list');
    assert.equal(result.vaults.length, 2);
    assert.equal(result.vaults[0].name, 'vault1');
    assert.equal(result.vaults[1].name, 'vault2');
    assert.equal(result.vaults[0].default, true); // First vault is default
    assert.equal(result.vaults[1].default, false);
  });

  await t.test('scenario 2: vault register adds new vault', async () => {
    const regPath = join(tmpDir, 'scenario2.json');

    const result = await vault(vaultRoot, {
      subcommand: 'register',
      name: 'newvault',
      path: testVault1,
      registryPath: regPath,
    });

    assert.equal(result.status, 'registered');
    assert.equal(result.name, 'newvault');
    assert.equal(result.path, testVault1);
  });

  await t.test('scenario 3: vault register auto-sets first as default', async () => {
    const regPath = join(tmpDir, 'scenario3.json');

    const result = await vault(vaultRoot, {
      subcommand: 'register',
      name: 'first',
      path: testVault1,
      registryPath: regPath,
    });

    assert.equal(result.isDefault, true);

    // Verify registry reflects this
    const reloaded = new VaultRegistry(regPath);
    await reloaded.load();
    assert.equal(reloaded.defaultVaultName, 'first');
  });

  await t.test('scenario 4: vault register validates path exists', async () => {
    const regPath = join(tmpDir, 'scenario4.json');

    try {
      await vault(vaultRoot, {
        subcommand: 'register',
        name: 'invalid',
        path: '/nonexistent/path/12345',
        registryPath: regPath,
      });
      assert.fail('Should throw error for nonexistent path');
    } catch (err) {
      assert(err.message.includes('does not exist'));
    }
  });

  await t.test('scenario 5: vault register rejects duplicate names', async () => {
    const regPath = join(tmpDir, 'scenario5.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('duplicate', testVault1);

    try {
      await vault(vaultRoot, {
        subcommand: 'register',
        name: 'duplicate',
        path: testVault2,
        registryPath: regPath,
      });
      assert.fail('Should throw error for duplicate name');
    } catch (err) {
      assert(err.message.includes('already registered'));
    }
  });

  await t.test('scenario 6: vault default changes default vault', async () => {
    const regPath = join(tmpDir, 'scenario6.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('v1', testVault1);
    await registry.register('v2', testVault2);

    const result = await vault(vaultRoot, {
      subcommand: 'default',
      name: 'v2',
      registryPath: regPath,
    });

    assert.equal(result.status, 'set-default');
    assert.equal(result.name, 'v2');

    // Verify change persisted
    const reloaded = new VaultRegistry(regPath);
    await reloaded.load();
    assert.equal(reloaded.defaultVaultName, 'v2');
  });

  await t.test('scenario 7: vault default rejects invalid vault', async () => {
    const regPath = join(tmpDir, 'scenario7.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('valid', testVault1);

    try {
      await vault(vaultRoot, {
        subcommand: 'default',
        name: 'nonexistent',
        registryPath: regPath,
      });
      assert.fail('Should throw error for nonexistent vault');
    } catch (err) {
      assert(err.message.includes('not found'));
    }
  });

  await t.test('scenario 8: vault info shows vault details', async () => {
    const regPath = join(tmpDir, 'scenario8.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('infotest', testVault1);

    const result = await vault(vaultRoot, {
      subcommand: 'info',
      name: 'infotest',
      registryPath: regPath,
    });

    assert.equal(result.status, 'info');
    assert.equal(result.name, 'infotest');
    assert.equal(result.path, testVault1);
    assert.equal(result.default, true); // First registered is default
  });

  await t.test('scenario 9: vault info fails for unknown vault', async () => {
    const regPath = join(tmpDir, 'scenario9.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('known', testVault1);

    try {
      await vault(vaultRoot, {
        subcommand: 'info',
        name: 'unknown',
        registryPath: regPath,
      });
      assert.fail('Should throw error for unknown vault');
    } catch (err) {
      assert(err.message.includes('not found'));
    }
  });

  await t.test('scenario 10: vault remove deletes vault', async () => {
    const regPath = join(tmpDir, 'scenario10.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('removable', testVault1);

    const result = await vault(vaultRoot, {
      subcommand: 'remove',
      name: 'removable',
      registryPath: regPath,
    });

    assert.equal(result.status, 'removed');
    assert.equal(result.name, 'removable');

    // Verify removed from registry
    const reloaded = new VaultRegistry(regPath);
    await reloaded.load();
    assert.equal(reloaded.vaults.length, 0);
  });

  await t.test('scenario 11: vault remove fails for unknown vault', async () => {
    const regPath = join(tmpDir, 'scenario11.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('exists', testVault1);

    try {
      await vault(vaultRoot, {
        subcommand: 'remove',
        name: 'notfound',
        registryPath: regPath,
      });
      assert.fail('Should throw error for unknown vault');
    } catch (err) {
      assert(err.message.includes('not found'));
    }
  });

  await t.test('scenario 12: JSON output format is consistent', async () => {
    const regPath = join(tmpDir, 'scenario12.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('fmt', testVault1);
    await registry.register('fmt2', testVault2);

    // Test all response formats have status field
    const listResult = await vault(vaultRoot, {
      subcommand: 'list',
      registryPath: regPath,
    });
    assert(listResult.status);
    assert(listResult.vaults);

    const registerResult = await vault(vaultRoot, {
      subcommand: 'register',
      name: 'fmt3',
      path: testVault1,
      registryPath: regPath,
    });
    assert(registerResult.status);
    assert(registerResult.name);
    assert(registerResult.path);
    assert(typeof registerResult.isDefault === 'boolean');

    const defaultResult = await vault(vaultRoot, {
      subcommand: 'default',
      name: 'fmt2',
      registryPath: regPath,
    });
    assert(defaultResult.status);
    assert(defaultResult.name);

    const infoResult = await vault(vaultRoot, {
      subcommand: 'info',
      name: 'fmt',
      registryPath: regPath,
    });
    assert(infoResult.status);
    assert(infoResult.name);
    assert(infoResult.path);
    assert(typeof infoResult.default === 'boolean');

    const removeResult = await vault(vaultRoot, {
      subcommand: 'remove',
      name: 'fmt3',
      registryPath: regPath,
    });
    assert(removeResult.status);
    assert(removeResult.name);
  });

  await t.test('vault command with unknown subcommand throws error', async () => {
    const regPath = join(tmpDir, 'scenario-unknown.json');

    try {
      await vault(vaultRoot, {
        subcommand: 'invalid',
        registryPath: regPath,
      });
      assert.fail('Should throw error for unknown subcommand');
    } catch (err) {
      assert(err.message.includes('Unknown vault subcommand'));
    }
  });

  await t.test('vault register requires name argument', async () => {
    const regPath = join(tmpDir, 'scenario-no-name.json');

    try {
      await vault(vaultRoot, {
        subcommand: 'register',
        path: testVault1,
        registryPath: regPath,
      });
      assert.fail('Should throw error for missing name');
    } catch (err) {
      assert(err.message.includes('Missing required argument'));
    }
  });

  await t.test('vault register requires path argument', async () => {
    const regPath = join(tmpDir, 'scenario-no-path.json');

    try {
      await vault(vaultRoot, {
        subcommand: 'register',
        name: 'test',
        registryPath: regPath,
      });
      assert.fail('Should throw error for missing path');
    } catch (err) {
      assert(err.message.includes('Missing required argument'));
    }
  });

  await t.test('vault default requires name argument', async () => {
    const regPath = join(tmpDir, 'scenario-default-no-name.json');

    try {
      await vault(vaultRoot, {
        subcommand: 'default',
        registryPath: regPath,
      });
      assert.fail('Should throw error for missing name');
    } catch (err) {
      assert(err.message.includes('Missing required argument'));
    }
  });

  await t.test('vault info requires name argument', async () => {
    const regPath = join(tmpDir, 'scenario-info-no-name.json');

    try {
      await vault(vaultRoot, {
        subcommand: 'info',
        registryPath: regPath,
      });
      assert.fail('Should throw error for missing name');
    } catch (err) {
      assert(err.message.includes('Missing required argument'));
    }
  });

  await t.test('vault remove requires name argument', async () => {
    const regPath = join(tmpDir, 'scenario-remove-no-name.json');

    try {
      await vault(vaultRoot, {
        subcommand: 'remove',
        registryPath: regPath,
      });
      assert.fail('Should throw error for missing name');
    } catch (err) {
      assert(err.message.includes('Missing required argument'));
    }
  });

  await t.test('vault remove clears default if removing default vault', async () => {
    const regPath = join(tmpDir, 'scenario-remove-default.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('only', testVault1);

    // Verify default is set
    let reloaded = new VaultRegistry(regPath);
    await reloaded.load();
    assert.equal(reloaded.defaultVaultName, 'only');

    // Remove the default vault
    await vault(vaultRoot, {
      subcommand: 'remove',
      name: 'only',
      registryPath: regPath,
    });

    // Verify default is cleared
    reloaded = new VaultRegistry(regPath);
    await reloaded.load();
    assert.equal(reloaded.defaultVaultName, null);
    assert.equal(reloaded.vaults.length, 0);
  });
});
