/**
 * Obsidian Bases (.base) support — read/write/query structured data views
 *
 * Bases are YAML files that define filtered, sorted views over vault notes.
 * Uses yaml-lite for zero-dependency YAML parsing.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { parseYaml, toYaml } from '../yaml-lite.mjs';
import { Vault } from '../vault.mjs';

function basePath(vaultRoot, name) {
  if (!name.endsWith('.base')) name += '.base';
  return resolve(vaultRoot, name);
}

/**
 * Create a new .base file.
 */
export function baseCreate(vaultRoot, name, { filters, views, formulas } = {}) {
  if (!name) throw new Error('Usage: base create <name>');
  const path = basePath(vaultRoot, name);
  if (existsSync(path)) {
    console.log(`Base already exists: ${name}`);
    return { status: 'exists', file: name };
  }

  const data = {
    filters: filters || {},
    views: views || [{ type: 'table', name: 'Default' }],
  };
  if (formulas) data.formulas = formulas;

  writeFileSync(path, toYaml(data));
  console.log(`Created base: ${name}`);
  return { status: 'created', file: name };
}

/**
 * Read and parse a .base file.
 */
export function baseRead(vaultRoot, name) {
  if (!name) throw new Error('Usage: base read <name>');
  const path = basePath(vaultRoot, name);
  if (!existsSync(path)) throw new Error(`Base not found: ${name}`);

  const content = readFileSync(path, 'utf8');
  const data = parseYaml(content);

  console.log(`Base: ${name}`);
  if (data.filters) console.log(`  Filters: ${JSON.stringify(data.filters)}`);
  if (data.views) console.log(`  Views: ${(data.views || []).map(v => v.name || v.type).join(', ')}`);
  if (data.formulas) console.log(`  Formulas: ${Object.keys(data.formulas).join(', ')}`);

  return data;
}

/**
 * Query vault notes using base filter definitions.
 * Supports basic filters: type, tag, status, folder.
 */
export function baseQuery(vaultRoot, name, { view } = {}) {
  if (!name) throw new Error('Usage: base query <name>');
  const path = basePath(vaultRoot, name);
  if (!existsSync(path)) throw new Error(`Base not found: ${name}`);

  const content = readFileSync(path, 'utf8');
  const data = parseYaml(content);
  const vault = new Vault(vaultRoot);
  let notes = vault.scanNotes();

  // Apply global filters
  notes = applyFilters(notes, data.filters);

  // Apply view-specific filters
  if (view && data.views) {
    const v = data.views.find(v => v.name === view || v.type === view);
    if (v?.filters) notes = applyFilters(notes, v.filters);
    if (v?.limit) notes = notes.slice(0, v.limit);
  }

  // Sort by order if specified
  const selectedView = view
    ? data.views?.find(v => v.name === view)
    : data.views?.[0];

  if (selectedView?.order) {
    const orderField = Array.isArray(selectedView.order) ? selectedView.order[0] : selectedView.order;
    const field = orderField.replace(/^note\./, '');
    notes.sort((a, b) => String(a[field] || '').localeCompare(String(b[field] || '')));
  }

  console.log(`\nBase query: ${name}${view ? ` (view: ${view})` : ''}`);
  console.log(`Found ${notes.length} note(s):\n`);
  console.log('| File | Type | Status | Summary |');
  console.log('|------|------|--------|---------|');
  for (const n of notes) {
    console.log(`| [[${n.file.replace(/\.md$/, '')}]] | ${n.type} | ${n.status} | ${n.summary || '-'} |`);
  }

  return { base: name, view: view || 'default', count: notes.length, results: notes };
}

/**
 * Apply filter object to notes array.
 */
function applyFilters(notes, filters) {
  if (!filters || typeof filters !== 'object') return notes;

  // Handle 'and' array
  if (Array.isArray(filters.and)) {
    for (const condition of filters.and) {
      notes = applyCondition(notes, condition);
    }
  }

  // Handle 'or' array
  if (Array.isArray(filters.or)) {
    const sets = filters.or.map(c => new Set(applyCondition([...notes], c).map(n => n.file)));
    const union = new Set();
    for (const s of sets) for (const f of s) union.add(f);
    notes = notes.filter(n => union.has(n.file));
  }

  // Handle direct key-value filters
  for (const [key, value] of Object.entries(filters)) {
    if (key === 'and' || key === 'or' || key === 'not') continue;
    notes = notes.filter(n => {
      const field = key.replace(/^note\./, '').replace(/^file\./, '');
      return String(n[field]) === String(value);
    });
  }

  return notes;
}

function applyCondition(notes, condition) {
  if (typeof condition === 'string') {
    // Parse simple expressions like: file.hasTag("project")
    const tagMatch = condition.match(/file\.hasTag\(["'](.+?)["']\)/);
    if (tagMatch) return notes.filter(n => (n.tags || []).includes(tagMatch[1]));

    // Parse: status == "active"
    const eqMatch = condition.match(/(\w+)\s*==\s*["'](.+?)["']/);
    if (eqMatch) return notes.filter(n => String(n[eqMatch[1]]) === eqMatch[2]);

    // Parse: status != "archived"
    const neqMatch = condition.match(/(\w+)\s*!=\s*["'](.+?)["']/);
    if (neqMatch) return notes.filter(n => String(n[neqMatch[1]]) !== neqMatch[2]);

    // Parse: file.inFolder("projects")
    const folderMatch = condition.match(/file\.inFolder\(["'](.+?)["']\)/);
    if (folderMatch) return notes.filter(n => n.dir?.includes(folderMatch[1]));
  }
  return notes;
}
