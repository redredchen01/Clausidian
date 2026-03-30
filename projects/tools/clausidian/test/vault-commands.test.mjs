import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { vault } from '../src/commands/vault.mjs';
import { VaultRegistry } from '../src/vault-registry.mjs';

test('vault commands', async (t) => {
  let tmpDir, vaultRoot, registryPath, testVault1, testVault2;

  t.before(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vault-cmd-test-'));
    vaultRoot = tmpDir;
    registryPath = join(tmpDir, 'vaults.json');

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
    const registry = new VaultRegistry(registryPath);
    await registry.load();
    await registry.register('vault1', testVault1);
    await registry.register('vault2', testVault2);

    const result = await vault(vaultRoot, {
      subcommand: 'list',
    });

    assert.equal(result.status, 'list');
    assert.equal(result.vaults.length, 2);
    assert.equal(result.vaults[0].name, 'vault1');
    assert.equal(result.vaults[1].name, 'vault2');
    assert.equal(result.vaults[0].default, true); // First vault is default
    assert.equal(result.vaults[1].default, false);
  });

  await t.test('scenario 2: vault register adds new vault', async () => {
    const registry = new VaultRegistry(join(tmpDir, 'vaults2.json'));
    await registry.load();

    const result = await vault(vaultRoot, {
      subcommand: 'register',
      name: 'newvault',
      path: testVault1,
    });

    assert.equal(result.status, 'registered');
    assert.equal(result.name, 'newvault');
    assert.equal(result.path, testVault1);
  });

  await t.test('scenario 3: vault register auto-sets first as default', async () => {
    const registry = new VaultRegistry(join(tmpDir, 'vaults3.json'));
    await registry.load();

    const result = await vault(vaultRoot, {
      subcommand: 'register',
      name: 'first',
      path: testVault1,
    });

    assert.equal(result.isDefault, true);

    // Verify registry reflects this
    const reloaded = new VaultRegistry(join(tmpDir, 'vaults3.json'));
    await reloaded.load();
    assert.equal(reloaded.defaultVaultName, 'first');
  });

  await t.test('scenario 4: vault register validates path exists', async () => {
    const registry = new VaultRegistry(join(tmpDir, 'vaults4.json'));
    await registry.load();

    try {
      await vault(vaultRoot, {
        subcommand: 'register',
        name: 'invalid',
        path: '/nonexistent/path/12345',
      });
      assert.fail('Should throw error for nonexistent path');
    } catch (err) {
      assert(err.message.includes('does not exist'));
    }
  });

  await t.test('scenario 5: vault register rejects duplicate names', async () => {
    const registry = new VaultRegistry(join(tmpDir, 'vaults5.json'));
    await registry.load();
    await registry.register('duplicate', testVault1);

    try {
      await vault(vaultRoot, {
        subcommand: 'register',
        name: 'duplicate',
        path: testVault2,
      });
      assert.fail('Should throw error for duplicate name');
    } catch (err) {
      assert(err.message.includes('already registered'));
    }
  });

  await t.test('scenario 6: vault default changes default vault', async () => {
    const registry = new VaultRegistry(join(tmpDir, 'vaults6.json'));
    await registry.load();
    await registry.register('v1', testVault1);
    await registry.register('v2', testVault2);

    const result = await vault(vaultRoot, {
      subcommand: 'default',
      name: 'v2',
    });

    assert.equal(result.status, 'set-default');
    assert.equal(result.name, 'v2');

    // Verify change persisted
    const reloaded = new VaultRegistry(join(tmpDir, 'vaults6.json'));
    await reloaded.load();
    assert.equal(reloaded.defaultVaultName, 'v2');
  });

  await t.test('scenario 7: vault default rejects invalid vault', async () => {
    const registry = new VaultRegistry(join(tmpDir, 'vaults7.json'));
    await registry.load();
    await registry.register('valid', testVault1);

    try {
      await vault(vaultRoot, {
        subcommand: 'default',
        name: 'nonexistent',
      });
      assert.fail('Should throw error for nonexistent vault');
    } catch (err) {
      assert(err.message.includes('not found'));
    }
  });

  await t.test('scenario 8: vault info shows vault details', async () => {
    const registry = new VaultRegistry(join(tmpDir, 'vaults8.json'));
    await registry.load();
    await registry.register('infotest', testVault1);

    const result = await vault(vaultRoot, {
      subcommand: 'info',
      name: 'infotest',
    });

    assert.equal(result.status, 'info');
    assert.equal(result.name, 'infotest');
    assert.equal(result.path, testVault1);
    assert.equal(result.default, true); // First registered is default
  });

  await t.test('scenario 9: vault info fails for unknown vault', async () => {
    const registry = new VaultRegistry(join(tmpDir, 'vaults9.json'));
    await registry.load();
    await registry.register('known', testVault1);

    try {
      await vault(vaultRoot, {
        subcommand: 'info',
        name: 'unknown',
      });
      assert.fail('Should throw error for unknown vault');
    } catch (err) {
      assert(err.message.includes('not found'));
    }
  });

  await t.test('scenario 10: vault remove deletes vault', async () => {
    const registry = new VaultRegistry(join(tmpDir, 'vaults10.json'));
    await registry.load();
    await registry.register('removable', testVault1);

    const result = await vault(vaultRoot, {
      subcommand: 'remove',
      name: 'removable',
    });

    assert.equal(result.status, 'removed');
    assert.equal(result.name, 'removable');

    // Verify removed from registry
    const reloaded = new VaultRegistry(join(tmpDir, 'vaults10.json'));
    await reloaded.load();
    assert.equal(reloaded.vaults.length, 0);
  });

  await t.test('scenario 11: vault remove fails for unknown vault', async () => {
    const registry = new VaultRegistry(join(tmpDir, 'vaults11.json'));
    await registry.load();
    await registry.register('exists', testVault1);

    try {
      await vault(vaultRoot, {
        subcommand: 'remove',
        name: 'notfound',
      });
      assert.fail('Should throw error for unknown vault');
    } catch (err) {
      assert(err.message.includes('not found'));
    }
  });

  await t.test('scenario 12: JSON output format is consistent', async () => {
    const registry = new VaultRegistry(join(tmpDir, 'vaults12.json'));
    await registry.load();
    await registry.register('fmt', testVault1);
    await registry.register('fmt2', testVault2);

    // Test all response formats have status field
    const listResult = await vault(vaultRoot, { subcommand: 'list' });
    assert(listResult.status);
    assert(listResult.vaults);

    const registerResult = await vault(vaultRoot, {
      subcommand: 'register',
      name: 'fmt3',
      path: testVault1,
    });
    assert(registerResult.status);
    assert(registerResult.name);
    assert(registerResult.path);
    assert(typeof registerResult.isDefault === 'boolean');

    const defaultResult = await vault(vaultRoot, {
      subcommand: 'default',
      name: 'fmt2',
    });
    assert(defaultResult.status);
    assert(defaultResult.name);

    const infoResult = await vault(vaultRoot, {
      subcommand: 'info',
      name: 'fmt',
    });
    assert(infoResult.status);
    assert(infoResult.name);
    assert(infoResult.path);
    assert(typeof infoResult.default === 'boolean');

    const removeResult = await vault(vaultRoot, {
      subcommand: 'remove',
      name: 'fmt3',
    });
    assert(removeResult.status);
    assert(removeResult.name);
  });

  await t.test('vault command with unknown subcommand throws error', async () => {
    try {
      await vault(vaultRoot, { subcommand: 'invalid' });
      assert.fail('Should throw error for unknown subcommand');
    } catch (err) {
      assert(err.message.includes('Unknown vault subcommand'));
    }
  });

  await t.test('vault register requires name argument', async () => {
    try {
      await vault(vaultRoot, {
        subcommand: 'register',
        path: testVault1,
      });
      assert.fail('Should throw error for missing name');
    } catch (err) {
      assert(err.message.includes('Missing required argument'));
    }
  });

  await t.test('vault register requires path argument', async () => {
    try {
      await vault(vaultRoot, {
        subcommand: 'register',
        name: 'test',
      });
      assert.fail('Should throw error for missing path');
    } catch (err) {
      assert(err.message.includes('Missing required argument'));
    }
  });

  await t.test('vault default requires name argument', async () => {
    try {
      await vault(vaultRoot, {
        subcommand: 'default',
      });
      assert.fail('Should throw error for missing name');
    } catch (err) {
      assert(err.message.includes('Missing required argument'));
    }
  });

  await t.test('vault info requires name argument', async () => {
    try {
      await vault(vaultRoot, {
        subcommand: 'info',
      });
      assert.fail('Should throw error for missing name');
    } catch (err) {
      assert(err.message.includes('Missing required argument'));
    }
  });

  await t.test('vault remove requires name argument', async () => {
    try {
      await vault(vaultRoot, {
        subcommand: 'remove',
      });
      assert.fail('Should throw error for missing name');
    } catch (err) {
      assert(err.message.includes('Missing required argument'));
    }
  });

  await t.test('vault remove clears default if removing default vault', async () => {
    const registry = new VaultRegistry(join(tmpDir, 'vaults-default.json'));
    await registry.load();
    await registry.register('only', testVault1);

    // Verify default is set
    let reloaded = new VaultRegistry(join(tmpDir, 'vaults-default.json'));
    await reloaded.load();
    assert.equal(reloaded.defaultVaultName, 'only');

    // Remove the default vault
    await vault(vaultRoot, {
      subcommand: 'remove',
      name: 'only',
    });

    // Verify default is cleared
    reloaded = new VaultRegistry(join(tmpDir, 'vaults-default.json'));
    await reloaded.load();
    assert.equal(reloaded.defaultVaultName, null);
    assert.equal(reloaded.vaults.length, 0);
  });
});
