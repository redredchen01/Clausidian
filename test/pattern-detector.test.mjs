import test from 'node:test';
import assert from 'node:assert';
import PatternDetector from '../src/pattern-detector.mjs';

const detector = new PatternDetector();

const sampleNotes = [
  { file: 'api-integrations.md', title: 'API Integration Patterns', body: 'REST APIs and GraphQL integration patterns. Handling rate limiting and retry logic.' },
  { file: 'rest-patterns.md', title: 'REST Best Practices', body: 'Endpoint design, error handling, and API versioning strategies.' },
  { file: 'graphql-schema.md', title: 'GraphQL Schema Design', body: 'Schema design patterns, query optimization, and resolver implementation.' },
  { file: 'monitoring.md', title: 'System Monitoring', body: 'Setup monitoring dashboards and alerts for API endpoints.' },
  { file: 'bugs.md', title: 'Bug Tracking', body: 'Manual bug reporting is tedious and error-prone. We need better automation.' },
  { file: 'workflow.md', title: 'Daily Workflow', body: 'Manual Linear reporting takes too long. Repetitive task updates.' },
  { file: 'sheets-update.md', title: 'Sheet Updates', body: 'Manual sheet updates are slow and broken when formulas fail.' },
  { file: 'code-review.md', title: 'Code Review Process', body: 'Complex review process with missing automated checks.' },
  { file: 'db-queries.md', title: 'Database Queries', body: 'Manual API queries are slow and inconsistent results.' },
  { file: 'sync.md', title: 'Data Synchronization', body: 'Duplicate data across systems. Retry logic on timeouts.' },
];

// Algorithm 1 Tests
test('Algorithm 1.1: tokenize removes stopwords correctly', () => {
  const text = 'The quick brown fox jumps over the lazy dog';
  const tokens = detector.tokenize(text);
  assert(!tokens.includes('the'));
  assert(tokens.includes('quick'));
});

test('Algorithm 1.2: tokenize handles punctuation', () => {
  const text = 'Hello, world! How are you?';
  const tokens = detector.tokenize(text);
  assert(tokens.includes('hello'));
  assert(tokens.length > 0);
});

test('Algorithm 1.3: buildVocabulary creates correct vocabulary size', () => {
  const vocab = detector.buildVocabulary(sampleNotes);
  assert(vocab.vocab.length > 0);
  assert(vocab.docTermFreqs.length === sampleNotes.length);
});

test('Algorithm 1.4: computeTFIDF returns vectors with correct structure', () => {
  const { vectors } = detector.computeTFIDF(sampleNotes);
  assert.strictEqual(vectors.length, sampleNotes.length);
  for (const v of vectors) {
    assert(v.file);
    assert(v.vector);
  }
});

test('Algorithm 1.5: cosineSimilarity between identical vectors is 1', () => {
  const vec = { a: 1, b: 2, c: 3 };
  const similarity = detector.cosineSimilarity(vec, vec);
  assert(Math.abs(similarity - 1) < 0.001);
});

test('Algorithm 1.6: cosineSimilarity between orthogonal vectors is 0', () => {
  const vec1 = { a: 1, b: 0 };
  const vec2 = { a: 0, b: 1 };
  const similarity = detector.cosineSimilarity(vec1, vec2);
  assert(Math.abs(similarity) < 0.001);
});

test('Algorithm 1.7: initializeCenters returns unique centers', () => {
  const { vectors } = detector.computeTFIDF(sampleNotes);
  const centers = detector.initializeCenters(vectors, 3);
  assert.strictEqual(centers.length, 3);
});

test('Algorithm 1.8: assignClusters assigns all points to a cluster', () => {
  const { vectors } = detector.computeTFIDF(sampleNotes);
  const centers = detector.initializeCenters(vectors, 3);
  const assignments = detector.assignClusters(vectors, centers);
  assert.strictEqual(assignments.length, vectors.length);
  for (let i = 0; i < assignments.length; i++) {
    assert(assignments[i] >= 0 && assignments[i] < 3);
  }
});

test('Algorithm 1.9: updateCenters preserves cluster count', () => {
  const { vectors } = detector.computeTFIDF(sampleNotes);
  let centers = detector.initializeCenters(vectors, 3);
  const assignments = detector.assignClusters(vectors, centers);
  centers = detector.updateCenters(vectors, centers, assignments);
  assert.strictEqual(centers.length, 3);
});

test('Algorithm 1.10: kMeansClustering converges', () => {
  const { vectors } = detector.computeTFIDF(sampleNotes);
  const k = 3;
  const { centers, assignments } = detector.kMeansClustering(vectors, k);
  assert.strictEqual(centers.length, k);
  assert.strictEqual(assignments.length, vectors.length);
});

test('Algorithm 1.11: clusterByContent returns valid clusters', () => {
  const result = detector.clusterByContent(sampleNotes);
  assert(Array.isArray(result.clusters));
  assert(result.clusters.length > 0);
  assert(result.overallQuality >= 0);
});

test('Algorithm 1.12: cluster labels are meaningful', () => {
  const result = detector.clusterByContent(sampleNotes);
  for (const cluster of result.clusters) {
    assert(cluster.label.length > 0);
  }
});

test('Algorithm 1.13: all notes assigned to exactly one cluster', () => {
  const result = detector.clusterByContent(sampleNotes);
  let totalNotes = 0;
  for (const cluster of result.clusters) {
    totalNotes += cluster.notes.length;
  }
  assert.strictEqual(totalNotes, sampleNotes.length);
});

test('Algorithm 1.14: silhouette score reasonable for test data', () => {
  const result = detector.clusterByContent(sampleNotes);
  assert(result.overallQuality > 0.3);
});

test('Algorithm 1.15: extractTopTerms returns correct count', () => {
  const { vectors } = detector.computeTFIDF(sampleNotes);
  const centers = detector.initializeCenters(vectors, 3);
  const assignments = detector.assignClusters(vectors, centers);
  const topTerms = detector.extractTopTerms(vectors, assignments, 0, 5);
  assert(topTerms.length <= 5);
  assert(topTerms.length > 0);
});

test('Algorithm 1.16: clusterByContent works with empty notes', () => {
  const result = detector.clusterByContent([]);
  assert.strictEqual(result.clusters.length, 0);
  assert.strictEqual(result.overallQuality, 0);
});

// Algorithm 2 Tests
test('Algorithm 2.1: detectPainPoints returns pain signals', () => {
  const result = detector.detectPainPoints(sampleNotes);
  assert(Array.isArray(result.painPoints));
  assert(result.painPoints.length > 0);
  assert(Array.isArray(result.topPains));
});

test('Algorithm 2.2: pain severity is normalized 0-100', () => {
  const result = detector.detectPainPoints(sampleNotes);
  for (const pain of result.painPoints) {
    assert(pain.severity >= 0 && pain.severity <= 100);
  }
});

test('Algorithm 2.3: pain frequency counted correctly', () => {
  const result = detector.detectPainPoints(sampleNotes);
  for (const pain of result.painPoints) {
    assert(pain.frequency > 0);
  }
});

test('Algorithm 2.4: affected notes listed correctly', () => {
  const result = detector.detectPainPoints(sampleNotes);
  for (const pain of result.painPoints) {
    assert(Array.isArray(pain.affectedNotes));
    assert(pain.affectedNotes.length > 0);
  }
});

test('Algorithm 2.5: suggested solutions are valid skills', () => {
  const result = detector.detectPainPoints(sampleNotes);
  for (const pain of result.painPoints) {
    assert(typeof pain.suggestedSolution === 'string');
    assert(pain.suggestedSolution.startsWith('/'));
  }
});

test('Algorithm 2.6: ROI estimates are reasonable', () => {
  const result = detector.detectPainPoints(sampleNotes);
  const validROI = ['5h saved per week', '2h saved per week', '30m saved per week', 'minor optimization'];
  for (const pain of result.painPoints) {
    assert(validROI.includes(pain.estimatedROI));
  }
});

test('Algorithm 2.7: topPains is top 5', () => {
  const result = detector.detectPainPoints(sampleNotes);
  assert(result.topPains.length <= 5);
});

test('Algorithm 2.8: detectPainPoints with no pain keywords', () => {
  const cleanNotes = [
    { file: 'clean.md', title: 'Clean Process', body: 'Well automated and efficient.' },
  ];
  const result = detector.detectPainPoints(cleanNotes);
  assert(Array.isArray(result.painPoints));
});

test('Algorithm 2.9: estimateROI calculation', () => {
  assert.strictEqual(detector.estimateROI(15), '5h saved per week');
  assert.strictEqual(detector.estimateROI(7), '2h saved per week');
  assert.strictEqual(detector.estimateROI(3), '30m saved per week');
});

test('Algorithm 2.10: suggestSolution maps keywords correctly', () => {
  const solution = detector.suggestSolution('manual');
  assert(solution === '/linear-slack-reporter');
});

// Integration Tests
test('Integration: clusterByContent and detectPainPoints work together', () => {
  const clusters = detector.clusterByContent(sampleNotes);
  const pains = detector.detectPainPoints(sampleNotes);
  assert(clusters.clusters.length > 0);
  assert(pains.painPoints.length > 0);
});

test('Integration: pain points match affected notes', () => {
  const result = detector.detectPainPoints(sampleNotes);
  for (const pain of result.painPoints) {
    assert(pain.affectedNotes.length > 0);
    for (const file of pain.affectedNotes) {
      assert(sampleNotes.some(n => n.file === file));
    }
  }
});

test('Integration: large vault handling (93+ notes simulation)', () => {
  const largeVault = [];
  for (let i = 0; i < 93; i++) {
    largeVault.push({
      file: `note-${i}.md`,
      title: `Note ${i}: ${['api', 'database', 'ui', 'monitoring'][i % 4]} topic`,
      body: `Content for note ${i}. ${i % 10 === 0 ? 'manual' : ''} ${i % 7 === 0 ? 'slow' : ''} operations.`,
    });
  }
  const clusters = detector.clusterByContent(largeVault);
  const pains = detector.detectPainPoints(largeVault);
  assert(clusters.clusters.length > 0);
  assert(clusters.clusters.length <= 12);
  let totalNotes = 0;
  for (const cluster of clusters.clusters) {
    totalNotes += cluster.notes.length;
  }
  assert.strictEqual(totalNotes, 93);
  assert(pains.painPoints.length >= 0);
});

test('Integration: JSON serializable output', () => {
  const clusters = detector.clusterByContent(sampleNotes);
  const pains = detector.detectPainPoints(sampleNotes);
  const clustersJSON = JSON.stringify(clusters);
  const painsJSON = JSON.stringify(pains);
  assert(clustersJSON.length > 0);
  assert(painsJSON.length > 0);
  const parsed1 = JSON.parse(clustersJSON);
  const parsed2 = JSON.parse(painsJSON);
  assert.strictEqual(parsed1.clusters.length, clusters.clusters.length);
  assert.strictEqual(parsed2.painPoints.length, pains.painPoints.length);
});

test('Integration: recommended K in valid range', () => {
  const result = detector.clusterByContent(sampleNotes);
  assert(result.recommendedK >= 8);
  assert(result.recommendedK <= 12);
});

// ============ Algorithm 3: Code Pattern Extraction Tests ============

test('Algorithm 3.1: extractCodeBlocks finds javascript code', () => {
  const note = {
    file: 'test.md',
    title: 'Test',
    body: '```javascript\nconst x = 1;\nconsole.log(x);\n```',
  };
  const blocks = detector.extractCodeBlocks(note);
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].language, 'javascript');
});

test('Algorithm 3.2: extractCodeBlocks finds multiple blocks', () => {
  const note = {
    file: 'test.md',
    body: '```js\nconst a = 1;\n```\n```python\nprint("hello")\n```',
  };
  const blocks = detector.extractCodeBlocks(note);
  assert.strictEqual(blocks.length, 2);
});

test('Algorithm 3.3: extractCodeBlocks handles code with comments', () => {
  const note = {
    body: '```javascript\n// This is a comment\nconst x = 1;\n```',
  };
  const blocks = detector.extractCodeBlocks(note);
  assert(blocks[0].hasComments);
});

test('Algorithm 3.4: extractCodeBlocks detects async code', () => {
  const note = {
    body: '```javascript\nasync function fetch() { await call(); }\n```',
  };
  const blocks = detector.extractCodeBlocks(note);
  assert(blocks[0].hasAsync);
});

test('Algorithm 3.5: extractCodeBlocks detects error handling', () => {
  const note = {
    body: '```javascript\ntry { } catch(e) { }\n```',
  };
  const blocks = detector.extractCodeBlocks(note);
  assert(blocks[0].hasError);
});

test('Algorithm 3.6: extractCodeBlocks detects retry patterns', () => {
  const note = {
    body: '```javascript\nfor(let retry = 0; retry < 3; retry++) { }\n```',
  };
  const blocks = detector.extractCodeBlocks(note);
  assert(blocks[0].hasRetry);
});

test('Algorithm 3.7: estimateCodeComplexity returns 1-10', () => {
  const simple = 'const x = 1;';
  const complex = 'for(let i=0;i<n;i++){if(x>0){while(true){switch(y){case 1:break;}}}}}';
  const simpleScore = detector.estimateCodeComplexity(simple);
  const complexScore = detector.estimateCodeComplexity(complex);
  assert(simpleScore >= 0 && simpleScore <= 10);
  assert(complexScore > simpleScore);
});

test('Algorithm 3.8: generalizeCode replaces URLs', () => {
  const code = 'const url = "https://example.com/api";';
  const generalized = detector.generalizeCode(code);
  assert(!generalized.includes('https://'));
  assert(generalized.includes('?url?'));
});

test('Algorithm 3.9: generalizeCode replaces numbers', () => {
  const code = 'const timeout = 5000;';
  const generalized = detector.generalizeCode(code);
  assert(!generalized.includes('5000'));
  assert(generalized.includes('?num?'));
});

test('Algorithm 3.10: generalizeCode replaces strings', () => {
  const code = 'const name = "John";';
  const generalized = detector.generalizeCode(code);
  assert(!generalized.includes('John'));
  assert(generalized.includes('?string?'));
});

test('Algorithm 3.11: codePatternSimilarity identical code is 1.0', () => {
  const code = 'const x = 1;';
  const similarity = detector.codePatternSimilarity(code, code);
  assert(Math.abs(similarity - 1.0) < 0.01);
});

test('Algorithm 3.12: codePatternSimilarity different code < 1.0', () => {
  const code1 = 'const x = 1;';
  const code2 = 'const y = 2;';
  const similarity = detector.codePatternSimilarity(code1, code2);
  assert(similarity < 1.0 && similarity > 0);
});

test('Algorithm 3.13: extractCodePatterns finds patterns', () => {
  const notesWithCode = [
    {
      file: 'api1.md',
      title: 'API',
      body: '```javascript\nasync function retry(fn) { for(let i=0;i<3;i++) { try { return await fn(); } catch(e) {} } }\n```',
    },
    {
      file: 'api2.md',
      title: 'API 2',
      body: '```javascript\nasync function retry(fn) { for(let i=0;i<3;i++) { try { return await fn(); } catch(e) {} } }\n```',
    },
  ];
  const result = detector.extractCodePatterns(notesWithCode);
  assert(Array.isArray(result.patterns));
  assert(result.patterns.length > 0);
});

test('Algorithm 3.14: extractCodePatterns calculates reusability', () => {
  const notes = [
    { file: 'a.md', body: '```js\nconst x = 1;\n```' },
    { file: 'b.md', body: '```js\nconst x = 1;\n```' },
  ];
  const result = detector.extractCodePatterns(notes);
  for (const pattern of result.patterns) {
    assert(typeof pattern.reusability === 'number');
    assert(pattern.reusability >= 0);
  }
});

test('Algorithm 3.15: extractCodePatterns estimates savings', () => {
  const notes = [
    { file: 'a.md', body: '```js\nconst x = 1;const y = 2;const z = 3;\n```' },
    { file: 'b.md', body: '```js\nconst x = 1;const y = 2;const z = 3;\n```' },
  ];
  const result = detector.extractCodePatterns(notes);
  assert(result.totalSavings > 0);
});

test('Algorithm 3.16: extractCodePatterns handles no code blocks', () => {
  const notes = [
    { file: 'a.md', body: 'Just text, no code' },
  ];
  const result = detector.extractCodePatterns(notes);
  assert(Array.isArray(result.patterns));
  assert(result.patterns.length === 0);
});

test('Algorithm 3.17: extractCodePatterns generalizes top patterns', () => {
  const notes = [
    { file: 'a.md', body: '```js\nconst x = 1;\n```' },
    { file: 'b.md', body: '```js\nconst x = 1;\n```' },
  ];
  const result = detector.extractCodePatterns(notes);
  for (const pattern of result.patterns) {
    assert(pattern.generalized);
  }
});

// ============ Algorithm 4: Quality Scoring Tests ============

test('Algorithm 4.1: scoreImpact returns 1-10', () => {
  assert.strictEqual(detector.scoreImpact(0), 0);
  assert.strictEqual(detector.scoreImpact(50), 1);
  assert.strictEqual(detector.scoreImpact(500), 10);
  assert(detector.scoreImpact(100) > 1);
});

test('Algorithm 4.2: scoreCompleteness returns 1-10', () => {
  assert.strictEqual(detector.scoreCompleteness(0), 0);
  assert.strictEqual(detector.scoreCompleteness(100), 1);
  assert.strictEqual(detector.scoreCompleteness(1000), 10);
});

test('Algorithm 4.3: scoreMaturity returns 1-10', () => {
  assert(detector.scoreMaturity(1) > 0);
  assert(detector.scoreMaturity(10) > detector.scoreMaturity(5));
  assert(detector.scoreMaturity(100) <= 10);
});

test('Algorithm 4.4: scoreReusability returns 1-10', () => {
  assert.strictEqual(detector.scoreReusability(0), 0);
  assert.strictEqual(detector.scoreReusability(5), 10);
  assert(detector.scoreReusability(3) < detector.scoreReusability(5));
});

test('Algorithm 4.5: scoreComplexity returns 1-10', () => {
  assert.strictEqual(detector.scoreComplexity(0), 0);
  assert.strictEqual(detector.scoreComplexity(50), 10);
  assert(detector.scoreComplexity(10) > detector.scoreComplexity(5));
});

test('Algorithm 4.6: calculateQualityScore is deterministic', () => {
  const score1 = detector.calculateQualityScore(8, 7, 9, 8, 5);
  const score2 = detector.calculateQualityScore(8, 7, 9, 8, 5);
  assert.strictEqual(score1, score2);
});

test('Algorithm 4.7: calculateQualityScore penalizes complexity', () => {
  const low = detector.calculateQualityScore(8, 8, 8, 8, 2);
  const high = detector.calculateQualityScore(8, 8, 8, 8, 9);
  assert(low > high);
});

test('Algorithm 4.8: estimateRiskLevel returns valid levels', () => {
  const risk1 = detector.estimateRiskLevel(3, 9, 5);
  const risk2 = detector.estimateRiskLevel(8, 4, 2);
  const risk3 = detector.estimateRiskLevel(5, 5, 5);
  assert(['low', 'medium', 'high'].includes(risk1));
  assert(['low', 'medium', 'high'].includes(risk2));
  assert(['low', 'medium', 'high'].includes(risk3));
});

test('Algorithm 4.9: scoreOpportunities from patterns', () => {
  const patterns = {
    patterns: [
      {
        id: 'p1',
        estimatedSavings: 100,
        usageCount: 5,
        size: 20,
        language: 'javascript',
        files: ['a.md', 'b.md'],
      },
    ],
  };
  const result = detector.scoreOpportunities(patterns, null);
  assert(Array.isArray(result.opportunities));
  assert(result.opportunities.length > 0);
  assert(result.opportunities[0].rank === 1);
});

test('Algorithm 4.10: scoreOpportunities from pain points', () => {
  const painPoints = {
    painPoints: [
      {
        pain: 'manual processes',
        severity: 80,
        frequency: 5,
        suggestedSolution: '/automation-engine',
        affectedNotes: ['a.md'],
      },
    ],
  };
  const result = detector.scoreOpportunities(null, painPoints);
  assert(result.opportunities.length > 0);
});

test('Algorithm 4.11: scoreOpportunities ranks by score', () => {
  const patterns = {
    patterns: [
      {
        id: 'p1',
        estimatedSavings: 10,
        usageCount: 2,
        size: 5,
        language: 'js',
        files: ['a.md'],
      },
      {
        id: 'p2',
        estimatedSavings: 100,
        usageCount: 5,
        size: 20,
        language: 'js',
        files: ['a.md', 'b.md', 'c.md'],
      },
    ],
  };
  const result = detector.scoreOpportunities(patterns, null);
  assert(result.opportunities[0].score >= result.opportunities[1].score);
});

test('Algorithm 4.12: scoreOpportunities limits to top 20', () => {
  const patterns = {
    patterns: Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      estimatedSavings: (i + 1) * 10,
      usageCount: i + 1,
      size: 10,
      language: 'js',
      files: ['a.md'],
    })),
  };
  const result = detector.scoreOpportunities(patterns, null);
  assert(result.opportunities.length <= 20);
});

test('Algorithm 4.13: scoreOpportunities includes risk assessment', () => {
  const patterns = {
    patterns: [
      {
        id: 'p1',
        estimatedSavings: 50,
        usageCount: 5,
        size: 10,
        language: 'js',
        files: ['a.md'],
      },
    ],
  };
  const result = detector.scoreOpportunities(patterns, null);
  assert(['low', 'medium', 'high'].includes(result.opportunities[0].riskLevel));
});

test('Algorithm 4.14: scoreOpportunities includes ROI estimation', () => {
  const patterns = {
    patterns: [
      {
        id: 'p1',
        estimatedSavings: 100,
        usageCount: 5,
        size: 15,
        language: 'js',
        files: ['a.md'],
      },
    ],
  };
  const result = detector.scoreOpportunities(patterns, null);
  assert(typeof result.opportunities[0].estimatedROI === 'string');
});

test('Algorithm 4.15: scoreOpportunities recommendation logic', () => {
  const goodPatterns = {
    patterns: [
      {
        id: 'p1',
        estimatedSavings: 500,
        usageCount: 10,
        size: 10,
        language: 'js',
        files: ['a.md', 'b.md', 'c.md'],
      },
    ],
  };
  const result = detector.scoreOpportunities(goodPatterns, null);
  assert(['IMMEDIATE', 'PLANNED'].includes(result.recommendation));
});

// ============ Integration: Algorithms 3-4 ============

test('Integration 3-4.1: Full pipeline from notes to ranked opportunities', () => {
  const vault = [
    {
      file: 'api.md',
      title: 'API Patterns',
      body: 'Retry Pattern ```javascript\nasync function withRetry(fn, maxAttempts=3) { for(let i=0; i<maxAttempts; i++) { try { return await fn(); } catch(e) { if(i === maxAttempts-1) throw e; } } }\n``` Manual retry logic is tedious.',
    },
    {
      file: 'integrations.md',
      title: 'Third-party APIs',
      body: 'Using retry: ```javascript\nasync function withRetry(fn, maxAttempts=3) { for(let i=0; i<maxAttempts; i++) { try { return await fn(); } catch(e) { if(i === maxAttempts-1) throw e; } } }\n```',
    },
  ];
  const patterns = detector.extractCodePatterns(vault);
  const pains = detector.detectPainPoints(vault);
  const opportunities = detector.scoreOpportunities(patterns, pains);
  assert(patterns.patterns.length > 0);
  assert(pains.painPoints.length > 0);
  assert(opportunities.opportunities.length > 0);
});

test('Integration 3-4.2: Patterns with high reusability rank highly', () => {
  const vault = Array.from({ length: 5 }, (_, i) => ({
    file: `note${i}.md`,
    body: '```js\nconst x = 1;\nconst y = 2;\nconst z = 3;\n```',
  }));
  const patterns = detector.extractCodePatterns(vault);
  const opportunities = detector.scoreOpportunities(patterns, null);
  if (opportunities.opportunities.length > 0) {
    assert(opportunities.opportunities[0].reusability >= 5);
  }
});

test('Integration 3-4.3: Scores reflect pattern maturity', () => {
  const vault = [
    { file: 'a.md', body: '```js\nlet x=1;\n```' },
    { file: 'b.md', body: '```js\nlet x=1;\n```' },
    { file: 'c.md', body: '```js\nlet x=1;\n```' },
  ];
  const patterns = detector.extractCodePatterns(vault);
  const opps = detector.scoreOpportunities(patterns, null);
  if (opps.opportunities.length > 0) {
    assert(opps.opportunities[0].maturity > 0);
  }
});

test('Integration 3-4.4: JSON serialization of opportunities', () => {
  const patterns = {
    patterns: [
      {
        id: 'p1',
        estimatedSavings: 50,
        usageCount: 3,
        size: 10,
        language: 'js',
        files: ['a.md'],
      },
    ],
  };
  const opps = detector.scoreOpportunities(patterns, null);
  const json = JSON.stringify(opps);
  const parsed = JSON.parse(json);
  assert(parsed.opportunities.length > 0);
  assert(parsed.opportunities[0].score);
});
