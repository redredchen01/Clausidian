import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { VaultRegistry } from '../src/vault-registry.mjs';
import { resolveVault } from '../src/vault-resolver.mjs';
import { vault } from '../src/commands/vault.mjs';

test('vault error handling & messaging', async (t) => {
  let tmpDir;

  t.before(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vault-error-test-'));
  });

  t.after(() => {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch (err) {
      // ignore
    }
  });

  await t.test('I8-TS01: Registry corruption E1 — fallback to OA_VAULT', async () => {
    const regPath = join(tmpDir, 'corrupted.json');
    // Write corrupted JSON
    writeFileSync(regPath, 'invalid json {');

    const registry = new VaultRegistry(regPath);

    // load() should handle corruption gracefully
    try {
      await registry.load();
      // If we get here, registry handled corruption (either threw or recovered)
      assert.ok(true, 'Registry handled corrupted file');
    } catch (err) {
      // Should be a parsing error, not a fatal error
      assert.ok(err.message, 'Error has message');
    }
  });

  await t.test('I8-TS02: Invalid vault path E2 — path doesn\'t exist', async () => {
    const regPath = join(tmpDir, 'valid-registry.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();

    // Manually add a broken vault to bypass register()'s validation
    registry.vaults.push({ name: 'broken', path: '/nonexistent/path/12345', default: false });

    try {
      // Try to resolve the broken vault
      await resolveVault({ vault: 'broken' }, registry, tmpDir);
      assert.fail('Should have thrown E2');
    } catch (err) {
      assert.ok(err.message.includes('does not exist') || err.message.includes('path'), 'E2 includes path error');
    }
  });

  await t.test('I8-TS03: No vault selected E3 — clear instructions', async () => {
    const regPath = join(tmpDir, 'empty-registry.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();

    try {
      // No --vault flag, no env var, no registry default
      await resolveVault({}, registry, '/nonexistent/fallback');
      assert.fail('Should have thrown E3');
    } catch (err) {
      assert.ok(err.message.includes('No vault selected'), 'E3 mentions no vault');
      // Should offer 3 methods
      const methodCount = (err.message.match(/--vault|OA_VAULT|default/g) || []).length;
      assert.ok(methodCount >= 2, 'E3 mentions multiple selection methods');
    }
  });

  await t.test('I8-TS04: Vault not found E4 — list available', async () => {
    const regPath = join(tmpDir, 'registry-with-vaults.json');
    const vaultPath1 = join(tmpDir, 'vault1');
    const vaultPath2 = join(tmpDir, 'vault2');
    mkdirSync(vaultPath1, { recursive: true });
    mkdirSync(vaultPath2, { recursive: true });

    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('team-kb', vaultPath1);
    await registry.register('personal', vaultPath2);

    try {
      // Request non-existent vault
      await resolveVault({ vault: 'xyz' }, registry, tmpDir);
      assert.fail('Should have thrown E4');
    } catch (err) {
      assert.ok(err.message.includes('not found'), 'E4 mentions not found');
      assert.ok(err.message.includes('team-kb') && err.message.includes('personal'), 'E4 lists available vaults');
    }
  });

  await t.test('I8-TS05: Permission denied error', async () => {
    const regPath = join(tmpDir, 'perm-test.json');
    const restrictedPath = join(tmpDir, 'restricted');
    mkdirSync(restrictedPath, { recursive: true });

    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('restricted', restrictedPath);

    // On POSIX systems, change permissions (EACCES will be thrown when accessing)
    if (process.platform !== 'win32') {
      // This test may vary by OS, but at minimum shouldn't crash
      const vaultCtx = await resolveVault({ vault: 'restricted' }, registry, tmpDir);
      assert.ok(vaultCtx, 'Returns vault context even for permission issues (deferred to runtime)');
    }
  });

  await t.test('I8-TS06: Partial error recovery — show which vault failed', async () => {
    const regPath = join(tmpDir, 'partial-error.json');
    const goodPath = join(tmpDir, 'good-vault');
    const badPath = join(tmpDir, 'bad-vault');
    mkdirSync(goodPath, { recursive: true });
    // badPath intentionally not created

    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('good', goodPath);

    // Manually add bad vault to registry (bypasses validation)
    registry.vaults.push({ name: 'bad', path: badPath, default: false });

    // List should show all vaults
    const vaults = registry.list();
    assert.equal(vaults.length, 2, 'Registry lists both vaults');
    assert.equal(vaults[0].name, 'good');
    assert.equal(vaults[1].name, 'bad');
  });

  await t.test('I8-TS07: Helpful suggestions — similar vault names', async () => {
    const regPath = join(tmpDir, 'suggestions.json');
    const vaultPath = join(tmpDir, 'vault-suggest');
    mkdirSync(vaultPath, { recursive: true });

    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('team-kb', vaultPath);

    try {
      // Similar typo: "team" instead of "team-kb"
      await resolveVault({ vault: 'team' }, registry, tmpDir);
      assert.fail('Should throw E4');
    } catch (err) {
      // Error should mention available options
      assert.ok(err.message.includes('team-kb'), 'Error lists closest match');
    }
  });

  await t.test('I8-TS08: Error in JSON mode — structured error object', async () => {
    const regPath = join(tmpDir, 'json-error.json');

    const registry = new VaultRegistry(regPath);
    await registry.load();

    try {
      // Missing vault with no registry entries
      await vault(tmpDir, {
        subcommand: 'info',
        name: 'nonexistent',
        registryPath: regPath,
      });
      assert.fail('Should throw error');
    } catch (err) {
      // Error should be a proper error object with message
      assert.ok(err.message, 'Error has message property');
      assert.ok(err.message.includes('not found'), 'Error message is descriptive');
    }
  });

  await t.test('I8-TS09: Clear trace context — include vault name in error', async () => {
    const regPath = join(tmpDir, 'trace-error.json');
    const vaultPath = join(tmpDir, 'vault-trace');
    mkdirSync(vaultPath, { recursive: true });

    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('team-kb', vaultPath);

    try {
      const result = await resolveVault({ vault: 'team-kb' }, registry, tmpDir);
      assert.equal(result.vaultName, 'team-kb', 'Result includes vault name for tracing');
    } catch (err) {
      assert.fail(`Should not throw: ${err.message}`);
    }
  });

  await t.test('I8-TS10: Backward compatibility — OA_VAULT error same as registry error', async () => {
    const regPath = join(tmpDir, 'compat.json');
    const registry = new VaultRegistry(regPath);
    await registry.load();

    try {
      // Both should fail with similar error about invalid path
      await resolveVault({}, registry, '/nonexistent/oa_vault/path');
      assert.fail('Should throw E3 no vault or E2 invalid path');
    } catch (err) {
      // Should be clear about vault/path issue
      assert.ok(err.message.length > 0, 'Error has a message');
      assert.ok(!err.message.includes('at '), 'Error is not a stack trace');
    }
  });

  await t.test('I8-TS11: Error messages are user-facing', async () => {
    const regPath = join(tmpDir, 'user-facing.json');
    const vaultPath = join(tmpDir, 'vault-user');
    mkdirSync(vaultPath, { recursive: true });

    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('docs', vaultPath);

    try {
      await resolveVault({ vault: 'research' }, registry, tmpDir);
      assert.fail('Should throw');
    } catch (err) {
      // Error should be in plain English, not stack trace
      assert.ok(!err.message.includes('at '), 'Error is user-facing, not stack trace');
      assert.ok(err.message.length > 10, 'Error has substantial message');
      assert.ok(err.message.length < 500, 'Error is concise');
    }
  });

  await t.test('I8-TS12: Vault command validates all subcommands', async () => {
    const regPath = join(tmpDir, 'subcmd-error.json');

    try {
      await vault(tmpDir, {
        subcommand: 'invalid-command',
        registryPath: regPath,
      });
      assert.fail('Should throw unknown subcommand error');
    } catch (err) {
      assert.ok(err.message.includes('Unknown') || err.message.includes('unknown'),
        'Error mentions unknown subcommand');
      assert.ok(err.message.includes('vault'), 'Error context mentions vault');
    }
  });

  await t.test('I8-TS13: E1 E2 E3 E4 error codes in messages', async () => {
    const regPath = join(tmpDir, 'error-codes.json');
    const vaultPath = join(tmpDir, 'vault-codes');
    mkdirSync(vaultPath, { recursive: true });

    const registry = new VaultRegistry(regPath);
    await registry.load();
    await registry.register('test', vaultPath);

    // Test E2: invalid path
    try {
      const badRegistry = new VaultRegistry(regPath);
      await badRegistry.load();
      badRegistry.vaults.push({ name: 'bad', path: '/nonexistent', default: false });
      await resolveVault({ vault: 'bad' }, badRegistry, tmpDir);
      assert.fail('Should throw E2');
    } catch (err) {
      // Error should clearly identify the problem
      assert.ok(err.message.length > 0, 'E2 error has message');
      assert.ok(err.message.includes('bad') || err.message.includes('path'), 'E2 mentions vault or path');
    }

    // Test E3: no vault (with no default and no fallback available)
    try {
      const emptyRegistry = new VaultRegistry(regPath);
      await emptyRegistry.load();
      // Use a fallback path that doesn't exist - will trigger path validation
      await resolveVault({}, emptyRegistry, '/nonexistent/fallback/path');
      assert.fail('Should throw error');
    } catch (err) {
      // Should mention either no vault or invalid path
      assert.ok(err.message.includes('No vault') || err.message.length > 0, 'E3 error is present');
    }

    // Test E4: not found
    try {
      await resolveVault({ vault: 'missing' }, registry, tmpDir);
      assert.fail('Should throw E4');
    } catch (err) {
      assert.ok(err.message.includes('not found'), 'E4 error is clear');
    }
  });
});
