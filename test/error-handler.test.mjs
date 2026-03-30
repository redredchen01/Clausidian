import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError, ValidationError, VaultError, parseError } from '../src/error-handler.mjs';

describe('Error Handler', () => {
  it('creates NotFoundError with name and context', async () => {
    const err = new NotFoundError('test-note', 'Note');
    assert.strictEqual(err.message, 'Note not found: test-note');
    assert.strictEqual(err.name, 'NotFoundError');
    assert.strictEqual(err.resourceName, 'test-note');
    assert.strictEqual(err.context, 'Note');
  });

  it('creates NotFoundError without context', async () => {
    const err = new NotFoundError('test-note');
    assert.strictEqual(err.message, 'Not found: test-note');
    assert.strictEqual(err.resourceName, 'test-note');
    assert.strictEqual(err.context, '');
  });

  it('creates ValidationError with message', async () => {
    const err = new ValidationError('Invalid input');
    assert.strictEqual(err.message, 'Invalid input');
    assert.strictEqual(err.name, 'ValidationError');
  });

  it('creates VaultError with message', async () => {
    const err = new VaultError('Vault operation failed');
    assert.strictEqual(err.message, 'Vault operation failed');
    assert.strictEqual(err.name, 'VaultError');
  });

  it('parses NotFoundError correctly', async () => {
    const err = new NotFoundError('resource-id', 'File');
    const parsed = parseError(err);
    assert.strictEqual(parsed.name, 'NotFoundError');
    assert.strictEqual(parsed.message, 'File not found: resource-id');
    assert.strictEqual(parsed.context, 'File');
  });

  it('parses ValidationError correctly', async () => {
    const err = new ValidationError('Required field missing');
    const parsed = parseError(err);
    assert.strictEqual(parsed.name, 'ValidationError');
    assert.strictEqual(parsed.message, 'Required field missing');
    assert.strictEqual(parsed.context, '');
  });

  it('parses VaultError correctly', async () => {
    const err = new VaultError('Cannot write to vault');
    const parsed = parseError(err);
    assert.strictEqual(parsed.name, 'VaultError');
    assert.strictEqual(parsed.message, 'Cannot write to vault');
    assert.strictEqual(parsed.context, '');
  });

  it('parses generic Error correctly', async () => {
    const err = new Error('Something went wrong');
    const parsed = parseError(err);
    assert.strictEqual(parsed.name, 'Error');
    assert.strictEqual(parsed.message, 'Something went wrong');
    assert.strictEqual(parsed.context, '');
  });

  it('parses string error gracefully', async () => {
    const err = 'string error message';
    const parsed = parseError(err);
    assert.strictEqual(parsed.name, 'Error');
    assert.strictEqual(parsed.message, 'string error message');
  });

  it('parses object without error properties', async () => {
    const err = { foo: 'bar' };
    const parsed = parseError(err);
    assert.strictEqual(parsed.name, 'Error');
    assert.strictEqual(typeof parsed.message, 'string');
  });

  it('NotFoundError is instanceof Error', async () => {
    const err = new NotFoundError('test');
    assert(err instanceof Error);
    assert(err instanceof NotFoundError);
  });

  it('ValidationError is instanceof Error', async () => {
    const err = new ValidationError('test');
    assert(err instanceof Error);
    assert(err instanceof ValidationError);
  });

  it('VaultError is instanceof Error', async () => {
    const err = new VaultError('test');
    assert(err instanceof Error);
    assert(err instanceof VaultError);
  });
});
