/**
 * research — automated technical research using GitHub CLI
 *
 * Combines: gh CLI (search repos, issues), vault search, findRelated,
 *           note creation, auto-linking, indexManager
 * Generates structured research notes from GitHub ecosystem data.
 */
import { execSync } from 'child_process';
import { Vault } from '../vault.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr } from '../dates.mjs';

function gh(cmd, { timeout = 30000 } = {}) {
  try {
    return execSync(`gh ${cmd}`, { encoding: 'utf8', timeout, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    const msg = (err.stderr || err.message || '').toString();
    if (msg.includes('auth login')) {
      throw new Error('GitHub CLI not authenticated. Run: gh auth login');
    }
    if (msg.includes('ENOENT') || msg.includes('not found') || msg.includes('not recognized')) {
      throw new Error('GitHub CLI (gh) not found. Install: https://cli.github.com');
    }
    return '';
  }
}

function ghJson(cmd, opts) {
  const raw = gh(cmd, opts);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function formatStars(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function daysSince(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.round((now - d) / 86400000);
}

export function research(vaultRoot, topic, { lang, days = 90, limit = 10 } = {}) {
  if (!topic) {
    throw new Error('Usage: obsidian-agent research <topic>');
  }

  // Verify gh is available
  try { execSync('gh --version', { encoding: 'utf8', timeout: 5000 }); }
  catch { throw new Error('GitHub CLI (gh) not found. Install: https://cli.github.com'); }

  const vault = new Vault(vaultRoot);
  const idx = new IndexManager(vault);
  const today = todayStr();

  const langFilter = lang ? ` --language "${lang}"` : '';
  const topicSlug = topic.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');

  console.log(`\nResearching: "${topic}"...\n`);

  // ── 1. Top repos by stars (established players) ──
  console.log('  Searching top repositories...');
  const topRepos = ghJson(
    `search repos "${topic}" --sort stars --limit ${limit}${langFilter} --json fullName,description,stargazersCount,forksCount,updatedAt,language,url`,
    { timeout: 30000 }
  );

  // ── 2. Recently active repos ──
  console.log('  Searching recently active repos...');
  const activeRepos = ghJson(
    `search repos "${topic}" --sort updated --limit 5${langFilter} --json fullName,description,stargazersCount,updatedAt,language,url`,
    { timeout: 30000 }
  );

  // ── 3. Emerging repos (created within --days) ──
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const since = cutoff.toISOString().slice(0, 10);
  console.log(`  Searching emerging repos (since ${since})...`);
  const emergingRepos = ghJson(
    `search repos "${topic}" --sort stars --limit 5${langFilter} --created ">=${since}" --json fullName,description,stargazersCount,createdAt,language,url`,
    { timeout: 30000 }
  );

  // ── 4. Recent issues (pain points & trends) ──
  console.log('  Searching issues & discussions...');
  const issues = ghJson(
    `search issues "${topic}" --sort created --limit 10 --json title,repository,createdAt,url,state`,
    { timeout: 30000 }
  );

  // ── 5. Cross-reference with vault ──
  console.log('  Cross-referencing vault...');
  const topicWords = topicSlug.split('-').filter(w => w.length > 2);
  const vaultResults = vault.search(topic);
  const relatedNotes = vault.findRelated(topic, topicWords);

  // Find previous research notes on this topic
  const allNotes = vault.scanNotes();
  const prevResearch = allNotes.filter(n =>
    n.file.startsWith(`research-${topicSlug}`) && n.type === 'resource'
  );

  // ── Build language landscape ──
  const langCounts = {};
  for (const r of topRepos) {
    if (r.language) langCounts[r.language] = (langCounts[r.language] || 0) + 1;
  }
  const topLangs = Object.entries(langCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ── Build tables ──
  const repoTable = topRepos.map(r =>
    `| [${r.fullName}](${r.url}) | ${formatStars(r.stargazersCount)} | ${r.language || '-'} | ${r.updatedAt?.slice(0, 10) || '-'} | ${(r.description || '').slice(0, 60)} |`
  ).join('\n');

  const activeTable = activeRepos
    .filter(r => !topRepos.some(t => t.fullName === r.fullName))
    .slice(0, 5)
    .map(r =>
      `| [${r.fullName}](${r.url}) | ${formatStars(r.stargazersCount)} | ${r.language || '-'} | ${r.updatedAt?.slice(0, 10) || '-'} | ${(r.description || '').slice(0, 60)} |`
    ).join('\n');

  const emergingTable = emergingRepos
    .filter(r => r.stargazersCount > 0)
    .map(r =>
      `| [${r.fullName}](${r.url}) | ${formatStars(r.stargazersCount)} | ${r.language || '-'} | ${r.createdAt?.slice(0, 10) || '-'} | ${(r.description || '').slice(0, 60)} |`
    ).join('\n');

  const issuesList = issues.map(i => {
    const repo = i.repository?.nameWithOwner || i.repository?.name || '';
    return `- [${i.title}](${i.url}) — ${repo} (${i.state}, ${i.createdAt?.slice(0, 10) || ''})`;
  }).join('\n');

  const langSection = topLangs.map(([l, c]) => `${l} (${c})`).join(', ');

  // ── Vault cross-reference section ──
  const vaultSection = vaultResults.length
    ? vaultResults.slice(0, 5).map(n =>
        `- [[${n.file}]] (${n.type}) — ${n.summary || n.title}`
      ).join('\n')
    : '- (no existing notes on this topic)';

  const relatedSection = relatedNotes
    .filter(n => !vaultResults.some(v => v.file === n.file))
    .slice(0, 5)
    .map(n => `- [[${n.file}]] (${n.type}) — ${n.summary || n.title}`)
    .join('\n');

  const prevSection = prevResearch.length
    ? prevResearch.map(n => `- [[${n.file}]] (${n.updated})`).join('\n')
    : '';

  // ── Tags ──
  const autoTags = ['research', ...topicWords.slice(0, 3)];
  if (lang) autoTags.push(lang.toLowerCase());

  // ── Related links ──
  const relatedLinks = [
    ...vaultResults.slice(0, 3).map(n => `"[[${n.file}]]"`),
    ...prevResearch.map(n => `"[[${n.file}]]"`),
  ];

  // ── Compose note ──
  const content = `---
title: "Research: ${topic}"
type: resource
tags: [${autoTags.join(', ')}]
created: "${today}"
updated: "${today}"
status: active
summary: "Tech research — ${topRepos.length} repos, ${issues.length} issues, ${emergingRepos.length} emerging"
related: [${relatedLinks.join(', ')}]
---

# Research: ${topic}

> Generated: ${today} | Repos: ${topRepos.length} | Issues: ${issues.length} | Emerging: ${emergingRepos.length}

## Ecosystem Overview

- **Languages:** ${langSection || 'N/A'}
- **Total stars (top ${topRepos.length}):** ${topRepos.reduce((s, r) => s + r.stargazersCount, 0).toLocaleString()}

## Top Repositories

| Repository | Stars | Language | Updated | Description |
|------------|-------|----------|---------|-------------|
${repoTable || '| - | - | - | - | - |'}

${activeTable ? `## Recently Active (not in top list)

| Repository | Stars | Language | Updated | Description |
|------------|-------|----------|---------|-------------|
${activeTable}
` : ''}
${emergingTable ? `## Emerging (created since ${since})

| Repository | Stars | Language | Created | Description |
|------------|-------|----------|---------|-------------|
${emergingTable}
` : ''}
## Recent Issues & Discussions

${issuesList || '- No recent issues found'}

## Vault Cross-Reference

### Existing Notes

${vaultSection}

${relatedSection ? `### Related Notes\n\n${relatedSection}\n` : ''}
${prevSection ? `### Previous Research\n\n${prevSection}\n` : ''}
## Analysis

> TODO: Add your analysis — key takeaways, gaps, opportunities, next steps.

- **Key players:**
- **Trends:**
- **Gaps/Opportunities:**
- **Action items:**
`;

  const filename = `research-${topicSlug}-${today}`;
  vault.write('resources', `${filename}.md`, content);
  idx.updateDirIndex('resources', filename, `Research: ${topic}`);

  // Update related notes with backlink
  for (const vn of vaultResults.slice(0, 3)) {
    const vnNote = vault.findNote(vn.file);
    if (vnNote) {
      vault.updateNote(vnNote.dir, vnNote.file, { updated: today });
    }
  }

  idx.sync();

  // Console output
  console.log(`\nResearch: ${topic}`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`  Top repos:     ${topRepos.length}`);
  console.log(`  Emerging:      ${emergingRepos.length}`);
  console.log(`  Issues found:  ${issues.length}`);
  console.log(`  Languages:     ${langSection || 'N/A'}`);
  console.log(`  Vault matches: ${vaultResults.length}`);
  if (topRepos.length) {
    console.log(`\n  #1 ${topRepos[0].fullName} (${formatStars(topRepos[0].stargazersCount)} ★)`);
    if (topRepos[1]) console.log(`  #2 ${topRepos[1].fullName} (${formatStars(topRepos[1].stargazersCount)} ★)`);
    if (topRepos[2]) console.log(`  #3 ${topRepos[2].fullName} (${formatStars(topRepos[2].stargazersCount)} ★)`);
  }
  console.log(`\n  → resources/${filename}.md`);

  return {
    status: 'created',
    file: `resources/${filename}.md`,
    topic,
    repos: topRepos.length,
    emerging: emergingRepos.length,
    issues: issues.length,
    vaultMatches: vaultResults.length,
    topRepos: topRepos.slice(0, 5).map(r => ({
      name: r.fullName,
      stars: r.stargazersCount,
      language: r.language,
      url: r.url,
    })),
  };
}
