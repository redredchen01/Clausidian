/**
 * Tests for utility modules: vault-validator, args-parser
 */
import assert from 'assert';
import { test } from 'node:test';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { validateVaultRoot, getVaultRoot } from '../src/vault-validator.mjs';
import { normalizeFlags, parseArgs, validateRequiredFlags, validateAllowedValues } from '../src/args-parser.mjs';

test('Vault Validator', async (t) => {
  const TMP_VALIDATOR = '/tmp/clausidian-validator-' + Date.now();

  await t.test('validateVaultRoot rejects missing directory', () => {
    assert.throws(() => validateVaultRoot('/nonexistent/path'), /does not exist/);
  });

  await t.test('validateVaultRoot accepts valid vault with _index.md', () => {
    try {
      mkdirSync(TMP_VALIDATOR, { recursive: true });
      writeFileSync(join(TMP_VALIDATOR, '_index.md'), '# Index');
      const result = validateVaultRoot(TMP_VALIDATOR);
      assert.ok(result);
    } finally {
      rmSync(TMP_VALIDATOR, { recursive: true, force: true });
    }
  });

  await t.test('validateVaultRoot accepts .clausidian.json marker', () => {
    const tmpdir = TMP_VALIDATOR + '-clausidian';
    try {
      mkdirSync(tmpdir, { recursive: true });
      writeFileSync(join(tmpdir, '.clausidian.json'), '{}');
      const result = validateVaultRoot(tmpdir);
      assert.ok(result);
    } finally {
      rmSync(tmpdir, { recursive: true, force: true });
    }
  });

  await t.test('validateVaultRoot rejects invalid directory', () => {
    const tmpdir = TMP_VALIDATOR + '-invalid';
    try {
      mkdirSync(tmpdir, { recursive: true });
      assert.throws(() => validateVaultRoot(tmpdir), /Invalid vault/);
    } finally {
      rmSync(tmpdir, { recursive: true, force: true });
    }
  });
});

test('Args Parser', async (t) => {
  await t.test('normalizeFlags converts kebab-case to camelCase', () => {
    const result = normalizeFlags({ 'dry-run': true, 'set-status': 'active' });
    assert.deepEqual(result, { dryRun: true, setStatus: 'active' });
  });

  await t.test('normalizeFlags handles boolean strings', () => {
    const result = normalizeFlags({ 'flag': 'true', 'other': 'false' });
    assert.deepEqual(result, { flag: true, other: false });
  });

  await t.test('normalizeFlags preserves string values', () => {
    const result = normalizeFlags({ 'file': 'output.txt', 'mode': 'verbose' });
    assert.deepEqual(result, { file: 'output.txt', mode: 'verbose' });
  });

  await t.test('parseArgs splits positional and flag arguments', () => {
    const result = parseArgs(['note-name', '--vault', '/path', '--dry-run']);
    assert.deepEqual(result.flags, { vault: '/path', dryRun: true });
    assert.deepEqual(result.positional, ['note-name']);
  });

  await t.test('parseArgs handles short flags', () => {
    const result = parseArgs(['-v', '/path', '-d', 'file.md']);
    assert.deepEqual(result.flags, { v: '/path', d: 'file.md' });
  });

  await t.test('validateRequiredFlags throws on missing flags', () => {
    const flags = { vault: '/path' };
    assert.throws(() => validateRequiredFlags(flags, ['vault', 'type']), /Missing required/);
  });

  await t.test('validateAllowedValues throws on invalid value', () => {
    const flags = { status: 'invalid' };
    assert.throws(
      () => validateAllowedValues(flags, 'status', ['active', 'archived']),
      /Invalid value/
    );
  });

  await t.test('validateAllowedValues accepts valid value', () => {
    const flags = { status: 'active' };
    assert.doesNotThrow(() => validateAllowedValues(flags, 'status', ['active', 'archived']));
  });
});
