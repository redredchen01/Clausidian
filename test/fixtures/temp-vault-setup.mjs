/**
 * Temporary vault setup helpers for testing
 * Provides utilities to create, populate, and cleanup test vaults
 */

import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { generateNoteContent, SAMPLE_NOTES } from './vault-sample.mjs';

/**
 * Create a temporary vault with sample data
 *
 * @param {string} tmpDir - Temporary directory path
 * @param {Object} options - Configuration options
 * @param {number} options.noteCount - Number of sample notes to write (default: all)
 * @param {boolean} options.withMeta - Include _tags.md and _graph.md (default: true)
 * @returns {string} Path to created vault
 */
export function createSampleVault(tmpDir, options = {}) {
  const {
    noteCount = Object.keys(SAMPLE_NOTES).length,
    withMeta = true,
  } = options;

  // Clean and recreate directory
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(join(tmpDir, 'projects'), { recursive: true });
  mkdirSync(join(tmpDir, 'areas'), { recursive: true });
  mkdirSync(join(tmpDir, 'resources'), { recursive: true });
  mkdirSync(join(tmpDir, 'ideas'), { recursive: true });
  mkdirSync(join(tmpDir, 'journal'), { recursive: true });

  // Write sample notes (limited by noteCount)
  const notes = Object.entries(SAMPLE_NOTES).slice(0, noteCount);
  notes.forEach(([relPath, meta]) => {
    const fullPath = join(tmpDir, relPath);
    const content = generateNoteContent(meta);
    writeFileSync(fullPath, content, 'utf8');
  });

  // Write metadata files if requested
  if (withMeta) {
    // _tags.md — summary of all tags used
    const tags = new Set();
    notes.forEach(([_, meta]) => {
      meta.tags.forEach(tag => tags.add(tag));
    });
    const tagsContent = `# Tags\n\n${Array.from(tags)
      .sort()
      .map(tag => `- ${tag}`)
      .join('\n')}\n`;
    writeFileSync(join(tmpDir, '_tags.md'), tagsContent, 'utf8');

    // _graph.md — placeholder for relationship graph
    const graphContent = `# Relationship Graph\n\nGraph data for notes.\n`;
    writeFileSync(join(tmpDir, '_graph.md'), graphContent, 'utf8');
  }

  return tmpDir;
}

/**
 * Clean up a temporary vault
 *
 * @param {string} tmpDir - Temporary directory path
 */
export function cleanupVault(tmpDir) {
  rmSync(tmpDir, { recursive: true, force: true });
}

/**
 * Create a test vault from scratch (empty directory structure)
 *
 * @param {string} tmpDir - Temporary directory path
 * @returns {string} Path to created vault
 */
export function createEmptyVault(tmpDir) {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(join(tmpDir, 'projects'), { recursive: true });
  mkdirSync(join(tmpDir, 'areas'), { recursive: true });
  mkdirSync(join(tmpDir, 'resources'), { recursive: true });
  mkdirSync(join(tmpDir, 'ideas'), { recursive: true });
  mkdirSync(join(tmpDir, 'journal'), { recursive: true });

  // Initialize metadata files
  writeFileSync(join(tmpDir, '_tags.md'), '# Tags\n\n', 'utf8');
  writeFileSync(join(tmpDir, '_graph.md'), '# Relationship Graph\n\n', 'utf8');

  return tmpDir;
}

/**
 * Write a single note to vault
 *
 * @param {string} tmpDir - Vault directory path
 * @param {string} relPath - Relative path (e.g., 'projects/my-note.md')
 * @param {string} content - Markdown content
 */
export function writeNote(tmpDir, relPath, content) {
  const fullPath = join(tmpDir, relPath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

/**
 * Get timestamp for use in note metadata
 *
 * @param {Date} date - Date object (default: today)
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getDateString(date = new Date()) {
  return date.toISOString().split('T')[0];
}

/**
 * Create a note with metadata
 *
 * @param {string} tmpDir - Vault directory path
 * @param {string} relPath - Relative path
 * @param {Object} meta - Metadata (title, type, tags, status, summary, etc.)
 * @param {string} body - Note body content (default: empty)
 */
export function createNote(tmpDir, relPath, meta, body = '') {
  const defaultMeta = {
    title: 'Untitled',
    type: 'note',
    tags: [],
    status: 'active',
    summary: '',
    created: getDateString(),
    updated: getDateString(),
    related: [],
    body: body || '# ' + meta.title + '\n\n',
  };

  const finalMeta = { ...defaultMeta, ...meta };
  const content = generateNoteContent(finalMeta);
  writeNote(tmpDir, relPath, content);
}
