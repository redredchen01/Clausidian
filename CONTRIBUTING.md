# Contributing to clausidian

Contributions welcome! This guide explains the project structure and development workflow.

## Quick Start

```bash
git clone https://github.com/redredchen01/Clausidian.git
cd Clausidian
npm test              # Run all 168 tests
npm run test          # Same as above

node bin/cli.mjs help # Try the CLI
```

## Project Structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed module breakdown.

Key directories:
- `src/` — Core modules
- `src/commands/` — Individual command implementations
- `test/` — Test files (one per module)
- `scaffold/` — Default vault templates and agent configs
- `skill/` — `/obsidian` skill definition for Claude Code

## Development Workflow

### 1. Pick a Task

Check `CHANGELOG.md` [Unreleased] section or GitHub issues for ideas.

Priority areas:
- **New Commands** — Need a new CLI operation? Add to `src/commands/`
- **Performance** — Optimize search, indexing, large vault support
- **Testing** — Increase coverage for edge cases
- **Documentation** — Add JSDoc, improve README examples

### 2. Create a Feature Branch

```bash
git checkout -b feat/my-feature      # New feature
git checkout -b fix/my-bug          # Bug fix
git checkout -b perf/search-cache   # Performance improvement
```

### 3. Implement

#### Add a New Command

File: `src/commands/my-command.mjs`

```javascript
/**
 * My command description
 * @type {import('../types').CliCommand}
 */
export default {
  name: 'my-command',
  description: 'What it does',
  flags: {
    'flag-name': 'description of --flag-name',
  },
  async run(vaultPath, flags, positional) {
    const vault = new Vault(vaultPath);

    // Implementation here
    const result = await vault.search('keyword');

    if (flags.json) {
      return result; // Will be JSON-serialized
    }

    // Pretty-printed output
    console.log(`Found ${result.length} notes`);
    return { success: true };
  }
};
```

Then register in `src/registry.mjs`:
```javascript
import myCommand from './commands/my-command.mjs';

const commands = {
  'my-command': myCommand,
  // ... rest
};
```

#### Add Tests

File: `test/my-command.test.mjs`

```javascript
import test from 'node:test';
import assert from 'node:assert';
import MyCommand from '../src/commands/my-command.mjs';
import { createTestVault, cleanupTestVault } from './helpers.mjs';

test('my-command', async (t) => {
  const vault = await createTestVault();

  await t.test('does something useful', async () => {
    const result = await MyCommand.run(vault.path, {}, []);
    assert.equal(result.success, true);
  });

  await cleanupTestVault(vault);
});
```

Run tests:
```bash
npm test              # All tests
npm test -- --grep "my-command"  # Specific test
```

### 4. Update Docs

- Update relevant command in `README.md` examples
- Add to `CHANGELOG.md` [Unreleased] section
- Add JSDoc comments to new functions

JSDoc example:
```javascript
/**
 * Score document by BM25 algorithm
 * @param {string} query - Search query
 * @param {Object} document - Note with title, tags, body
 * @returns {number} BM25 score (0-1)
 */
function scoreDocument(query, document) {
  // Implementation
}
```

### 5. Commit & Push

```bash
git add src/commands/my-command.mjs test/my-command.test.mjs
git commit -m "feat: add my-command operation"
# Commit message format:
# feat:     New feature
# fix:      Bug fix
# perf:     Performance improvement
# docs:     Documentation
# refactor: Code refactoring
# test:     Test additions

git push origin feat/my-feature
```

### 6. Create Pull Request

Use this template:

```markdown
## Description
What does this PR do?

## Type of Change
- [ ] New command / feature
- [ ] Bug fix
- [ ] Performance improvement
- [ ] Documentation

## Testing
How should this be tested?

## Checklist
- [ ] Tests pass (`npm test`)
- [ ] New tests added for new code
- [ ] No console.error or warnings (run in --json mode)
- [ ] JSDoc added to new functions
- [ ] CHANGELOG.md updated
- [ ] README.md examples updated (if needed)
```

## Code Style

### General
- **No external dependencies** — Only Node.js built-ins
- **Async/await** over callbacks
- **Simple abstractions** — Prefer readable code over clever code
- **Defensive coding** — Validate inputs, provide helpful errors

### Naming
- Commands: kebab-case (`my-command`)
- Functions/variables: camelCase (`myVariable`)
- Constants: UPPER_SNAKE_CASE (`MAX_VAULT_SIZE`)
- Files: kebab-case.mjs (`my-command.mjs`)

### Error Handling
```javascript
// Good: Help user understand what went wrong
if (!vault.exists()) {
  throw new Error('Vault not found. Run "clausidian setup" first.');
}

// Avoid: Cryptic errors
if (!vault) throw new Error('error');
```

### Testing
- Test all new commands
- Test edge cases (empty vault, invalid input, missing files)
- Use descriptive test names: `'throws on invalid vault'` not `'test 1'`

## Performance Considerations

### Before Optimizing
- Measure with `npm run bench` (coming in v2.5.0)
- Profile on realistic vaults (1K+ notes)

### Optimization Areas
- **Search** — Cache results, use BM25 efficiently
- **Scanning** — Batch file I/O, avoid re-scanning
- **Linking** — Use tag index instead of full scan
- **Large vaults** — Stream results, show progress

### No Premature Optimization
- Keep code simple first
- Optimize only what's slow
- Add comments explaining non-obvious optimizations

## Testing Standards

### Test Coverage
- Aim for >80% coverage on new code
- Critical paths (search, write, sync): >95%
- Edge cases: all major code branches

### Running Tests
```bash
npm test                    # All tests
npm test -- --grep "keyword"  # Specific tests
npm test -- test/vault.test.mjs  # Single file
```

### Test Isolation
- Each test gets its own temp vault (see `test/helpers.mjs`)
- Cleanup after tests (tempfiles deleted)
- No side effects on actual user vaults

## Documentation Standards

### README.md
- One example per command
- Show typical use case
- Include expected output

### JSDoc
- Required for: exported functions, complex logic
- Format: `@param {type} name - description`
- Example:
```javascript
/**
 * Search vault for keywords
 * @param {Vault} vault - Vault instance
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {string} [options.type] - Filter by note type (optional)
 * @returns {Array<Object>} Sorted results with scores
 */
```

### Comments
- Explain **why**, not **what** (code explains what)
- Use for complex algorithms, non-obvious logic
- Keep comments up-to-date with code

## Getting Help

- **Architecture questions** — See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **API reference** — See command's JSDoc and `src/help.mjs`
- **Debugging** — Run with `DEBUG=clausidian:*`
- **Issues** — Check existing GitHub issues first

## Release Checklist (Maintainers)

Before releasing v2.5.0:
1. ✓ All tests pass
2. ✓ CHANGELOG.md updated
3. ✓ Version bumped in package.json
4. ✓ README examples tested
5. ✓ No console warnings/errors in --json mode
6. ✓ Performance benchmarks stable
7. ✓ Docs build without warnings

## License

All contributions licensed under MIT (see LICENSE).
