/**
 * stale — find stale notes and generate a prioritized triage plan
 *
 * Combines: scanNotes, backlinks, orphans, dates, templates, indexManager
 */
import { Vault } from '../vault.mjs';
import { TemplateEngine } from '../templates.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr } from '../dates.mjs';

function daysBetween(dateA, dateB) {
  const a = new Date(dateA + 'T12:00:00Z');
  const b = new Date(dateB + 'T12:00:00Z');
  return Math.round((b - a) / 86400000);
}

export function stale(vaultRoot, { threshold = 30 } = {}) {
  const vault = new Vault(vaultRoot);
  const tpl = new TemplateEngine(vaultRoot);
  const idx = new IndexManager(vault);
  const today = todayStr();

  const notes = vault.scanNotes({ includeBody: true });
  const orphanSet = new Set(vault.orphans().map(n => n.file));

  // Find stale notes (non-archived, updated before threshold)
  const candidates = [];
  for (const n of notes) {
    if (n.status === 'archived' || n.type === 'journal') continue;
    if (!n.updated) continue;
    const age = daysBetween(n.updated, today);
    if (age < threshold) continue;

    const bl = vault.backlinks(n.file);
    const backlinkCount = bl.length;
    const isOrphan = orphanSet.has(n.file);
    // Urgency: days stale weighted by how many notes depend on it
    const urgency = age * (1 + backlinkCount * 0.5);

    let recommendation;
    if (isOrphan && age >= 60) {
      recommendation = 'Orphan + stale. Consider archiving.';
    } else if (backlinkCount >= 3) {
      recommendation = `High-traffic note (${backlinkCount} backlinks), content likely outdated. Update or verify.`;
    } else if (age >= 60) {
      recommendation = 'Review and update, or archive if no longer relevant.';
    } else {
      recommendation = 'Check next cycle.';
    }

    candidates.push({
      ...n,
      body: undefined,
      age,
      backlinkCount,
      isOrphan,
      urgency,
      recommendation,
    });
  }

  if (!candidates.length) {
    console.log(`No stale notes found (threshold: ${threshold} days).`);
    return { status: 'clean', threshold, staleCount: 0, tiers: {} };
  }

  // Sort by urgency descending
  candidates.sort((a, b) => b.urgency - a.urgency);

  // Bucket into tiers
  const urgent = candidates.filter(c => c.age >= 60 && c.backlinkCount >= 2);
  const moderate = candidates.filter(c => c.age >= 60 && c.backlinkCount < 2);
  const low = candidates.filter(c => c.age < 60);

  // Build the triage note
  const formatNote = (c) =>
    `### [[${c.file}]] (${c.type})\n` +
    `- **Last updated:** ${c.updated} (${c.age} days ago)\n` +
    `- **Backlinks:** ${c.backlinkCount}\n` +
    `- **Tags:** ${c.tags.join(', ') || 'none'}\n` +
    `- **Recommendation:** ${c.recommendation}\n`;

  const urgentSection = urgent.length
    ? urgent.map(formatNote).join('\n')
    : '- None\n';
  const moderateSection = moderate.length
    ? moderate.map(formatNote).join('\n')
    : '- None\n';
  const lowSection = low.length
    ? low.map(c => `- [[${c.file}]] (${c.age} days, ${c.backlinkCount} backlinks)`).join('\n')
    : '- None\n';

  const quickActions = candidates
    .filter(c => c.age >= 60)
    .map(c => c.isOrphan
      ? `- [ ] Archive [[${c.file}]]`
      : `- [ ] Update [[${c.file}]]`)
    .join('\n') || '- [ ] All clear';

  const content = `---
title: "Stale Notes Triage ${today}"
type: journal
tags: [maintenance, stale-triage]
created: "${today}"
updated: "${today}"
status: active
summary: "${candidates.length} stale notes: ${urgent.length} urgent, ${moderate.length} moderate, ${low.length} low"
---

# Stale Notes Triage ${today}

> Threshold: ${threshold} days

## Summary

| Tier | Count | Action |
|------|-------|--------|
| Urgent (60+ days, high connectivity) | ${urgent.length} | Update content |
| Moderate (60+ days, low connectivity) | ${moderate.length} | Review or archive |
| Low (${threshold}-60 days) | ${low.length} | Check next cycle |

## Urgent — Update These First

${urgentSection}
## Moderate — Review or Archive

${moderateSection}
## Low — ${threshold}-60 Day Notes

${lowSection}

## Quick Actions

${quickActions}
`;

  const filename = `stale-triage-${today}`;
  vault.write('journal', `${filename}.md`, content);
  idx.updateDirIndex('journal', filename, `${candidates.length} stale notes triaged`);
  idx.rebuildTags();

  console.log(`Created journal/${filename}.md (${candidates.length} stale: ${urgent.length} urgent, ${moderate.length} moderate, ${low.length} low)`);

  return {
    status: 'created',
    file: `journal/${filename}.md`,
    threshold,
    staleCount: candidates.length,
    tiers: {
      urgent: urgent.length,
      moderate: moderate.length,
      low: low.length,
    },
    notes: candidates.map(({ body, ...rest }) => rest),
  };
}
