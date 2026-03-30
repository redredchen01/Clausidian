/**
 * auto-tag — suggest TF-IDF based tags for notes with empty tags
 *
 * Reuses TF-IDF logic from hook.mjs:noteCreated
 * Supports --dry-run to preview suggestions without writing
 */
import { Vault } from '../vault.mjs';
import { IndexManager } from '../index-manager.mjs';

// TF-IDF scoring — copied from hook.mjs
function scoreRelatedness(note1, note2, tagIDF) {
  let score = 0;
  const shared = [];

  for (const t of note1.tags) {
    if (note2.tags.includes(t)) {
      score += tagIDF[t] || 1;
      shared.push(t);
    }
  }

  if (note1.body && note2.body) {
    const words1 = new Set((note1.body.toLowerCase().match(/[a-z\u4e00-\u9fff]{3,}/g) || []).slice(0, 50));
    const words2 = new Set((note2.body.toLowerCase().match(/[a-z\u4e00-\u9fff]{3,}/g) || []).slice(0, 50));
    let overlap = 0;
    for (const w of words1) {
      if (words2.has(w)) overlap++;
    }
    score += Math.min(overlap * 0.1, 2);
  }

  return { score, shared };
}

export function autoTag(vaultRoot, options = {}) {
  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);
  const dryRun = options.dryRun || options['dry-run'];

  try {
    const allNotes = vault.scanNotes({ includeBody: true });

    // Find notes with empty tags
    const untagged = allNotes.filter(n => n.dir !== 'journal' && n.tags.length === 0);
    if (untagged.length === 0) {
      console.log('✓ All notes have tags assigned.');
      return { status: 'success', processed: 0, dryRun, suggestions: [] };
    }

    // Build tag IDF from tagged notes
    const tagged = allNotes.filter(n => n.dir !== 'journal' && n.tags.length > 0);
    const tagDF = {};
    for (const n of tagged) {
      for (const t of n.tags) tagDF[t] = (tagDF[t] || 0) + 1;
    }
    const tagIDF = {};
    for (const [tag, df] of Object.entries(tagDF)) {
      tagIDF[tag] = Math.log((tagged.length || 1) / df);
    }

    // Process each untagged note
    const suggestions = [];
    for (const untagNote of untagged) {
      const candidates = tagged.filter(t => t.file !== untagNote.file);
      const scored = candidates
        .map(c => ({ file: c.file, ...scoreRelatedness(untagNote, c, tagIDF) }))
        .filter(s => s.score >= 1.5)
        .sort((a, b) => b.score - a.score);

      // Extract top 3 tags from related notes
      const tagCounts = {};
      for (const s of scored.slice(0, 5)) {
        for (const tag of s.shared) {
          tagCounts[tag] = (tagCounts[tag] || 0) + s.score;
        }
      }

      const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag]) => `suggested-${tag}`);

      if (topTags.length > 0) {
        suggestions.push({
          file: untagNote.file,
          type: untagNote.type,
          suggestedTags: topTags,
        });

        if (!dryRun) {
          // Update note frontmatter with suggested tags
          const content = vault.read(untagNote.dir, `${untagNote.file}.md`);
          if (content) {
            const updated = content.replace(
              /tags:\s*\[\s*\]/,
              `tags: [${topTags.join(', ')}]`
            );
            if (updated !== content) {
              vault.write(untagNote.dir, `${untagNote.file}.md`, updated);
            }
          }
        }
      }
    }

    // Output results
    if (dryRun) {
      console.log(`\n=== Auto-Tag Suggestions (${untagged.length} untagged) ===\n`);
      for (const s of suggestions) {
        console.log(`[[${s.file}]] (${s.type}):`);
        console.log(`  tags: [${s.suggestedTags.join(', ')}]`);
      }
      if (suggestions.length === 0) {
        console.log('(No tag suggestions found)');
      }
    }

    return {
      status: 'success',
      processed: suggestions.length,
      dryRun,
      suggestions,
    };
  } catch (err) {
    console.error(`[auto-tag error] ${err.message}`);
    return { status: 'error', error: err.message };
  }
}
