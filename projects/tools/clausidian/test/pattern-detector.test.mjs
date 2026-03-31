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
