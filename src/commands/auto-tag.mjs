/**
 * auto-tag — suggest tags for untagged notes based on TF-IDF relatedness
 */
import { Vault } from '../vault.mjs';
import { FrontmatterUtils } from '../frontmatter-utils.mjs';

export function autoTag(vaultRoot, { dryRun = false } = {}) {
  const vault = new Vault(vaultRoot);
  const allNotes = vault.scanNotes({ includeBody: true });

  // Find notes without tags
  const untaggedNotes = allNotes.filter(n => n.dir !== 'journal' && n.tags.length === 0);

  if (untaggedNotes.length === 0) {
    console.log('✓ No untagged notes found');
    return { processed: 0, suggested: 0 };
  }

  // Build tag IDF from tagged notes
  const taggedNotes = allNotes.filter(n => n.dir !== 'journal' && n.tags.length > 0);
  const tagDF = {};
  for (const n of taggedNotes) {
    for (const t of n.tags) {
      tagDF[t] = (tagDF[t] || 0) + 1;
    }
  }

  const tagIDF = {};
  for (const [tag, df] of Object.entries(tagDF)) {
    tagIDF[tag] = Math.log(Math.max(taggedNotes.length, 1) / df);
  }

  // Process each untagged note
  let suggestedCount = 0;
  const results = [];

  for (const note of untaggedNotes) {
    // Find most related tagged note
    const related = taggedNotes.map(c => ({
      file: c.file,
      ...scoreRelatedness(note, c, tagIDF)
    }))
      .filter(s => s.score >= 1.0 && s.shared.length >= 1)
      .sort((a, b) => b.score - a.score);

    if (related.length > 0) {
      // Get top tag suggestions (from the most related note)
      const topRelated = related[0];
      const suggestionTags = topRelated.shared.slice(0, 3).map(t => `suggested-${t}`);

      results.push({
        note: note.file,
        suggestedTags: suggestionTags,
        relatedNote: topRelated.file,
        score: Math.round(topRelated.score * 10) / 10
      });

      if (!dryRun) {
        // Write back to file
        const filePath = vault.path(note.dir, `${note.file}.md`);
        const content = vault.read(note.dir, `${note.file}.md`);
        const fm = FrontmatterUtils.parse(content);

        // Add suggested tags to frontmatter
        if (!fm.tags) fm.tags = [];
        fm.tags.push(...suggestionTags);
        fm.tags = [...new Set(fm.tags)]; // Deduplicate

        const updated = FrontmatterUtils.stringify(fm, content.split('\n').slice(fm.endLine).join('\n'));
        vault.write(note.dir, `${note.file}.md`, updated);
      }

      suggestedCount++;
    }
  }

  // Output results
  if (dryRun) {
    console.log(`\n📋 Tag suggestions (--dry-run mode)\n`);
    for (const r of results) {
      console.log(`  ${r.note}`);
      console.log(`    → ${r.suggestedTags.join(', ')} (related: ${r.relatedNote}, score: ${r.score})`);
    }
    console.log(`\nWould tag ${suggestedCount}/${untaggedNotes.length} notes`);
  } else {
    console.log(`✓ Tagged ${suggestedCount}/${untaggedNotes.length} notes with suggestions`);
    for (const r of results) {
      console.log(`  ${r.note} ← ${r.suggestedTags.join(', ')}`);
    }
  }

  return { processed: untaggedNotes.length, suggested: suggestedCount };
}

function scoreRelatedness(note1, note2, tagIDF) {
  let score = 0;
  const shared = [];

  // TF-IDF weighted tag overlap
  if (note2.tags && note2.tags.length > 0) {
    for (const t of note2.tags) {
      score += tagIDF[t] || 1;
      shared.push(t);
    }
  }

  // Simple keyword co-occurrence (if body available)
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
