import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { loadVaultNotes, extractInsights } from '../src/insight-extractor.mjs';
import { analyzeCodePatterns, filterPatterns } from '../src/code-pattern-analyzer.mjs';
import { recommendSkills, calculate5DScore, generateReport, generateJSONReport } from '../src/skill-recommender.mjs';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let vaultDir;

const NOTE_WITH_PAIN = `---
title: Deployment Issues
tags: [devops, pain]
---
# Deployment Issues
TODO: fix the manual deployment process. It's tedious and error-prone.
\`\`\`bash
#!/bin/bash
echo "deploying..."
sleep 5
echo "done"
\`\`\`
`;

const NOTE_WITH_CODE = `---
title: API Client Pattern
tags: [api, automation]
---
# API Client
Repetitive boilerplate every time we call external APIs.
\`\`\`javascript
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
    }
  }
}
\`\`\`
`;

const NOTE_SIMPLE = `# Random Thoughts
Just some notes about the project. Nothing special here.
`;

const NOTE_DUPLICATE_PATTERN = `---
title: Another API Client
tags: [api]
---
\`\`\`javascript
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
    }
  }
}
\`\`\`
`;

before(() => {
  vaultDir = mkdtempSync(join(tmpdir(), 'vault-mining-test-'));
  writeFileSync(join(vaultDir, 'deployment-issues.md'), NOTE_WITH_PAIN);
  writeFileSync(join(vaultDir, 'api-client.md'), NOTE_WITH_CODE);
  writeFileSync(join(vaultDir, 'random.md'), NOTE_SIMPLE);
  writeFileSync(join(vaultDir, 'api-client-2.md'), NOTE_DUPLICATE_PATTERN);
  const subDir = join(vaultDir, 'projects');
  mkdirSync(subDir, { recursive: true });
  writeFileSync(join(subDir, 'sub-note.md'), '# Sub Note\nBUG: broken link #automation');
});

// ── loadVaultNotes ────────────────────────────────────────────────────────────

describe('loadVaultNotes', () => {
  it('loads all .md files recursively', () => {
    const notes = loadVaultNotes(vaultDir);
    assert.ok(notes.length >= 5, `expected >=5 notes, got ${notes.length}`);
  });

  it('extracts title from frontmatter', () => {
    const notes = loadVaultNotes(vaultDir);
    const dep = notes.find(n => n.title === 'Deployment Issues');
    assert.ok(dep, 'should find note with frontmatter title');
  });

  it('falls back to filename as title when no frontmatter', () => {
    const notes = loadVaultNotes(vaultDir);
    const rand = notes.find(n => n.title === 'random');
    assert.ok(rand, 'should fall back to filename');
  });

  it('extracts frontmatter tags', () => {
    const notes = loadVaultNotes(vaultDir);
    const dep = notes.find(n => n.title === 'Deployment Issues');
    assert.ok(dep.tags.includes('devops'), 'should include frontmatter tags');
  });

  it('extracts inline #tags from body', () => {
    const notes = loadVaultNotes(vaultDir);
    const sub = notes.find(n => n.title === 'sub-note');
    assert.ok(sub.tags.includes('automation'), 'should extract inline tags');
  });

  it('throws for nonexistent vault path', () => {
    assert.throws(() => loadVaultNotes('/nonexistent/vault/path'), /Vault not found/);
  });

  it('includes file path in each note', () => {
    const notes = loadVaultNotes(vaultDir);
    for (const n of notes) {
      assert.ok(typeof n.file === 'string' && n.file.endsWith('.md'), 'file should be .md path');
    }
  });
});

// ── extractInsights ───────────────────────────────────────────────────────────

describe('extractInsights', () => {
  it('returns insights array', async () => {
    const result = await extractInsights(vaultDir);
    assert.ok(Array.isArray(result.insights), 'insights should be array');
  });

  it('returns metadata with totalNotes', async () => {
    const result = await extractInsights(vaultDir);
    assert.ok(result.metadata.totalNotes >= 5);
  });

  it('returns painPoints array', async () => {
    const result = await extractInsights(vaultDir);
    assert.ok(Array.isArray(result.painPoints));
  });

  it('returns clusters array', async () => {
    const result = await extractInsights(vaultDir);
    assert.ok(Array.isArray(result.clusters));
  });

  it('insights have required fields', async () => {
    const result = await extractInsights(vaultDir);
    for (const ins of result.insights) {
      assert.ok(typeof ins.skill === 'string', 'insight.skill should be string');
      assert.ok(typeof ins.score === 'number', 'insight.score should be number');
      assert.ok(typeof ins.source === 'string', 'insight.source should be string');
    }
  });

  it('respects maxCandidates option', async () => {
    const result = await extractInsights(vaultDir, { maxCandidates: 2 });
    assert.ok(result.insights.length <= 2);
  });

  it('handles vault with no matching keywords gracefully', async () => {
    const result = await extractInsights(vaultDir, { keywords: ['XYZNONEXISTENT'] });
    // Falls back to all notes, should not throw
    assert.ok(Array.isArray(result.insights));
  });

  it('rejects invalid vault path', async () => {
    await assert.rejects(() => extractInsights('/no/such/path'), /Vault not found/);
  });
});

// ── analyzeCodePatterns ───────────────────────────────────────────────────────

describe('analyzeCodePatterns', () => {
  it('returns patterns array', async () => {
    const { loadVaultNotes: lv } = await import('../src/insight-extractor.mjs');
    const notes = lv(vaultDir);
    const result = analyzeCodePatterns(notes);
    assert.ok(Array.isArray(result.patterns));
  });

  it('detects javascript patterns', async () => {
    const { loadVaultNotes: lv } = await import('../src/insight-extractor.mjs');
    const notes = lv(vaultDir);
    const result = analyzeCodePatterns(notes);
    const langs = result.patterns.map(p => p.language);
    assert.ok(langs.includes('javascript') || langs.includes('bash'), 'should detect js or bash');
  });

  it('detects duplicate/similar code blocks', async () => {
    const { loadVaultNotes: lv } = await import('../src/insight-extractor.mjs');
    const notes = lv(vaultDir);
    const result = analyzeCodePatterns(notes);
    // The two fetchWithRetry blocks should result in a pattern with usageCount > 1
    const multi = result.patterns.filter(p => p.usageCount > 1);
    assert.ok(multi.length >= 1, 'should detect duplicate patterns');
  });

  it('includes effortHours in each pattern', async () => {
    const { loadVaultNotes: lv } = await import('../src/insight-extractor.mjs');
    const notes = lv(vaultDir);
    const result = analyzeCodePatterns(notes);
    for (const p of result.patterns) {
      assert.ok(typeof p.effortHours === 'number' && p.effortHours > 0, 'effortHours should be positive');
    }
  });

  it('includes category in each pattern', async () => {
    const { loadVaultNotes: lv } = await import('../src/insight-extractor.mjs');
    const notes = lv(vaultDir);
    const result = analyzeCodePatterns(notes);
    for (const p of result.patterns) {
      assert.ok(typeof p.category === 'string', 'category should be string');
    }
  });

  it('includes abstractionPotential 0-10', async () => {
    const { loadVaultNotes: lv } = await import('../src/insight-extractor.mjs');
    const notes = lv(vaultDir);
    const result = analyzeCodePatterns(notes);
    for (const p of result.patterns) {
      assert.ok(p.abstractionPotential >= 0 && p.abstractionPotential <= 10);
    }
  });

  it('returns summary with language distribution', async () => {
    const { loadVaultNotes: lv } = await import('../src/insight-extractor.mjs');
    const notes = lv(vaultDir);
    const result = analyzeCodePatterns(notes);
    assert.ok(typeof result.summary.languages === 'object');
  });

  it('handles empty notes array', () => {
    const result = analyzeCodePatterns([]);
    assert.deepEqual(result.patterns, []);
    assert.equal(result.totalPatterns, 0);
  });

  it('handles notes with no code blocks', () => {
    const notes = [{ file: 'a.md', title: 'A', body: 'just text, no code' }];
    const result = analyzeCodePatterns(notes);
    assert.deepEqual(result.patterns, []);
  });
});

// ── filterPatterns ────────────────────────────────────────────────────────────

describe('filterPatterns', () => {
  it('filters by minUsageCount', async () => {
    const { loadVaultNotes: lv } = await import('../src/insight-extractor.mjs');
    const notes = lv(vaultDir);
    const { patterns } = analyzeCodePatterns(notes);
    const filtered = filterPatterns(patterns, { minUsageCount: 2 });
    assert.ok(filtered.every(p => p.usageCount >= 2));
  });

  it('filters by maxEffortHours', async () => {
    const { loadVaultNotes: lv } = await import('../src/insight-extractor.mjs');
    const notes = lv(vaultDir);
    const { patterns } = analyzeCodePatterns(notes);
    const filtered = filterPatterns(patterns, { maxEffortHours: 5 });
    assert.ok(filtered.every(p => p.effortHours <= 5));
  });

  it('returns all when no criteria', async () => {
    const { loadVaultNotes: lv } = await import('../src/insight-extractor.mjs');
    const notes = lv(vaultDir);
    const { patterns } = analyzeCodePatterns(notes);
    const filtered = filterPatterns(patterns, {});
    assert.equal(filtered.length, patterns.length);
  });
});

// ── calculate5DScore ──────────────────────────────────────────────────────────

describe('calculate5DScore', () => {
  it('returns 0-10 range for any valid input', () => {
    const score = calculate5DScore({ impact: 8, completeness: 7, maturity: 6, reusability: 9, complexity: 3 });
    assert.ok(score >= 0 && score <= 10, `score ${score} out of range`);
  });

  it('high quality, low complexity scores higher', () => {
    const high = calculate5DScore({ impact: 9, completeness: 9, maturity: 9, reusability: 9, complexity: 2 });
    const low = calculate5DScore({ impact: 3, completeness: 3, maturity: 3, reusability: 3, complexity: 8 });
    assert.ok(high > low);
  });

  it('uses defaults for missing dimensions', () => {
    const score = calculate5DScore({});
    assert.ok(typeof score === 'number' && !isNaN(score));
  });

  it('complexity is inverted (lower complexity = higher score)', () => {
    const easy = calculate5DScore({ impact: 5, completeness: 5, maturity: 5, reusability: 5, complexity: 1 });
    const hard = calculate5DScore({ impact: 5, completeness: 5, maturity: 5, reusability: 5, complexity: 9 });
    assert.ok(easy > hard);
  });
});

// ── recommendSkills ───────────────────────────────────────────────────────────

describe('recommendSkills', () => {
  it('returns skills array', async () => {
    const insights = await extractInsights(vaultDir);
    const { loadVaultNotes: lv } = await import('../src/insight-extractor.mjs');
    const notes = lv(vaultDir);
    const patterns = analyzeCodePatterns(notes);
    const result = recommendSkills(insights, patterns);
    assert.ok(Array.isArray(result.skills));
  });

  it('skills sorted by ROI descending', async () => {
    const insights = await extractInsights(vaultDir);
    const result = recommendSkills(insights, null);
    for (let i = 1; i < result.skills.length; i++) {
      assert.ok(result.skills[i - 1].roiScore >= result.skills[i].roiScore);
    }
  });

  it('each skill has rank, qualityScore, effortHours, roiScore', async () => {
    const insights = await extractInsights(vaultDir);
    const result = recommendSkills(insights, null);
    for (const s of result.skills) {
      assert.ok(typeof s.rank === 'number');
      assert.ok(typeof s.qualityScore === 'number');
      assert.ok(typeof s.effortHours === 'number');
      assert.ok(typeof s.roiScore === 'number');
    }
  });

  it('respects topN option', async () => {
    const insights = await extractInsights(vaultDir);
    const result = recommendSkills(insights, null, { topN: 3 });
    assert.ok(result.skills.length <= 3);
  });

  it('handles null codePatterns gracefully', async () => {
    const insights = await extractInsights(vaultDir);
    assert.doesNotThrow(() => recommendSkills(insights, null));
  });

  it('returns metadata with avgQuality and recommendation', async () => {
    const insights = await extractInsights(vaultDir);
    const result = recommendSkills(insights, null);
    assert.ok(typeof result.metadata.avgQuality === 'number');
    assert.ok(typeof result.metadata.recommendation === 'string');
  });
});

// ── generateReport ────────────────────────────────────────────────────────────

describe('generateReport', () => {
  it('returns a non-empty string', async () => {
    const insights = await extractInsights(vaultDir);
    const result = recommendSkills(insights, null);
    const report = generateReport(result.skills, insights.metadata);
    assert.ok(typeof report === 'string' && report.length > 0);
  });

  it('contains weekly report header', async () => {
    const insights = await extractInsights(vaultDir);
    const result = recommendSkills(insights, null);
    const report = generateReport(result.skills, insights.metadata);
    assert.ok(report.includes('Obsidian Vault Mining'));
  });

  it('includes each skill in report', async () => {
    const insights = await extractInsights(vaultDir);
    const result = recommendSkills(insights, null, { topN: 3 });
    const report = generateReport(result.skills, insights.metadata);
    for (const s of result.skills) {
      assert.ok(report.includes(s.skill), `report should mention skill ${s.skill}`);
    }
  });

  it('generateJSONReport returns valid JSON', async () => {
    const insights = await extractInsights(vaultDir);
    const result = recommendSkills(insights, null);
    const json = generateJSONReport(result);
    assert.doesNotThrow(() => JSON.parse(json));
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed.skills));
    assert.ok(typeof parsed.generatedAt === 'string');
  });
});
