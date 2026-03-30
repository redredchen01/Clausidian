import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFrontmatter,
  extractBody,
  serializeFrontmatter,
  mergeFrontmatter,
  updateFrontmatterField,
} from '../src/frontmatter-utils.mjs';

const sampleContent = `---
title: Test Note
type: project
tags: [ai, ml, research]
status: active
summary: A test note for parsing
---

# Content Here

Some body text with **markdown**.
`;

const sampleContentNoBody = `---
title: No Body
type: idea
---`;

describe('Frontmatter Utils', () => {
  it('parses frontmatter from content', async () => {
    const fm = parseFrontmatter(sampleContent);
    assert.strictEqual(fm.title, 'Test Note');
    assert.strictEqual(fm.type, 'project');
    assert.deepEqual(fm.tags, ['ai', 'ml', 'research']);
    assert.strictEqual(fm.status, 'active');
  });

  it('returns empty object for content without frontmatter', async () => {
    const fm = parseFrontmatter('# No frontmatter\nJust content');
    assert.deepEqual(fm, {});
  });

  it('handles empty content', async () => {
    const fm = parseFrontmatter('');
    assert.deepEqual(fm, {});
  });

  it('handles null content gracefully', async () => {
    const fm = parseFrontmatter(null);
    assert.deepEqual(fm, {});
  });

  it('extracts body after frontmatter', async () => {
    const body = extractBody(sampleContent);
    assert(body.includes('# Content Here'));
    assert(body.includes('Some body text'));
    assert(!body.includes('---'));
  });

  it('returns empty string for content without body', async () => {
    const body = extractBody(sampleContentNoBody);
    assert.strictEqual(body, '');
  });

  it('extracts body from content with no frontmatter', async () => {
    const body = extractBody('# Title\nBody content');
    assert.strictEqual(body, '# Title\nBody content');
  });

  it('serializes frontmatter to YAML', async () => {
    const fm = { title: 'Test', type: 'project', tags: ['a', 'b'] };
    const yaml = serializeFrontmatter(fm);
    assert(yaml.startsWith('---\n'));
    assert(yaml.endsWith('---\n'));
    assert(yaml.includes('title: "Test"'));
    assert(yaml.includes('type: "project"'));
    assert(yaml.includes('tags: [a, b]'));
  });

  it('serializes with array values as list', async () => {
    const fm = { items: ['one', 'two', 'three'] };
    const yaml = serializeFrontmatter(fm);
    assert(yaml.includes('items: [one, two, three]'));
  });

  it('skips undefined and null values in serialization', async () => {
    const fm = { title: 'Test', undefined: undefined, nullVal: null };
    const yaml = serializeFrontmatter(fm);
    assert(yaml.includes('title'));
    assert(!yaml.includes('undefined'));
    assert(!yaml.includes('nullVal'));
  });

  it('merges new frontmatter into existing content', async () => {
    const updated = mergeFrontmatter(sampleContent, { status: 'archived', author: 'AI' });
    const fm = parseFrontmatter(updated);
    assert.strictEqual(fm.status, 'archived');
    assert.strictEqual(fm.author, 'AI');
    assert.strictEqual(fm.title, 'Test Note'); // existing value preserved
    assert(updated.includes('# Content Here')); // body preserved
  });

  it('merges preserves body content', async () => {
    const updated = mergeFrontmatter(sampleContent, { status: 'new' });
    const body = extractBody(updated);
    assert(body.includes('Some body text'));
  });

  it('updates single frontmatter field', async () => {
    const updated = updateFrontmatterField(sampleContent, 'status', 'completed');
    const fm = parseFrontmatter(updated);
    assert.strictEqual(fm.status, 'completed');
    assert.strictEqual(fm.title, 'Test Note'); // other fields preserved
  });

  it('updates field in content without original field', async () => {
    const updated = updateFrontmatterField(sampleContent, 'priority', 'high');
    const fm = parseFrontmatter(updated);
    assert.strictEqual(fm.priority, 'high');
  });

  it('handles empty content in merge', async () => {
    const result = mergeFrontmatter('', { title: 'New' });
    assert(result.includes('title: "New"'));
  });

  it('parses array values with quoted strings', async () => {
    const content = `---
tags: ["tag one", "tag two", "tag three"]
---`;
    const fm = parseFrontmatter(content);
    assert.deepEqual(fm.tags, ['tag one', 'tag two', 'tag three']);
  });

  it('parses array values with wiki links', async () => {
    const content = `---
related: [[[note1]], [[note2]]]
---`;
    const fm = parseFrontmatter(content);
    assert.deepEqual(fm.related, ['note1', 'note2']);
  });
});
