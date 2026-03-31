/**
 * Tests for mode-selector.mjs — Smart Mode Selection System
 * Tests complexity analysis, mode selection, and configuration
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePrompt,
  selectMode,
  getConfig,
  selectModeWithConfig,
  isSimple,
  isComplex,
} from '../src/mode-selector.mjs';

describe('mode-selector: analyzePrompt()', () => {
  it('should return {score: 0} for null/empty prompt', () => {
    const result = analyzePrompt(null);
    assert.strictEqual(result.score, 0);

    const result2 = analyzePrompt('');
    assert.strictEqual(result2.score, 0);
  });

  it('should analyze simple prompt (word count)', () => {
    const prompt = 'Create a simple function that adds two numbers.';
    const result = analyzePrompt(prompt);

    assert.ok(result.score >= 0);
    assert.ok(result.score < 0.3);
    assert.strictEqual(result.factors.wordCount, 8);
  });

  it('should detect complexity keywords (API, database, etc)', () => {
    const prompt = `
      Integrate with external API, set up database schema,
      implement authentication and error handling for a webhook endpoint.
    `;
    const result = analyzePrompt(prompt);

    assert.ok(result.factors.complexityKeywords >= 4);
    assert.ok(result.score > 0.2);
  });

  it('should score code blocks as complexity factor', () => {
    const prompt = `
      Here's how to set this up:
      \`\`\`javascript
      function setup() { /* code */ }
      \`\`\`
      And another example:
      \`\`\`bash
      npm install pkg
      \`\`\`
    `;
    const result = analyzePrompt(prompt);

    assert.strictEqual(result.factors.codeBlocks, 2);
    assert.ok(result.factors.codeBlockScore > 0);
  });

  it('should account for vault references in context', () => {
    const prompt = 'Analyze notes and create summary';
    const context = { vaultReferences: 5 };
    const result = analyzePrompt(prompt, context);

    assert.strictEqual(result.factors.vaultReferences, 5);
    assert.ok(result.factors.refScore > 0);
  });

  it('should detect external data indicators', () => {
    const prompt = 'Fetch JSON data via HTTP request and parse XML response';
    const result = analyzePrompt(prompt);

    assert.ok(result.factors.externalDataScore > 0);
  });

  it('should account for tags in context', () => {
    const prompt = 'Basic setup';
    const context = { tags: ['system', 'infrastructure'] };
    const result = analyzePrompt(prompt, context);

    assert.ok(result.factors.tagScore > 0);
  });

  it('should cap composite score at 1.0', () => {
    const prompt = `
      ${Array(400).fill('word').join(' ')}
      API integration database authentication external webhook
      \`\`\`js\ncode\n\`\`\`
      \`\`\`py\ncode\n\`\`\`
    `;
    const context = { vaultReferences: 10, tags: ['system', 'critical'] };
    const result = analyzePrompt(prompt, context);

    assert.ok(result.score <= 1.0);
  });

  it('should provide detailed factors breakdown', () => {
    const prompt = 'Complex integration with API and database';
    const result = analyzePrompt(prompt);

    assert.ok(result.factors.wordCount);
    assert.ok('wordScore' in result.factors);
    assert.ok('codeBlocks' in result.factors);
    assert.ok('complexityKeywords' in result.factors);
    assert.ok('compositeScore' in result.factors);
  });
});

describe('mode-selector: selectMode()', () => {
  it('should return "fast" for low complexity (< 0.3)', () => {
    const analysis = { score: 0.2, factors: {} };
    const mode = selectMode(analysis);
    assert.strictEqual(mode, 'fast');
  });

  it('should return "adaptive" for medium complexity (0.3-0.7)', () => {
    const analysis = { score: 0.5, factors: {} };
    const mode = selectMode(analysis);
    assert.strictEqual(mode, 'adaptive');
  });

  it('should return "full" for high complexity (> 0.7)', () => {
    const analysis = { score: 0.85, factors: {} };
    const mode = selectMode(analysis);
    assert.strictEqual(mode, 'full');
  });

  it('should handle boundary case: score exactly 0.25', () => {
    const analysis = { score: 0.25, factors: {} };
    const mode = selectMode(analysis);
    assert.strictEqual(mode, 'adaptive');
  });

  it('should handle boundary case: score exactly 0.65', () => {
    const analysis = { score: 0.65, factors: {} };
    const mode = selectMode(analysis);
    assert.strictEqual(mode, 'full');
  });

  it('should respect user override (fast)', () => {
    const analysis = { score: 0.9, factors: {} };
    const mode = selectMode(analysis, 'fast');
    assert.strictEqual(mode, 'fast');
  });

  it('should respect user override (full)', () => {
    const analysis = { score: 0.1, factors: {} };
    const mode = selectMode(analysis, 'full');
    assert.strictEqual(mode, 'full');
  });

  it('should ignore invalid override and use auto-selection', () => {
    const analysis = { score: 0.5, factors: {} };
    const mode = selectMode(analysis, 'invalid-mode');
    assert.strictEqual(mode, 'adaptive');
  });

  it('should handle case-insensitive override', () => {
    const analysis = { score: 0.1, factors: {} };
    const mode = selectMode(analysis, 'FAST');
    assert.strictEqual(mode, 'fast');
  });

  it('should handle null/undefined analysis gracefully', () => {
    const mode = selectMode({ score: 0 });
    assert.strictEqual(mode, 'fast');
  });
});

describe('mode-selector: getConfig()', () => {
  it('should return fast config with correct values', () => {
    const config = getConfig('fast');

    assert.strictEqual(config.mode, 'fast');
    assert.strictEqual(config.timeout, 120000);
    assert.strictEqual(config.maxTokens, 4000);
    assert.strictEqual(config.searchDepth, 1);
    assert.strictEqual(config.maxSearchResults, 10);
    assert.strictEqual(config.cacheStrategy, 'aggressive');
    assert.strictEqual(config.parallelRequests, 2);
  });

  it('should return adaptive config with correct values', () => {
    const config = getConfig('adaptive');

    assert.strictEqual(config.mode, 'adaptive');
    assert.strictEqual(config.timeout, 180000);
    assert.strictEqual(config.maxTokens, 6000);
    assert.strictEqual(config.searchDepth, 2);
    assert.strictEqual(config.maxSearchResults, 20);
    assert.strictEqual(config.cacheStrategy, 'smart');
    assert.strictEqual(config.parallelRequests, 4);
  });

  it('should return full config with correct values', () => {
    const config = getConfig('full');

    assert.strictEqual(config.mode, 'full');
    assert.strictEqual(config.timeout, 360000);
    assert.strictEqual(config.maxTokens, 8000);
    assert.strictEqual(config.searchDepth, 3);
    assert.strictEqual(config.maxSearchResults, 50);
    assert.strictEqual(config.cacheStrategy, 'minimal');
    assert.strictEqual(config.parallelRequests, 8);
  });

  it('should apply config overrides', () => {
    const overrides = { maxTokens: 5000, timeout: 90000 };
    const config = getConfig('fast', overrides);

    assert.strictEqual(config.maxTokens, 5000);
    assert.strictEqual(config.timeout, 90000);
    assert.strictEqual(config.searchDepth, 1); // Unchanged
  });

  it('should default to adaptive for invalid mode', () => {
    const config = getConfig('invalid');
    assert.strictEqual(config.mode, 'adaptive');
  });

  it('should be case-insensitive for mode', () => {
    const config = getConfig('FAST');
    assert.strictEqual(config.mode, 'fast');
  });
});

describe('mode-selector: selectModeWithConfig()', () => {
  it('should return complete workflow result for simple prompt', () => {
    const prompt = 'Write a hello world function';
    const result = selectModeWithConfig(prompt);

    assert.ok(result.mode);
    assert.strictEqual(result.mode, 'fast');
    assert.ok(result.analysis);
    assert.ok(result.config);
    assert.strictEqual(result.config.mode, 'fast');
  });

  it('should return complete workflow result for complex prompt', () => {
    const prompt = `
      Integrate with third-party REST API, set up database schema,
      implement authentication and error handling with retry logic
      for handling webhook events. Also handle async operations.
      \`\`\`js\ncode\n\`\`\`
    `;
    const result = selectModeWithConfig(prompt);

    assert.strictEqual(result.mode, 'full');
    assert.strictEqual(result.config.searchDepth, 3);
    assert.ok(result.analysis.score > 0.7);
  });

  it('should respect userMode option in selectModeWithConfig', () => {
    const prompt = 'Complex API integration task';
    const result = selectModeWithConfig(prompt, { userMode: 'fast' });

    assert.strictEqual(result.mode, 'fast');
  });

  it('should apply configOverrides in selectModeWithConfig', () => {
    const prompt = 'Simple task';
    const result = selectModeWithConfig(prompt, {
      configOverrides: { maxTokens: 3000 },
    });

    assert.strictEqual(result.config.maxTokens, 3000);
  });

  it('should pass context to analyzePrompt', () => {
    const prompt = 'Task with references';
    const result = selectModeWithConfig(prompt, {
      context: { vaultReferences: 5, tags: ['system'] },
    });

    assert.strictEqual(result.analysis.factors.vaultReferences, 5);
    assert.ok(result.analysis.factors.tagScore > 0);
  });
});

describe('mode-selector: isSimple() and isComplex()', () => {
  it('should identify simple prompt (< 100 words)', () => {
    const prompt = 'Write a function that adds numbers';
    assert.strictEqual(isSimple(prompt), true);
  });

  it('should identify non-simple prompt (>= 100 words)', () => {
    const prompt = Array(101).fill('word').join(' ');
    assert.strictEqual(isSimple(prompt), false);
  });

  it('should identify complex prompt (> 200 words + API keywords)', () => {
    const prompt = `
      ${Array(201).fill('word').join(' ')}
      Integrate with external API
    `;
    assert.strictEqual(isComplex(prompt), true);
  });

  it('should identify non-complex if missing API keywords', () => {
    const prompt = Array(201).fill('word').join(' ');
    assert.strictEqual(isComplex(prompt), false);
  });

  it('should identify non-complex if too short', () => {
    const prompt = 'Short text with API keyword';
    assert.strictEqual(isComplex(prompt), false);
  });

  it('should handle null gracefully', () => {
    assert.strictEqual(isSimple(null), true);
    assert.strictEqual(isComplex(null), false);
  });
});

describe('mode-selector: integration scenarios', () => {
  it('Scenario 1: Simple skill (word count < 100) → fast mode', () => {
    const simplePrompt =
      'Create a utility function that calculates the sum of two numbers.';
    const result = selectModeWithConfig(simplePrompt);

    assert.strictEqual(result.mode, 'fast');
    assert.strictEqual(result.config.timeout, 120000);
    assert.strictEqual(result.config.searchDepth, 1);
  });

  it('Scenario 2: Medium skill (100-200 words) → adaptive mode', () => {
    const mediumPrompt = `
      Build a command that integrates with vault search,
      filters by tags and date ranges, and returns results
      with relevance scoring. Use the search cache to optimize
      performance. Implement authentication for results, handle errors gracefully,
      and display results in a formatted table. Support async operations.
    `;
    const result = selectModeWithConfig(mediumPrompt);

    assert.strictEqual(result.mode, 'adaptive');
    assert.strictEqual(result.config.searchDepth, 2);
  });

  it('Scenario 3: Complex skill (>200 words + API keywords) → full mode', () => {
    const complexPrompt = `
      Implement a multi-step workflow that integrates with external REST APIs,
      manages database schema migrations, implements authentication and authorization,
      handles webhook events with retry logic, manages concurrent operations,
      and provides error handling with fallback strategies. The system should support
      caching, performance optimization, and detailed logging. Include comprehensive
      error handling, timeout management, and graceful degradation.
      \`\`\`javascript
      async function integrate() { /* implementation */ }
      \`\`\`
    `;
    const result = selectModeWithConfig(complexPrompt);

    assert.strictEqual(result.mode, 'full');
    assert.ok(result.analysis.score > 0.7);
    assert.strictEqual(result.config.timeout, 360000);
    assert.strictEqual(result.config.searchDepth, 3);
  });

  it('Scenario 4: User can override mode selection', () => {
    const complexPrompt = 'Integration with API, database, authentication';
    const result = selectModeWithConfig(complexPrompt, { userMode: 'fast' });

    // Even though complexity is high, user override takes precedence
    assert.strictEqual(result.mode, 'fast');
    assert.strictEqual(result.config.timeout, 120000);
  });

  it('Scenario 5: Context affects complexity scoring', () => {
    const prompt = 'Analyze and summarize vault contents';
    const context = {
      vaultReferences: 10,
      tags: ['system', 'critical', 'infrastructure'],
    };
    const result = selectModeWithConfig(prompt, { context });

    // Additional context increases complexity
    assert.ok(result.analysis.factors.vaultReferences === 10);
    assert.ok(result.analysis.factors.tagScore > 0);
    assert.ok(result.analysis.score > 0);
  });
});
