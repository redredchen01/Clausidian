/**
 * health — vault health scoring across 4 dimensions
 */
import { Vault } from '../vault.mjs';

export function health(vaultRoot) {
  const vault = new Vault(vaultRoot);
  const notes = vault.scanNotes({ includeBody: true });

  if (!notes.length) {
    console.log('Empty vault — no notes to score.');
    return { total: 0, scores: {}, grade: 'N/A' };
  }

  // ── 1. Completeness (frontmatter quality) ──────────
  let completenessTotal = 0;
  const completenessIssues = [];
  for (const n of notes) {
    let score = 0;
    if (n.title) score += 1;
    if (n.type) score += 1;
    if (n.tags.length > 0) score += 1;
    if (n.summary) score += 1;
    if (n.created) score += 1;
    // 5 possible points
    completenessTotal += score / 5;
    if (score < 3) completenessIssues.push(`${n.file}: missing ${5 - score} field(s)`);
  }
  const completeness = Math.round((completenessTotal / notes.length) * 100);

  // ── 2. Connectivity (links & relationships) ────────
  const linked = new Set();
  let totalLinks = 0;
  for (const n of notes) {
    totalLinks += n.related.length;
    for (const rel of n.related) linked.add(rel);
    const wikilinks = (n.body || '').match(/\[\[([^\]]+)\]\]/g) || [];
    totalLinks += wikilinks.length;
    for (const wl of wikilinks) linked.add(wl.slice(2, -2));
  }
  const nonJournal = notes.filter(n => n.type !== 'journal');
  const connectedCount = nonJournal.filter(n => linked.has(n.file) || n.related.length > 0).length;
  const connectivity = nonJournal.length > 0
    ? Math.round((connectedCount / nonJournal.length) * 100)
    : 100;

  // ── 3. Freshness (recently updated) ────────────────
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
  const sixtyDaysAgo = new Date(now - 60 * 86400000).toISOString().slice(0, 10);
  const fresh = notes.filter(n => n.updated >= thirtyDaysAgo).length;
  const stale = notes.filter(n => n.updated && n.updated < sixtyDaysAgo).length;
  const freshness = Math.round((fresh / notes.length) * 100);
  const staleNotes = notes.filter(n => n.updated && n.updated < sixtyDaysAgo && n.type !== 'journal')
    .map(n => n.file);

  // ── 4. Organization (tags, types, naming) ──────────
  let orgScore = 0;
  const taggedCount = notes.filter(n => n.tags.length > 0).length;
  orgScore += (taggedCount / notes.length) * 40; // 40% weight: has tags
  const hasAllTypes = ['area', 'project', 'resource'].every(t => notes.some(n => n.type === t));
  orgScore += hasAllTypes ? 20 : 0; // 20% weight: uses multiple types
  const validNames = notes.filter(n => /^[a-z0-9\u4e00-\u9fff]/.test(n.file)).length;
  orgScore += (validNames / notes.length) * 20; // 20% weight: lowercase names
  const hasSummaries = notes.filter(n => n.summary).length;
  orgScore += (hasSummaries / notes.length) * 20; // 20% weight: has summaries
  const organization = Math.round(orgScore);

  // ── Overall ────────────────────────────────────────
  const overall = Math.round((completeness + connectivity + freshness + organization) / 4);
  const grade = overall >= 90 ? 'A' : overall >= 75 ? 'B' : overall >= 60 ? 'C' : overall >= 40 ? 'D' : 'F';

  // ── Output ─────────────────────────────────────────
  const bar = (pct) => {
    const filled = Math.round(pct / 5);
    return '█'.repeat(filled) + '░'.repeat(20 - filled) + ` ${pct}%`;
  };

  console.log(`\nVault Health Report\n`);
  console.log(`Overall:        ${bar(overall)}  Grade: ${grade}`);
  console.log(`Completeness:   ${bar(completeness)}`);
  console.log(`Connectivity:   ${bar(connectivity)}`);
  console.log(`Freshness:      ${bar(freshness)}`);
  console.log(`Organization:   ${bar(organization)}`);

  console.log(`\nStats: ${notes.length} notes, ${totalLinks} links, ${vault.orphans().length} orphans`);

  if (staleNotes.length) {
    console.log(`\nStale notes (60+ days): ${staleNotes.slice(0, 10).join(', ')}${staleNotes.length > 10 ? ` (+${staleNotes.length - 10} more)` : ''}`);
  }
  if (completenessIssues.length) {
    console.log(`\nIncomplete: ${completenessIssues.slice(0, 5).join(', ')}${completenessIssues.length > 5 ? ` (+${completenessIssues.length - 5} more)` : ''}`);
  }

  return {
    overall, grade,
    scores: { completeness, connectivity, freshness, organization },
    total: notes.length,
    orphans: vault.orphans().length,
    staleCount: stale,
    incompleteCount: completenessIssues.length,
  };
}
