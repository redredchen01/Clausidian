# Smart Mode Selection System — Reference

## Overview

The mode selector module auto-detects skill complexity and selects optimal execution mode:
- **fast**: Quick execution with cached results (120s timeout, 4K tokens, search depth 1)
- **adaptive**: Balanced approach (180s timeout, 6K tokens, search depth 2)
- **full**: Comprehensive execution (360s timeout, 8K tokens, search depth 3)

## Core Functions

### `analyzePrompt(prompt, context)`

Analyzes text complexity and returns a score (0-1) with detailed factors breakdown.

**Parameters:**
- `prompt` (string): The skill prompt/content to analyze
- `context` (object, optional):
  - `tags` (array): Vault tags from context
  - `vaultReferences` (number): Count of vault file references

**Returns:**
```javascript
{
  score: 0.65,  // Overall complexity (0-1)
  factors: {
    wordCount: 156,
    wordScore: 0.52,
    codeBlocks: 2,
    codeBlockScore: 0.30,
    complexityKeywords: 8,
    keywordScore: 0.96,
    vaultReferences: 5,
    refScore: 0.25,
    externalDataScore: 0.40,
    tagScore: 0.10,
    compositeScore: 0.65
  }
}
```

**Complexity Factors:**

1. **Word Count** (0-1, weight 10%)
   - Normalized to 300 words = max score
   - Simple text < 50 words, complex > 200 words

2. **Code Blocks** (0-1, weight 5%)
   - Each block adds 0.15, capped at 1.0
   - Indicates implementation/setup complexity

3. **Complexity Keywords** (0-1, weight 70%)
   - Matches: api, integration, database, schema, authentication, etc.
   - Each keyword adds 0.12, capped at 1.0
   - Strongest indicator of task complexity

4. **Vault References** (0-0.3, weight 10%)
   - Each reference adds 0.1
   - Indicates dependency on vault data

5. **External Data** (0-0.4, weight 4%)
   - Matches: http, fetch, request, json, xml, csv
   - Each indicator adds 0.1

6. **Tag-Based** (0-0.3, weight 2%)
   - Tags: system, critical, infrastructure, integration, security
   - Each tag adds 0.1

### `selectMode(analysis, userOverride)`

Selects execution mode based on complexity score.

**Parameters:**
- `analysis` (object): Output from `analyzePrompt()`
- `userOverride` (string, optional): Force mode ('fast'|'adaptive'|'full')

**Decision Tree:**
```
score < 0.25    → 'fast'
0.25 ≤ score < 0.65 → 'adaptive'
score ≥ 0.65    → 'full'
```

**Returns:** Mode string ('fast'|'adaptive'|'full')

### `getConfig(mode, overrides)`

Retrieves or customizes mode configuration.

**Parameters:**
- `mode` (string): One of 'fast'|'adaptive'|'full'
- `overrides` (object, optional): Configuration overrides

**Returns:**
```javascript
{
  mode: 'adaptive',
  timeout: 180000,           // milliseconds
  maxTokens: 6000,
  searchDepth: 2,
  maxSearchResults: 20,
  cacheStrategy: 'smart',    // 'aggressive'|'smart'|'minimal'
  parallelRequests: 4,
  description: '...'
}
```

**Built-in Configurations:**

| Mode | Timeout | Tokens | Depth | Results | Cache | Parallel |
|------|---------|--------|-------|---------|-------|----------|
| fast | 120s | 4K | 1 | 10 | aggressive | 2 |
| adaptive | 180s | 6K | 2 | 20 | smart | 4 |
| full | 360s | 8K | 3 | 50 | minimal | 8 |

### `selectModeWithConfig(prompt, options)`

Complete workflow: analyze, select mode, and return configuration.

**Parameters:**
```javascript
selectModeWithConfig(prompt, {
  userMode: 'adaptive',           // Optional override
  context: {                      // Optional analysis context
    vaultReferences: 5,
    tags: ['system']
  },
  configOverrides: {              // Optional config tweaks
    maxTokens: 5000,
    timeout: 90000
  }
})
```

**Returns:**
```javascript
{
  mode: 'adaptive',
  analysis: { score, factors },
  config: { timeout, maxTokens, ... }
}
```

### Helper Functions

**`isSimple(prompt)`**: Returns true if prompt is < 100 words

**`isComplex(prompt)`**: Returns true if prompt is > 200 words AND contains API-related keywords

## Complexity Keywords

The system recognizes these keywords as complexity indicators:

**Data & Infrastructure:**
- api, integration, database, schema, orm, migration

**Security:**
- authentication, authorization, security, encryption

**Performance:**
- performance, optimization, caching, concurrency

**Integration:**
- external, third-party, webhook, streaming

**Architecture:**
- multi-step, workflow, pipeline, orchestration

**Error Handling:**
- error handling, retry, timeout, fallback

**Async:**
- async, promise, callback, goroutine, channel

## Usage Examples

### Example 1: Simple Task
```javascript
import { selectModeWithConfig } from './mode-selector.mjs';

const prompt = 'Create a helper function that calculates sum.';
const { mode, config } = selectModeWithConfig(prompt);

console.log(mode); // 'fast'
console.log(config.timeout); // 120000
```

### Example 2: Complex Task with Override
```javascript
const prompt = 'Integrate with external API...';
const result = selectModeWithConfig(prompt, {
  userMode: 'full'  // Force full mode regardless of score
});

console.log(result.mode); // 'full'
console.log(result.analysis.score); // Original complexity
```

### Example 3: Context-Aware Analysis
```javascript
const prompt = 'Analyze vault structure and generate summary';
const result = selectModeWithConfig(prompt, {
  context: {
    vaultReferences: 10,      // References 10 vault files
    tags: ['system', 'critical']
  }
});

console.log(result.mode);              // 'adaptive' or 'full'
console.log(result.analysis.factors);  // Detailed breakdown
```

### Example 4: Custom Configuration
```javascript
const result = selectModeWithConfig(prompt, {
  configOverrides: {
    maxTokens: 3000,      // Override token limit
    searchDepth: 1        // Shallow search only
  }
});
```

## Integration with Skill Pipeline

### In Skill Orchestrator

```javascript
import { selectModeWithConfig } from '../src/mode-selector.mjs';

async function executeSkill(skillPrompt, userContext) {
  // Analyze and select mode
  const { mode, config } = selectModeWithConfig(skillPrompt, {
    context: {
      vaultReferences: countVaultRefs(skillPrompt),
      tags: extractTags(userContext)
    }
  });

  // Log mode selection
  console.log(`Mode: ${mode}, Timeout: ${config.timeout}ms`);

  // Create execution controller
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeout
  );

  try {
    // Execute skill with mode-specific constraints
    const result = await executeWithConfig(skillPrompt, {
      mode,
      maxTokens: config.maxTokens,
      searchDepth: config.searchDepth,
      maxResults: config.maxSearchResults,
      cacheStrategy: config.cacheStrategy,
      signal: controller.signal
    });

    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

## Testing

Run test suite:
```bash
npm test -- test/mode-selector.test.mjs
```

Test coverage:
- 41 test cases across 6 suites
- Complexity analysis (9 tests)
- Mode selection (10 tests)
- Configuration (6 tests)
- Workflow (5 tests)
- Helper functions (6 tests)
- Integration scenarios (5 tests)

## Performance Characteristics

### Scoring Performance
- Analysis time: < 1ms for typical prompts
- Complexity evaluation: Linear in prompt length
- No external dependencies

### Mode Configuration Overhead
- Config lookup: O(1) constant time
- Override merge: O(n) in override count

## Future Enhancements

1. **Machine Learning**: Train complexity classifier on skill execution history
2. **Adaptive Thresholds**: Adjust boundaries based on historical performance
3. **Cost Optimization**: Factor in token costs vs. accuracy trade-offs
4. **Skill-Specific Patterns**: Learn complexity signatures for skill categories
5. **Real-time Feedback**: Adjust mode during execution based on progress

## Related Modules

- `index-manager.mjs` - Vault indexing and search
- `search-cache.mjs` - Search result caching (used by adaptive mode)
- `similarity-engine.mjs` - Note relationship scoring
- `scoring.mjs` - TF-IDF and keyword extraction utilities
