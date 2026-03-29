/**
 * suggest — intelligent daily action suggestions
 *
 * Combines: digest (project momentum), stale (urgency), journal (yesterday's Tomorrow),
 *           recent activity, health scoring, orphans
 * Generates a prioritized "what to do today" list.
 */
import { readdirSync } from 'fs';
import { Vault } from '../vault.mjs';
import { todayStr, prevDate } from '../dates.mjs';

function daysBetween(dateA, dateB) {
  const a = new Date(dateA + 'T12:00:00Z');
  const b = new Date(dateB + 'T12:00:00Z');
  return Math.round((b - a) / 86400000);
}

/**
 * Extract carry-over items from a journal's "Tomorrow" section
 */
function extractTomorrowItems(content) {
  if (!content) return [];
  const lines = content.split('\n');
  let inTomorrow = false;
  const items = [];
  for (const line of lines) {
    if (/^#+\s+Tomorrow/i.test(line)) {
      inTomorrow = true;
      continue;
    }
    if (inTomorrow && /^#+\s/.test(line)) break;
    if (inTomorrow && line.trim().startsWith('- ')) {
      const text = line.trim().replace(/^- \[[ x]\]\s*/, '').trim();
      if (text) items.push(text);
    }
  }
  return items;
}

export function suggest(vaultRoot, { date, days = 7 } = {}) {
  const vault = new Vault(vaultRoot);
  const today = date || todayStr();
  const yesterday = prevDate(today);

  // Calculate lookback range
  const startD = new Date(today + 'T12:00:00Z');
  startD.setDate(startD.getDate() - days + 1);
  const startDate = startD.toISOString().slice(0, 10);

  const allNotes = vault.scanNotes({ includeBody: true });
  const suggestions = [];

  // ── 1. Carry-over from yesterday's "Tomorrow" section ──
  const yesterdayContent = vault.read('journal', `${yesterday}.md`);
  const carryOvers = extractTomorrowItems(yesterdayContent);
  for (const item of carryOvers) {
    suggestions.push({
      priority: 1,
      category: 'carry-over',
      icon: '\u{1F4CB}',
      text: item,
      source: `journal/${yesterday}.md`,
      reason: "Yesterday's Tomorrow section",
    });
  }

  // ── 2. Active projects with declining momentum ──
  const projects = allNotes.filter(n => n.type === 'project' && n.status === 'active');
  const journalDir = vault.path('journal');
  let journalFiles;
  try { journalFiles = readdirSync(journalDir); } catch { journalFiles = []; }

  for (const p of projects) {
    let mentions = 0;
    let lastMentionDate = null;
    for (const file of journalFiles) {
      const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
      if (!dateMatch) continue;
      const d = dateMatch[1];
      if (d < startDate || d > today) continue;
      const content = vault.read('journal', file);
      if (!content) continue;
      if (content.includes(`[[${p.file}]]`) ||
          content.toLowerCase().includes(p.title.toLowerCase())) {
        mentions++;
        if (!lastMentionDate || d > lastMentionDate) lastMentionDate = d;
      }
    }

    const bl = vault.backlinks(p.file);
    const recentBl = bl.filter(n => n.updated >= startDate && n.updated <= today);
    const relatedUpdates = p.related
      .map(r => allNotes.find(n => n.file === r))
      .filter(n => n && n.updated >= startDate && n.updated <= today)
      .length;

    const momentum = Math.min(
      Math.round(Math.min(mentions * 2, 6) + Math.min(relatedUpdates * 1.5, 3) + Math.min(recentBl.length, 1)),
      10
    );

    const daysSinceMention = lastMentionDate ? daysBetween(lastMentionDate, today) : days;

    if (momentum <= 3 || daysSinceMention >= 3) {
      const detail = daysSinceMention >= 5
        ? `no mention for ${daysSinceMention} days`
        : `momentum ${momentum}/10`;
      suggestions.push({
        priority: momentum === 0 ? 1 : 2,
        category: 'project-momentum',
        icon: '\u{1F534}',
        text: `Continue: [[${p.file}]] \u2014 ${p.summary || p.title}`,
        source: `${p.dir}/${p.file}.md`,
        reason: `Low momentum (${detail})`,
        momentum,
        daysSinceMention,
      });
    }
  }

  // ── 3. Stale notes needing attention (urgent tier only) ──
  for (const n of allNotes) {
    if (n.status === 'archived' || n.type === 'journal') continue;
    if (!n.updated) continue;
    const age = daysBetween(n.updated, today);
    if (age < 60) continue;

    const bl = vault.backlinks(n.file);
    if (bl.length >= 2) {
      suggestions.push({
        priority: 2,
        category: 'stale-urgent',
        icon: '\u{1F7E1}',
        text: `Triage: [[${n.file}]] \u2014 ${age} days stale, ${bl.length} notes depend on it`,
        source: `${n.dir}/${n.file}.md`,
        reason: `High-traffic stale note (${bl.length} backlinks)`,
      });
    }
  }

  // ── 4. Vault maintenance signals ──
  const { orphanCount, connectivity, completeness, incompleteCount } = quickHealth(allNotes);
  if (orphanCount >= 5) {
    suggestions.push({
      priority: 3,
      category: 'maintenance',
      icon: '\u{1F527}',
      text: `Link orphan notes \u2014 ${orphanCount} notes have no connections`,
      source: 'vault',
      reason: `Connectivity score: ${connectivity}/100`,
    });
  }
  if (completeness < 60) {
    suggestions.push({
      priority: 3,
      category: 'maintenance',
      icon: '\u{1F527}',
      text: `Fill missing frontmatter \u2014 completeness at ${completeness}%`,
      source: 'vault',
      reason: `${incompleteCount} notes with incomplete fields`,
    });
  }

  // Sort by priority (1 = highest)
  suggestions.sort((a, b) => a.priority - b.priority);

  // Console output
  console.log(`\nToday's Focus (${today})\n`);
  if (!suggestions.length) {
    console.log('All clear! No urgent items. Pick up where you left off.');
  } else {
    for (const s of suggestions) {
      console.log(`  ${s.icon} ${s.text}`);
      console.log(`     \u2514\u2500 ${s.reason}`);
    }
  }
  console.log('');

  return {
    status: suggestions.length ? 'suggestions' : 'clear',
    date: today,
    count: suggestions.length,
    suggestions,
  };
}

/**
 * Lightweight health check (avoids importing full health command)
 */
function quickHealth(notes) {
  const linked = new Set();
  for (const n of notes) {
    for (const rel of n.related) linked.add(rel);
    const wikilinks = (n.body || '').match(/\[\[([^\]]+)\]\]/g) || [];
    for (const wl of wikilinks) linked.add(wl.slice(2, -2));
  }
  const nonJournal = notes.filter(n => n.type !== 'journal');
  const connectedCount = nonJournal.filter(n => linked.has(n.file) || n.related.length > 0).length;
  const connectivity = nonJournal.length > 0
    ? Math.round((connectedCount / nonJournal.length) * 100) : 100;
  const orphanCount = nonJournal.filter(n => !linked.has(n.file) && n.related.length === 0).length;

  let completenessTotal = 0;
  let incompleteCount = 0;
  for (const n of notes) {
    let score = 0;
    if (n.title) score++;
    if (n.type) score++;
    if (n.tags.length > 0) score++;
    if (n.summary) score++;
    if (n.created) score++;
    completenessTotal += score / 5;
    if (score < 3) incompleteCount++;
  }
  const completeness = notes.length
    ? Math.round((completenessTotal / notes.length) * 100) : 100;

  return { connectivity, orphanCount, completeness, incompleteCount };
}
