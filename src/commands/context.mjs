/**
 * context — assemble full context around a note or topic
 *
 * Combines: read, backlinks, findRelated, cluster (tag co-occurrence),
 *           search (journal mentions), extractBody
 * Outputs a single comprehensive context document for deep work sessions.
 */
import { readdirSync } from 'fs';
import { Vault } from '../vault.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr } from '../dates.mjs';

export function context(vaultRoot, noteName, { days = 30, output } = {}) {
  if (!noteName) {
    throw new Error('Usage: obsidian-agent context <note-name>');
  }

  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);
  const today = todayStr();

  // Resolve note
  const note = vault.findNote(noteName);
  if (!note) {
    throw new Error(`Note not found: "${noteName}"`);
  }

  // 1. Read full source note
  const fullContent = vault.read(note.dir, `${note.file}.md`);
  const body = vault.extractBody(fullContent || '');

  // 2. Backlinks — notes that reference this note
  const bl = vault.backlinks(note.file);
  const backlinkDetails = bl.map(b => {
    const bContent = vault.read(b.dir, `${b.file}.md`);
    const bBody = vault.extractBody(bContent || '');
    // Extract the lines that mention the note
    const mentionLines = bBody.split('\n')
      .filter(l => l.includes(`[[${note.file}]]`))
      .map(l => l.trim())
      .slice(0, 3);
    return {
      file: b.file,
      dir: b.dir,
      type: b.type,
      title: b.title,
      summary: b.summary,
      mentionLines,
    };
  });

  // 3. Related notes — from the related field
  const relatedDetails = [];
  const allNotes = vault.scanNotes();
  for (const relName of note.related) {
    const relNote = allNotes.find(n => n.file === relName);
    if (!relNote) continue;
    relatedDetails.push({
      file: relNote.file,
      dir: relNote.dir,
      type: relNote.type,
      title: relNote.title,
      summary: relNote.summary,
      status: relNote.status,
      tags: relNote.tags,
    });
  }

  // 4. Cluster members — notes sharing 2+ tags (lightweight clustering)
  const eligible = allNotes.filter(n =>
    n.type !== 'journal' && n.status !== 'archived' && n.file !== note.file
  );
  const clusterMembers = eligible
    .map(n => {
      const sharedTags = note.tags.filter(t => n.tags.includes(t));
      return { ...n, sharedTags };
    })
    .filter(n => n.sharedTags.length >= 2)
    .sort((a, b) => b.sharedTags.length - a.sharedTags.length)
    .slice(0, 10)
    .map(n => ({
      file: n.file,
      type: n.type,
      title: n.title,
      summary: n.summary,
      sharedTags: n.sharedTags,
    }));

  // 5. Journal mentions — recent journals that reference this note
  const cutoffD = new Date(today + 'T12:00:00Z');
  cutoffD.setDate(cutoffD.getDate() - days);
  const cutoff = cutoffD.toISOString().slice(0, 10);

  const journalDir = vault.path('journal');
  let journalFiles;
  try { journalFiles = readdirSync(journalDir); } catch { journalFiles = []; }

  const journalMentions = [];
  for (const file of journalFiles) {
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!dateMatch) continue;
    const d = dateMatch[1];
    if (d < cutoff) continue;

    const content = vault.read('journal', file);
    if (!content) continue;

    const lines = content.split('\n').filter(l =>
      l.includes(`[[${note.file}]]`) ||
      l.toLowerCase().includes(note.title.toLowerCase())
    ).map(l => l.trim()).filter(l => l.startsWith('- ') && l.length > 5);

    if (lines.length) {
      journalMentions.push({ date: d, lines: lines.slice(0, 5) });
    }
  }
  journalMentions.sort((a, b) => b.date.localeCompare(a.date)); // Most recent first

  // 6. Content-similar notes (via findRelated)
  const contentSimilar = vault.findRelated(note.title, note.tags)
    .filter(n => n.file !== note.file && !note.related.includes(n.file))
    .map(n => ({
      file: n.file,
      type: n.type,
      title: n.title,
      summary: n.summary,
    }));

  // Build output document
  const backlinksSection = backlinkDetails.length
    ? backlinkDetails.map(b => {
        const mentions = b.mentionLines.length
          ? '\n' + b.mentionLines.map(l => `    > ${l}`).join('\n')
          : '';
        return `- **[[${b.file}]]** (${b.type}) — ${b.summary || b.title}${mentions}`;
      }).join('\n')
    : '- (none)';

  const relatedSection = relatedDetails.length
    ? relatedDetails.map(r =>
        `- **[[${r.file}]]** (${r.type}, ${r.status}) — ${r.summary || r.title}`
      ).join('\n')
    : '- (none)';

  const clusterSection = clusterMembers.length
    ? clusterMembers.map(c =>
        `- **[[${c.file}]]** (${c.type}) — ${c.summary || c.title} [shared: ${c.sharedTags.join(', ')}]`
      ).join('\n')
    : '- (no cluster members found)';

  const journalSection = journalMentions.length
    ? journalMentions.map(jm =>
        jm.lines.map(l => `- ${jm.date}: ${l.replace(/^- /, '')}`).join('\n')
      ).join('\n')
    : '- (no recent journal mentions)';

  const similarSection = contentSimilar.length
    ? contentSimilar.map(s =>
        `- **[[${s.file}]]** (${s.type}) — ${s.summary || s.title}`
      ).join('\n')
    : '- (none)';

  const contextDoc = `# Context: ${note.title}

> Type: ${note.type} | Status: ${note.status} | Tags: ${note.tags.join(', ') || 'none'}
> Created: ${note.created} | Updated: ${note.updated}
> Dir: ${note.dir}/${note.file}.md

## Source Note

${body || '(empty)'}

## Backlinks (${backlinkDetails.length} notes reference this)

${backlinksSection}

## Related Notes (${relatedDetails.length})

${relatedSection}

## Topic Cluster (${clusterMembers.length} notes share 2+ tags)

${clusterSection}

## Recent Journal Mentions (last ${days} days)

${journalSection}

## Content-Similar Notes

${similarSection}
`;

  // Optionally write to file
  if (output === 'file') {
    const filename = `context-${note.file}-${today}`;
    vault.write('journal', `${filename}.md`, `---
title: "Context: ${note.title}"
type: journal
tags: [context-assembly]
created: "${today}"
updated: "${today}"
status: active
summary: "Full context for ${note.title}"
related: ["[[${note.file}]]"]
---

${contextDoc}`);
    idx.updateDirIndex('journal', filename, `Context assembly for ${note.title}`);
    console.log(`Context written to journal/${filename}.md`);
  } else {
    console.log(contextDoc);
  }

  return {
    status: 'ok',
    note: note.file,
    title: note.title,
    backlinks: backlinkDetails.length,
    related: relatedDetails.length,
    clusterMembers: clusterMembers.length,
    journalMentions: journalMentions.length,
    contentSimilar: contentSimilar.length,
    ...(output === 'file' ? { file: `journal/context-${note.file}-${today}.md` } : {}),
    context: contextDoc,
  };
}

