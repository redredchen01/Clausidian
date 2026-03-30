import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TFIDFIndex } from '../src/tfidf-utils.mjs';

describe('TFIDFIndex', () => {
  it('builds index from documents', async () => {
    const index = new TFIDFIndex();
    const docs = [
      { tag: 'ai', docId: 'doc1' },
      { tag: 'ai', docId: 'doc2' },
      { tag: 'ai', docId: 'doc3' },
      { tag: 'ml', docId: 'doc1' },
      { tag: 'ml', docId: 'doc2' },
      { tag: 'rare', docId: 'doc4' },
    ];
    index.build(docs);
    assert.strictEqual(index.totalDocuments, 4);
    assert.strictEqual(index.getDocumentFrequency('ai'), 3);
    assert.strictEqual(index.getDocumentFrequency('ml'), 2);
    assert.strictEqual(index.getDocumentFrequency('rare'), 1);
  });

  it('calculates IDF weights correctly', async () => {
    const index = new TFIDFIndex();
    const docs = [
      { tag: 'common', docId: 'd1' },
      { tag: 'common', docId: 'd2' },
      { tag: 'common', docId: 'd3' },
      { tag: 'rare', docId: 'd4' },
    ];
    index.build(docs);
    const commonIdf = index.score('common');
    const rareIdf = index.score('rare');
    assert(rareIdf > commonIdf, 'rare tags should have higher IDF');
  });

  it('scores tags by IDF weight', async () => {
    const index = new TFIDFIndex();
    index.build([
      { tag: 'tag1', docId: 'd1' },
      { tag: 'tag1', docId: 'd2' },
      { tag: 'tag2', docId: 'd3' },
    ]);
    const score1 = index.score('tag1');
    const score2 = index.score('tag2');
    assert(typeof score1 === 'number');
    assert(typeof score2 === 'number');
    assert(score1 > 0);
    assert(score2 > 0);
  });

  it('returns default weight 1 for unknown tags', async () => {
    const index = new TFIDFIndex();
    index.build([{ tag: 'known', docId: 'd1' }]);
    assert.strictEqual(index.score('unknown'), 1);
  });

  it('gets all doc weights sorted by descending', async () => {
    const index = new TFIDFIndex();
    index.build([
      { tag: 'a', docId: 'd1' },
      { tag: 'a', docId: 'd2' },
      { tag: 'b', docId: 'd3' },
      { tag: 'c', docId: 'd1' },
      { tag: 'c', docId: 'd2' },
      { tag: 'c', docId: 'd3' },
    ]);
    const weights = index.getAllDocWeights(['a', 'b', 'c']);
    assert.strictEqual(weights.length, 3);
    assert(weights[0].weight >= weights[1].weight);
    assert(weights[1].weight >= weights[2].weight);
  });

  it('handles empty build gracefully', async () => {
    const index = new TFIDFIndex();
    index.build([]);
    assert.strictEqual(index.totalDocuments, 0);
    assert.strictEqual(index.score('any'), 1);
  });

  it('filters out duplicate tag-doc pairs in build', async () => {
    const index = new TFIDFIndex();
    index.build([
      { tag: 'dup', docId: 'd1' },
      { tag: 'dup', docId: 'd1' },
      { tag: 'dup', docId: 'd1' },
    ]);
    assert.strictEqual(index.getDocumentFrequency('dup'), 1);
    assert.strictEqual(index.totalDocuments, 1);
  });

  it('returns document frequency for tag', async () => {
    const index = new TFIDFIndex();
    index.build([
      { tag: 'test', docId: 'd1' },
      { tag: 'test', docId: 'd2' },
    ]);
    assert.strictEqual(index.getDocumentFrequency('test'), 2);
    assert.strictEqual(index.getDocumentFrequency('nonexistent'), 0);
  });

  it('returns inverse frequency for tag', async () => {
    const index = new TFIDFIndex();
    index.build([
      { tag: 'test', docId: 'd1' },
      { tag: 'test', docId: 'd2' },
      { tag: 'other', docId: 'd3' },
    ]);
    const idf = index.getInverseFrequency('test');
    assert(idf > 0);
    const missing = index.getInverseFrequency('unknown');
    assert.strictEqual(missing, 1);
  });

  it('handles mixed document frequencies', async () => {
    const index = new TFIDFIndex();
    index.build([
      { tag: 'freq', docId: 'd1' },
      { tag: 'freq', docId: 'd2' },
      { tag: 'freq', docId: 'd3' },
      { tag: 'freq', docId: 'd4' },
      { tag: 'rare', docId: 'd5' },
    ]);
    const freqWeight = index.score('freq');
    const rareWeight = index.score('rare');
    assert(rareWeight > freqWeight, 'rare tag should score higher');
  });
});
