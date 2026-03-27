/**
 * review — generate weekly review from journal entries
 */
import { readdirSync, existsSync } from 'fs';
import { Vault } from '../vault.mjs';
import { TemplateEngine } from '../templates.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr, getWeekDates, getWeekLabel, getMonthRange } from '../dates.mjs';

function injectSection(content, heading, data) {
  // Replace the placeholder "-" line after a ## heading with actual data
  const regex = new RegExp(`(## ${heading}\n\n)-(\n|$)`);
  return content.replace(regex, `$1${data}\n`);
}

function extractSection(content, heading) {
  const regex = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |\\n---|$)`);
  const match = content.match(regex);
  if (!match) return [];
  return match[1].trim().split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('- ') && l !== '-' && !l.includes('no activity'));
}

export function review(vaultRoot, { date } = {}) {
  const vault = new Vault(vaultRoot);
  const tpl = new TemplateEngine(vaultRoot);
  const idx = new IndexManager(vault);

  const dates = getWeekDates(date);
  const { week, weekNum, year } = getWeekLabel(dates[0]);

  // Aggregate daily journals
  const allCompleted = [];
  const allIssues = [];
  const allIdeas = [];
  const allPlans = [];

  for (const d of dates) {
    const content = vault.read('journal', `${d}.md`);
    if (!content) continue;
    // Try both CN and EN section headers
    allCompleted.push(
      ...extractSection(content, '今日記錄'),
      ...extractSection(content, '今日记录'),
      ...extractSection(content, 'Records'),
    );
    allIssues.push(
      ...extractSection(content, '問題與風險'),
      ...extractSection(content, '问题与风险'),
      ...extractSection(content, 'Issues'),
    );
    allIdeas.push(
      ...extractSection(content, '想法'),
      ...extractSection(content, 'Ideas'),
    );
    allPlans.push(
      ...extractSection(content, '明日計劃'),
      ...extractSection(content, '明日计划'),
      ...extractSection(content, 'Tomorrow'),
    );
  }

  const unique = arr => [...new Set(arr)];

  // Find notes updated this week
  const allNotes = vault.scanNotes();
  const updatedThisWeek = allNotes.filter(n =>
    n.updated >= dates[0] && n.updated <= dates[6] && n.type !== 'journal'
  );

  // Active projects
  const activeProjects = allNotes.filter(n => n.type === 'project' && n.status === 'active');

  const vars = {
    WEEK: week,
    WEEK_NUM: String(weekNum),
    YEAR: String(year),
    WEEK_START: dates[0],
    WEEK_END: dates[6],
    DATE: todayStr(),
  };

  let content;
  try {
    content = tpl.render('weekly-review', vars);
  } catch {
    content = null;
  }

  // Build section content
  const completedStr = unique(allCompleted).join('\n') || '- None recorded';
  const issuesStr = unique(allIssues).join('\n') || '- None';
  const ideasStr = unique(allIdeas).join('\n') || '- None';
  const plansStr = unique(allPlans).join('\n') || '- [ ] TBD';
  const updatedNotesStr = updatedThisWeek.length
    ? updatedThisWeek.map(n => `| [[${n.file}]] | ${n.type} | ${n.summary || '-'} |`).join('\n')
    : '| - | - | - |';
  const activeProjectsStr = activeProjects.length
    ? activeProjects.map(p => `- [[${p.file}]] — ${p.summary || p.title}`).join('\n')
    : '- None';

  if (!content) {
    content = `---
title: "Weekly Review ${week}"
type: journal
tags: [weekly-review]
created: ${todayStr()}
updated: ${todayStr()}
status: active
summary: "${year} Week ${weekNum} Review"
---

# Weekly Review ${week}

> ${dates[0]} ~ ${dates[6]}

## Completed

${completedStr}

## Issues

${issuesStr}

## Ideas

${ideasStr}

## Updated Notes

| File | Type | Summary |
|------|------|---------|
${updatedNotesStr}

## Active Projects

${activeProjectsStr}

## Next Week

${plansStr}

## Reflection

-
`;
  } else {
    // Inject aggregated data into template sections
    content = injectSection(content, 'Completed', completedStr);
    content = injectSection(content, 'Issues', issuesStr);
    content = injectSection(content, 'Ideas', ideasStr);
    content = injectSection(content, 'Next Week', plansStr);
    // Inject table data after "Updated Notes" table header
    content = content.replace(
      /(## Updated Notes\n\n\| File \| Type \| Summary \|\n\|------\|------\|---------\|)\n?/,
      `$1\n${updatedNotesStr}\n`
    );
    // Inject active projects
    content = injectSection(content, 'Active Projects', activeProjectsStr);
  }

  const reviewFile = `${week}-review`;
  vault.write('journal', `${reviewFile}.md`, content);
  idx.updateDirIndex('journal', reviewFile, `${year} Week ${weekNum} Review`);
  idx.rebuildTags();

  console.log(`Created journal/${reviewFile}.md (${unique(allCompleted).length} items, ${updatedThisWeek.length} notes updated)`);
  return { status: 'created', file: `journal/${reviewFile}.md` };
}

// ── Monthly Review ──────────────────────────────────

export function monthlyReview(vaultRoot, { year, month } = {}) {
  const vault = new Vault(vaultRoot);
  const tpl = new TemplateEngine(vaultRoot);
  const idx = new IndexManager(vault);

  const today = todayStr();
  const y = year || parseInt(today.slice(0, 4));
  const m = month || parseInt(today.slice(5, 7));
  const { start, end } = getMonthRange(y, m);
  const monthStr = String(m).padStart(2, '0');

  // Collect all weekly reviews in this month
  const allNotes = vault.scanNotes();
  const weeklyReviews = allNotes.filter(n =>
    n.file.endsWith('-review') && n.tags.includes('weekly-review') &&
    n.updated >= start && n.updated <= end
  );

  // Aggregate from weekly reviews
  const allCompleted = [];
  const allIssues = [];
  const allIdeas = [];
  for (const wr of weeklyReviews) {
    const content = vault.read('journal', `${wr.file}.md`);
    if (!content) continue;
    allCompleted.push(...extractSection(content, 'Completed'));
    allIssues.push(...extractSection(content, 'Issues'));
    allIdeas.push(...extractSection(content, 'Ideas'));
  }

  // Also scan daily journals in this month
  const journalDir = vault.path('journal');
  if (existsSync(journalDir)) {
    for (const file of readdirSync(journalDir)) {
      const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
      if (!dateMatch) continue;
      const d = dateMatch[1];
      if (d < start || d > end) continue;
      const content = vault.read('journal', file);
      if (!content) continue;
      allCompleted.push(
        ...extractSection(content, 'Records'),
        ...extractSection(content, '今日記錄'),
        ...extractSection(content, '今日记录'),
      );
      allIssues.push(
        ...extractSection(content, 'Issues'),
        ...extractSection(content, '問題與風險'),
      );
      allIdeas.push(
        ...extractSection(content, 'Ideas'),
        ...extractSection(content, '想法'),
      );
    }
  }

  const unique = arr => [...new Set(arr)];

  // Notes updated this month
  const updatedThisMonth = allNotes.filter(n =>
    n.updated >= start && n.updated <= end && n.type !== 'journal'
  );
  const activeProjects = allNotes.filter(n => n.type === 'project' && n.status === 'active');

  const vars = {
    YEAR: String(y),
    MONTH: monthStr,
    MONTH_START: start,
    MONTH_END: end,
    DATE: today,
  };

  let content;
  try {
    content = tpl.render('monthly-review', vars);
  } catch {
    content = null;
  }

  const completedStr = unique(allCompleted).join('\n') || '- None recorded';
  const issuesStr = unique(allIssues).join('\n') || '- None';
  const ideasStr = unique(allIdeas).join('\n') || '- None';
  const activeProjectsTable = activeProjects.length
    ? activeProjects.map(p => `| [[${p.file}]] | ${p.status} | - |`).join('\n')
    : '| - | - | - |';

  if (!content) {
    content = `---
title: "Monthly Review ${y}-${monthStr}"
type: journal
tags: [monthly-review]
created: ${today}
updated: ${today}
status: active
summary: "${y} ${monthStr} Review"
---

# Monthly Review ${y}-${monthStr}

> ${start} ~ ${end}

## Completed

${completedStr}

## Issues

${issuesStr}

## Ideas

${ideasStr}

## Active Projects

| Project | Status | Next Month Focus |
|---------|--------|-----------------|
${activeProjectsTable}

## Reflection

-
`;
  } else {
    content = injectSection(content, 'Completed', completedStr);
    content = injectSection(content, 'Issues', issuesStr);
    content = injectSection(content, 'Ideas', ideasStr);
    content = content.replace(
      /(## Active Projects\n\n\| Project \| Status \| Next Month Focus \|\n\|---------\|--------\|-----------------\|)\n?/,
      `$1\n${activeProjectsTable}\n`
    );
  }

  const reviewFile = `${y}-${monthStr}-review`;
  vault.write('journal', `${reviewFile}.md`, content);
  idx.updateDirIndex('journal', reviewFile, `${y} ${monthStr} Review`);
  idx.rebuildTags();

  console.log(`Created journal/${reviewFile}.md (${unique(allCompleted).length} items, ${updatedThisMonth.length} notes updated)`);
  return { status: 'created', file: `journal/${reviewFile}.md` };
}

