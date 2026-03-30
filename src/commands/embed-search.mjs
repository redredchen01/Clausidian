/**
 * embed-search — semantic search using external embedding providers
 *
 * Optional Layer 3 search: uses Ollama (local) or OpenAI API for true
 * semantic understanding. Falls back to BM25 if no provider available.
 *
 * Zero npm dependencies — uses Node.js 18+ native fetch.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { Vault } from '../vault.mjs';

const CACHE_DIR = '.obsidian-agent';
const CACHE_FILE = 'embeddings.json';

// ── Provider detection ──

function detectOllama() {
  try {
    execFileSync('curl', ['-s', '--max-time', '2', 'http://localhost:11434/api/version'], {
      stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8',
    });
    return true;
  } catch { return false; }
}

function getProvider(opts = {}) {
  if (opts.provider === 'off') return null;
  if (opts.provider === 'ollama' || (!opts.provider && detectOllama())) {
    return { type: 'ollama', model: opts.model || 'nomic-embed-text', url: 'http://localhost:11434' };
  }
  const apiKey = opts.apiKey || process.env.OA_OPENAI_KEY || process.env.OPENAI_API_KEY;
  if (opts.provider === 'openai' || apiKey) {
    return { type: 'openai', model: opts.model || 'text-embedding-3-small', apiKey };
  }
  return null;
}

// ── Embedding functions ──

async function embedOllama(texts, provider) {
  const vectors = [];
  for (const text of texts) {
    const res = await fetch(`${provider.url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: provider.model, prompt: text.slice(0, 2000) }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    vectors.push(data.embedding);
  }
  return vectors;
}

async function embedOpenAI(texts, provider) {
  if (!provider.apiKey) throw new Error('OpenAI API key required. Set OA_OPENAI_KEY or OPENAI_API_KEY.');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: provider.model, input: texts.map(t => t.slice(0, 2000)) }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.data.map(d => d.embedding);
}

async function embed(texts, provider) {
  if (provider.type === 'ollama') return embedOllama(texts, provider);
  if (provider.type === 'openai') return embedOpenAI(texts, provider);
  throw new Error(`Unknown provider: ${provider.type}`);
}

// ── Cosine similarity ──

function cosineSim(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// ── Cache management ──

function loadCache(vaultRoot) {
  const path = join(vaultRoot, CACHE_DIR, CACHE_FILE);
  if (!existsSync(path)) return { provider: null, vectors: {}, updated: {} };
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return { provider: null, vectors: {}, updated: {} }; }
}

function saveCache(vaultRoot, cache) {
  const dir = join(vaultRoot, CACHE_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, CACHE_FILE), JSON.stringify(cache));
}

// ── Main search function ──

export async function embedSearch(vaultRoot, query, opts = {}) {
  if (!query) throw new Error('Usage: obsidian-agent embed-search <query>');

  const provider = getProvider(opts);
  if (!provider) {
    // Fallback to BM25
    console.log('No embedding provider available. Falling back to BM25 smart-search.');
    const { smartSearch } = await import('./smart-search.mjs');
    return smartSearch(vaultRoot, query, opts);
  }

  const vault = new Vault(vaultRoot);
  const notes = vault.scanNotes({ includeBody: true });

  // Load cache and find notes needing embedding
  const cache = loadCache(vaultRoot);
  const needsEmbed = [];
  const noteTexts = {};

  for (const note of notes) {
    const text = `${note.title || ''} ${(note.tags || []).join(' ')} ${note.summary || ''} ${note.body || ''}`;
    noteTexts[note.file] = text;
    if (!cache.vectors[note.file] || cache.updated[note.file] !== note.updated) {
      needsEmbed.push(note.file);
    }
  }

  // Embed new/changed notes
  if (needsEmbed.length > 0) {
    console.log(`Embedding ${needsEmbed.length} note(s) via ${provider.type}...`);
    const texts = needsEmbed.map(f => noteTexts[f]);
    const vectors = await embed(texts, provider);
    for (let i = 0; i < needsEmbed.length; i++) {
      cache.vectors[needsEmbed[i]] = vectors[i];
      const note = notes.find(n => n.file === needsEmbed[i]);
      cache.updated[needsEmbed[i]] = note?.updated;
    }
    cache.provider = `${provider.type}/${provider.model}`;
    saveCache(vaultRoot, cache);
  }

  // Remove deleted notes from cache
  const noteFiles = new Set(notes.map(n => n.file));
  for (const file of Object.keys(cache.vectors)) {
    if (!noteFiles.has(file)) {
      delete cache.vectors[file];
      delete cache.updated[file];
    }
  }

  // Embed query
  const [queryVector] = await embed([query], provider);

  // Score all notes
  const results = [];
  for (const note of notes) {
    const vec = cache.vectors[note.file];
    if (!vec) continue;
    if (opts.type && note.type !== opts.type) continue;
    if (opts.tag && !(note.tags || []).includes(opts.tag)) continue;
    if (opts.status && note.status !== opts.status) continue;
    const score = Math.round(cosineSim(queryVector, vec) * 1000) / 1000;
    if (score > 0.1) results.push({ file: note.file, title: note.title, type: note.type, status: note.status, summary: note.summary, score });
  }

  results.sort((a, b) => b.score - a.score);
  const limited = results.slice(0, opts.limit || 20);

  if (limited.length === 0) {
    console.log(`No semantic results for "${query}"`);
    return { query, provider: `${provider.type}/${provider.model}`, results: [] };
  }

  console.log(`\nFound ${limited.length} result(s) for "${query}" (${provider.type} embedding):\n`);
  console.log('| File | Type | Score | Summary |');
  console.log('|------|------|-------|---------|');
  for (const r of limited) {
    console.log(`| [[${r.file.replace(/\.md$/, '')}]] | ${r.type} | ${r.score} | ${r.summary || '-'} |`);
  }

  return { query, provider: `${provider.type}/${provider.model}`, results: limited };
}

/**
 * Get embedding provider status.
 */
export function embedStatus() {
  const ollama = detectOllama();
  const openaiKey = !!(process.env.OA_OPENAI_KEY || process.env.OPENAI_API_KEY);
  return {
    ollama: ollama ? 'available' : 'not running',
    openai: openaiKey ? 'key configured' : 'no key',
    active: ollama ? 'ollama' : openaiKey ? 'openai' : 'none (will use BM25 fallback)',
  };
}
