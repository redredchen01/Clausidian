/**
 * digest — generate a project status digest from scattered sources
 *
 * Combines: findNote, read, backlinks, search, scanNotes, dates, templates, indexManager
 */
import { readdirSync } from 'fs';
import { Vault } from '../vault.mjs';
import { TemplateEngine } from '../templates.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr, getWeekDates, getWeekLabel } from '../dates.mjs';

function daysBetween(dateA, dateB) {
  const a = new Date(dateA + 'T12:00:00Z');
  const b = new Date(dateB + 'T12:00:00Z');
  return Math.round((b - a) / 86400000);
}

function extractTodos(body) {
  if (!body) return [];
  return body.split('\n')
    .filter(l => l.trim().startsWith('- [ ]'))
    .map(l => l.trim());
}

function extractMentions(content, projectName, projectTitle) {
  if (!content) return [];
  const lines = content.split('\n');
  return lines.filter(l => {
    const lower = l.toLowerCase();
    return l.includes(`[[${projectName}]]`) ||
           lower.includes(projectTitle.toLowerCase());
  }).map(l => l.trim()).filter(l => l.startsWith('- ') && l !== '-');
}

function buildSingleDigest(vault, projectNote, startDate, endDate, today) {
  const fm = projectNote;
  const fullContent = vault.read(fm.dir, `${fm.file}.md`);
  const body = vault.extractBody(fullContent || '');
  const todos = extractTodos(body);

  // Find journal mentions in date range
  const journalMentions = [];
  const journalDir = vault.path('journal');
  let journalFiles;
  try { journalFiles = readdirSync(journalDir); } catch { journalFiles = []; }

  for (const file of journalFiles) {
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!dateMatch) continue;
    const d = dateMatch[1];
    if (d < startDate || d > endDate) continue;
    const jContent = vault.read('journal', file);
    if (!jContent) continue;
    const mentions = extractMentions(jContent, fm.file, fm.title);
    if (mentions.length) {
      journalMentions.push({ date: d, lines: mentions });
    }
  }

  // Find backlinks activity in date range
  const bl = vault.backlinks(fm.file);
  const blActivity = bl.filter(n => n.updated >= startDate && n.updated <= endDate);
  const newBacklinks = blActivity.filter(n => n.created >= startDate && n.created <= endDate);

  // Find related notes' status changes
  const allNotes = vault.scanNotes();
  const relatedUpdates = [];
  for (const relName of fm.related) {
    const relNote = allNotes.find(n => n.file === relName);
    if (!relNote) continue;
    const changed = relNote.updated >= startDate && relNote.updated <= endDate;
    relatedUpdates.push({
      file: relNote.file,
      type: relNote.type,
      changed,
      updated: relNote.updated,
    });
  }

  // Compute momentum score (0-10)
  const journalScore = Math.min(journalMentions.length * 2, 6);
  const relatedScore = Math.min(relatedUpdates.filter(r => r.changed).length * 1.5, 3);
  const blScore = Math.min(blActivity.length, 1);
  const momentum = Math.min(Math.round(journalScore + relatedScore + blScore), 10);

  return {
    file: fm.file,
    title: fm.title,
    type: fm.type,
    status: fm.status,
    tags: fm.tags,
    summary: fm.summary,
    todos,
    journalMentions,
    relatedUpdates,
    backlinkActivity: blActivity.length,
    newBacklinks: newBacklinks.length,
    momentum,
  };
}

export function digest(vaultRoot, { project, all = false, days = 7, date } = {}) {
  const vault = new Vault(vaultRoot);
  const tpl = new TemplateEngine(vaultRoot);
  const idx = new IndexManager(vault);
  const today = todayStr();

  // Calculate date range
  const endDate = date || today;
  const startD = new Date(endDate + 'T12:00:00Z');
  startD.setDate(startD.getDate() - days + 1);
  const startDate = startD.toISOString().slice(0, 10);

  const weekInfo = getWeekLabel(startDate);

  if (all) {
    // ── All active projects dashboard ──
    const allNotes = vault.scanNotes();
    const projects = allNotes.filter(n => n.type === 'project' && n.status === 'active');

    if (!projects.length) {
      console.log('No active projects found.');
      return { status: 'empty', projects: [] };
    }

    const digests = projects.map(p => buildSingleDigest(vault, p, startDate, endDate, today));
    digests.sort((a, b) => b.momentum - a.momentum);

    // Build dashboard
    const tableRows = digests.map(d =>
      `| [[${d.file}]] | ${d.momentum}/10 | ${d.journalMentions.length} | ${d.relatedUpdates.filter(r => r.changed).length} | ${d.todos.length} |`
    ).join('\n');

    const attentionNeeded = digests
      .filter(d => d.momentum === 0)
      .map(d => `- [[${d.file}]] — zero activity, still marked active`);
    const lowMomentum = digests
      .filter(d => d.momentum > 0 && d.momentum <= 3)
      .map(d => `- [[${d.file}]] — low momentum (${d.momentum}/10), ${d.todos.length} open TODOs`);

    const warningSection = [...attentionNeeded, ...lowMomentum].join('\n') || '- All projects active';

    const content = `---
title: "Projects Digest (${startDate} ~ ${endDate})"
type: journal
tags: [project-digest]
created: "${today}"
updated: "${today}"
status: active
summary: "${projects.length} active projects digested"
---

# Active Projects Digest

> Period: ${startDate} ~ ${endDate}

## Dashboard

| Project | Momentum | Journal Mentions | Related Updates | Open TODOs |
|---------|----------|-----------------|-----------------|------------|
${tableRows}

## Attention Needed

${warningSection}
`;

    const filename = `projects-digest-${today}`;
    vault.write('journal', `${filename}.md`, content);
    idx.updateDirIndex('journal', filename, `${projects.length} active projects digested`);
    idx.rebuildTags();

    console.log(`Created journal/${filename}.md (${projects.length} projects)`);
    for (const d of digests) {
      const indicator = d.momentum === 0 ? '⚠' : d.momentum <= 3 ? '◎' : '●';
      console.log(`  ${indicator} [[${d.file}]] momentum ${d.momentum}/10`);
    }

    return {
      status: 'created',
      file: `journal/${filename}.md`,
      projects: digests.map(({ todos, ...rest }) => ({ ...rest, openTodos: todos.length })),
    };
  }

  // ── Single project digest ──
  if (!project) {
    throw new Error('Usage: obsidian-agent digest <project-name> or obsidian-agent digest --all');
  }

  const projectNote = vault.findNote(project);
  if (!projectNote) {
    throw new Error(`Project not found: "${project}"`);
  }
  if (projectNote.type !== 'project') {
    throw new Error(`"${project}" is type "${projectNote.type}", not a project.`);
  }

  const d = buildSingleDigest(vault, projectNote, startDate, endDate, today);

  // Build journal mentions section
  const journalSection = d.journalMentions.length
    ? d.journalMentions.map(jm =>
        jm.lines.map(l => `- ${jm.date}: ${l.replace(/^- /, '')}`).join('\n')
      ).join('\n')
    : '- No journal mentions this period';

  // Build related notes table
  const relatedTable = d.relatedUpdates.length
    ? d.relatedUpdates.map(r =>
        `| [[${r.file}]] | ${r.type} | ${r.changed ? `Updated ${r.updated}` : 'No change'} |`
      ).join('\n')
    : '| - | - | - |';

  // Build TODO list
  const todoSection = d.todos.length
    ? d.todos.join('\n')
    : '- [ ] No TODOs found in project note';

  const content = `---
title: "Digest: ${d.title} (${startDate} ~ ${endDate})"
type: journal
tags: [project-digest, ${d.file}]
created: "${today}"
updated: "${today}"
status: active
summary: "Status digest for ${d.title}"
related: ["[[${d.file}]]"]
---

# Project Digest: ${d.title}

> Period: ${startDate} ~ ${endDate}

## Current State

- **Status:** ${d.status}
- **Summary:** ${d.summary || '(none)'}
- **Tags:** ${d.tags.join(', ') || 'none'}

## Activity This Period

### Journal Mentions (${d.journalMentions.length})

${journalSection}

### Related Notes

| Note | Type | Change |
|------|------|--------|
${relatedTable}

### Backlink Activity

- ${d.backlinkActivity} notes reference [[${d.file}]] this period
${d.newBacklinks ? `- ${d.newBacklinks} new backlink(s)` : ''}

## Open TODOs

${todoSection}

## Momentum

Score: **${d.momentum}/10** (${d.journalMentions.length} journal mentions, ${d.relatedUpdates.filter(r => r.changed).length} related updates, ${d.backlinkActivity} backlink refs)
`;

  const filename = `digest-${d.file}-${today}`;
  vault.write('journal', `${filename}.md`, content);
  idx.updateDirIndex('journal', filename, `Digest for ${d.title}`);
  idx.rebuildTags();

  console.log(`Created journal/${filename}.md (momentum: ${d.momentum}/10, ${d.journalMentions.length} mentions, ${d.todos.length} TODOs)`);

  return {
    status: 'created',
    file: `journal/${filename}.md`,
    project: d.file,
    momentum: d.momentum,
    journalMentions: d.journalMentions.length,
    relatedUpdates: d.relatedUpdates.filter(r => r.changed).length,
    backlinkActivity: d.backlinkActivity,
    openTodos: d.todos.length,
  };
}
