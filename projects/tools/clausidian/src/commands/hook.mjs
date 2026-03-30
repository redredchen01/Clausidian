/**
 * hook — event handlers for agent hooks (session-stop, daily-backfill, weekly-review)
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname } from 'path';
import { Vault } from '../vault.mjs';
import { TemplateEngine } from '../templates.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr, weekdayShort, prevDate, nextDate } from '../dates.mjs';
import { notify } from '../notify.mjs';
import { buildTagIDF, scoreRelatedness } from '../scoring.mjs';

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 30000 }).trim(); }
  catch { return ''; }
}

// ── Collect git commits for a date across all repos in a directory ──

function getGitCommits(scanRoot, date) {
  const since = `${date}T00:00:00`;
  const until = `${nextDate(date)}T00:00:00`;
  const gitDirs = run(`find "${scanRoot}" -maxdepth 5 -name ".git" -type d 2>/dev/null`);
  if (!gitDirs) return [];

  const commits = [];
  for (const gitDir of gitDirs.split('\n').filter(Boolean)) {
    const repo = dirname(gitDir);
    const repoName = repo.split('/').pop();
    const log = run(`git -C "${repo}" log --oneline --since="${since}" --until="${until}" --all 2>/dev/null`);
    if (log) {
      for (const line of log.split('\n').filter(Boolean)) {
        commits.push({ repo: repoName, message: line.replace(/^[a-f0-9]+ /, '') });
      }
    }
  }
  return commits;
}

// ── A4: Extract conclusions and resolved items, update frontmatter tags ──

function tagConclusions(content) {
  const ideasMatch = content.match(/## (?:想法|Ideas)\n([\s\S]*?)(?=\n## |\n---|$)/);
  const issuesMatch = content.match(/## (?:問題與風險|问题与风险|Issues)\n([\s\S]*?)(?=\n## |\n---|$)/);

  // Check if "想法" has conclusive statements (not questions, not "待驗證")
  const hasConclusion = ideasMatch && ideasMatch[1].split('\n')
    .filter(l => l.trim().startsWith('- ') && l.trim() !== '-')
    .some(l => {
      const text = l.replace(/^-\s*/, '').trim();
      return text.length > 5
        && !text.includes('？') && !text.includes('?')
        && !text.includes('待驗證') && !text.includes('待验证')
        && !text.includes('待確認') && !text.includes('待确认')
        && !text.includes('TBD');
    });

  // Check if "問題與風險" has resolved items
  const hasResolved = issuesMatch && /✅|已解決|已解决|已修復|已修复|resolved|fixed/i.test(issuesMatch[1]);

  const tagsMatch = content.match(/tags:\s*\[([^\]]*)\]/);
  if (tagsMatch) {
    const tags = tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean);
    if (hasConclusion && !tags.includes('conclusion')) tags.push('conclusion');
    if (hasResolved && !tags.includes('resolved')) tags.push('resolved');
    content = content.replace(/tags:\s*\[[^\]]*\]/, `tags: [${tags.join(', ')}]`);
  }
  return content;
}

// ── session-stop: append session summary to today's journal ──

export function sessionStop(vaultRoot, options = {}) {
  const vault = new Vault(vaultRoot);
  const tpl = new TemplateEngine(vaultRoot);
  const idx = new IndexManager(vault);
  const date = todayStr();

  // Extract payload (merged from stdin at registry level)
  const { stop_reason, scanRoot } = options;
  const reason = stop_reason;
  if (!reason || reason === 'unknown') {
    console.log(JSON.stringify({ status: 'skipped', date, reason: 'no valid stop_reason' }));
    return;
  }

  const sessionNote = reason === 'user' ? 'User ended session' : `Session ended (${reason})`;
  const existing = vault.read('journal', `${date}.md`);

  if (existing) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const appendLine = `\n- [${timestamp}] ${sessionNote}`;
    let updated = existing.replace(/## (今日[記记]錄|Records)\n/, `## $1\n${appendLine}\n`);
    // A4: Tag conclusions and resolved issues
    updated = tagConclusions(updated);
    vault.write('journal', `${date}.md`, updated);
    notify('Obsidian Agent', `Session logged to ${date}`);
    console.log(JSON.stringify({ status: 'appended', date }));
  } else {
    const root = scanRoot || dirname(vaultRoot) || '.';
    const commits = getGitCommits(root, date);
    const summary = commits.length > 0
      ? `${commits.length} commits across ${new Set(commits.map(c => c.repo)).size} repos`
      : 'Auto-recorded session';

    const content = tpl.render('journal', {
      DATE: date,
      WEEKDAY: weekdayShort(date),
      PREV_DATE: prevDate(date),
      NEXT_DATE: nextDate(date),
    });

    vault.write('journal', `${date}.md`, content);
    idx.updateDirIndex('journal', date, summary);
    notify('Obsidian Agent', `Journal created for ${date}`);
    console.log(JSON.stringify({ status: 'created', date }));
  }
}

// ── daily-backfill: create journal from git history ──

export function dailyBackfill(vaultRoot, { date, scanRoot, force } = {}) {
  const vault = new Vault(vaultRoot);
  const tpl = new TemplateEngine(vaultRoot);
  const idx = new IndexManager(vault);
  const d = date || todayStr();

  if (vault.exists('journal', `${d}.md`) && !force) {
    console.log(JSON.stringify({ status: 'skip', date: d, reason: 'already exists' }));
    return;
  }

  const root = scanRoot || dirname(vaultRoot);
  const commits = getGitCommits(root, d);

  // Group commits by repo
  const byRepo = {};
  for (const c of commits) {
    if (!byRepo[c.repo]) byRepo[c.repo] = [];
    byRepo[c.repo].push(c.message);
  }

  let records = '';
  for (const [repo, msgs] of Object.entries(byRepo)) {
    const unique = [...new Set(msgs)];
    if (unique.length <= 3) {
      records += unique.map(m => `- ${repo}: ${m}`).join('\n') + '\n';
    } else {
      records += `- ${repo}: ${unique.length} commits (${unique[0]}...)\n`;
    }
  }
  if (!records.trim()) records = '- (No git activity)\n';

  const content = tpl.render('journal', {
    DATE: d,
    WEEKDAY: weekdayShort(d),
    PREV_DATE: prevDate(d),
    NEXT_DATE: nextDate(d),
  }).replace(/-\n\n## 想法/, `${records.trim()}\n\n## 想法`)
    .replace(/-\n\n## Ideas/, `${records.trim()}\n\n## Ideas`);

  vault.write('journal', `${d}.md`, content);
  const summary = commits.length > 0
    ? `${commits.length} commits across ${new Set(commits.map(c => c.repo)).size} repos`
    : 'No git activity';
  idx.updateDirIndex('journal', d, summary);
  idx.sync();

  notify('Obsidian Agent', `Backfill: journal/${d}.md (${commits.length} commits)`);
  console.log(JSON.stringify({ status: 'created', date: d, commits: commits.length }));
}

// ── Event-driven pipeline: note-created, note-updated, note-deleted, index-rebuilt ──

export function noteCreated(vaultRoot, payload = {}) {
  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);
  const noteName = payload.note || 'unknown';

  try {
    // Scan all notes to find related ones
    const allNotes = vault.scanNotes({ includeBody: true });
    const newNote = allNotes.find(n => n.file === noteName);
    if (!newNote || newNote.tags.length === 0) {
      console.log(JSON.stringify({ status: 'skipped', event: 'note-created', note: noteName, reason: 'no tags' }));
      return;
    }

    // Build tag IDF
    const nonJournal = allNotes.filter(n => n.dir !== 'journal' && n.tags.length > 0);
    const tagDF = {};
    for (const n of nonJournal) {
      for (const t of n.tags) tagDF[t] = (tagDF[t] || 0) + 1;
    }
    const tagIDF = {};
    for (const [tag, df] of Object.entries(tagDF)) {
      tagIDF[tag] = Math.log(nonJournal.length / df);
    }

    // Find top related notes
    const candidates = allNotes.filter(n => n.file !== noteName && n.dir !== 'journal' && !newNote.related.includes(n.file));
    const scored = candidates.map(c => ({
      file: c.file, summary: c.summary, ...scoreRelatedness(newNote, c, tagIDF)
    })).filter(s => s.score >= 1.5 && s.shared.length >= 1)
      .sort((a, b) => b.score - a.score);

    const suggestions = scored.slice(0, 5);
    if (suggestions.length > 0) {
      const result = {
        status: 'created',
        event: 'note-created',
        note: noteName,
        suggestions: suggestions.map(s => ({ note: s.file, score: Math.round(s.score * 10) / 10, tags: s.shared }))
      };
      console.log(JSON.stringify(result));

      // Notify if important (has suggestions)
      const suggestionText = suggestions.map(s => `• [[${s.file}]] (${s.shared.join(', ')})`).join('\n');
      notify('📝 新筆記建立', `<b>${noteName}</b>\n\n建議關聯:\n${suggestionText}`);
    } else {
      console.log(JSON.stringify({ status: 'created', event: 'note-created', note: noteName, suggestions: [] }));
    }
  } catch (err) {
    console.error(`[note-created error] ${err.message}`);
  }
}

export function noteUpdated(vaultRoot, payload = {}) {
  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);
  const noteName = payload.note || 'unknown';
  const changes = payload.changes || {};

  try {
    // Only re-index if tags or body changed
    if (changes.tags || changes.body) {
      const result = idx.rebuildGraph();
      console.log(JSON.stringify({
        status: 'updated',
        event: 'note-updated',
        note: noteName,
        graphRebuilt: true,
        suggestedLinks: result.suggestedLinks
      }));
    } else {
      console.log(JSON.stringify({ status: 'updated', event: 'note-updated', note: noteName }));
    }
  } catch (err) {
    console.error(`[note-updated error] ${err.message}`);
  }
}

export function noteDeleted(vaultRoot, payload = {}) {
  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);
  const noteName = payload.note || 'unknown';

  try {
    // Rebuild graph to remove deleted note references
    idx.rebuildGraph();
    console.log(JSON.stringify({ status: 'deleted', event: 'note-deleted', note: noteName, graphRebuilt: true }));
  } catch (err) {
    console.error(`[note-deleted error] ${err.message}`);
  }
}

export function indexRebuilt(vaultRoot, payload = {}) {
  try {
    // Optional: notify Telegram or other services
    // For now, just log the event
    console.log(JSON.stringify({ status: 'rebuilt', event: 'index-rebuilt', timestamp: payload.timestamp || new Date().toISOString() }));
  } catch (err) {
    console.error(`[index-rebuilt error] ${err.message}`);
  }
}
