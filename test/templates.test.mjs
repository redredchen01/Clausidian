import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TemplateEngine } from '../src/templates.mjs';

describe('TemplateEngine', () => {
  // Use scaffold/templates as the builtin source
  const tpl = new TemplateEngine('/nonexistent-vault');

  it('loads builtin templates', () => {
    const content = tpl.load('journal');
    assert.ok(content.includes('{{DATE}}'));
  });

  it('renders with variable substitution', () => {
    const content = tpl.render('journal', {
      DATE: '2026-03-27',
      WEEKDAY: 'Fri',
      PREV_DATE: '2026-03-26',
      NEXT_DATE: '2026-03-28',
    });
    assert.ok(content.includes('2026-03-27'));
    assert.ok(content.includes('Fri'));
    assert.ok(!content.includes('{{DATE}}'));
  });

  it('throws on missing template', () => {
    assert.throws(() => tpl.load('nonexistent'), /Template not found/);
  });

  it('renders all template types', () => {
    for (const name of ['journal', 'project', 'idea', 'area', 'resource', 'note', 'weekly-review', 'monthly-review']) {
      const content = tpl.load(name);
      assert.ok(content.includes('---'), `${name} should have frontmatter`);
    }
  });
});
