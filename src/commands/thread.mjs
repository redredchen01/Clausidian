/**
 * thread — trace how a topic evolved across the vault over time
 *
 * Combines: search, scanNotes, backlinks, journal scanning, dates, parseFrontmatter
 * Builds a chronological timeline of all events related to a topic.
 */
import { readdirSync } from 'fs';
import { Vault } from '../vault.mjs';
import { todayStr } from '../dates.mjs';

function daysBetween(dateA, dateB) {
  const a = new Date(dateA + 'T12:00:00Z');
  const b = new Date(dateB + 'T12:00:00Z');
  return Math.round((b - a) / 86400000);
}

/**
 * Extract lines mentioning a topic from content
 */
function extractMentionLines(content, topic, topicTitle) {
  if (!content) return [];
  const lower = topic.toLowerCase();
  const titleLower = (topicTitle || topic).toLowerCase();
  return content.split('\n')
    .filter(l => {
      const ll = l.toLowerCase();
      return l.includes(`[[${topic}]]`) ||
             ll.includes(lower) ||
             (topicTitle && ll.includes(titleLower));
    })
    .map(l => l.trim())
    .filter(l => l.length > 0 && l !== '---');
}

export function thread(vaultRoot, topic, { days } = {}) {
  if (!topic) {
    throw new Error('Usage: obsidian-agent thread <topic>');
  }

  const vault = new Vault(vaultRoot);
  const today = todayStr();
  const allNotes = vault.scanNotes({ includeBody: true });

  // Resolve topic: could be a note name, tag, or keyword
  // Check tag first — if topic is an exact tag, prefer that interpretation
  // unless there's also an exact note filename match
  const isTag = allNotes.some(n => n.tags.includes(topic));
  const exactNote = allNotes.find(n => n.file === topic);
  const topicNote = isTag && !exactNote ? null : vault.findNote(topic);
  const topicTitle = topicNote ? topicNote.title : topic;

  const events = [];

  // 1. Note creation events — notes that match the topic
  const matchingNotes = allNotes.filter(n => {
    if (topicNote && n.file === topicNote.file) return true;
    if (isTag && n.tags.includes(topic)) return true;
    if (n.file.toLowerCase().includes(topic.toLowerCase())) return true;
    if (n.title.toLowerCase().includes(topic.toLowerCase())) return true;
    if (n.tags.includes(topic)) return true;
    return false;
  });

  for (const n of matchingNotes) {
    if (n.type === 'journal') continue;
    if (n.created) {
      events.push({
        date: n.created,
        icon: n.type === 'idea' ? '\u{1F4A1}' : n.type === 'project' ? '\u{1F3AF}' : '\u{1F4DD}',
        type: 'created',
        source: `${n.dir}/${n.file}.md`,
        detail: `${n.type} "${n.title}" created${n.status === 'draft' ? ' (draft)' : ''}`,
      });
    }
    // If updated differs from created, add an update event
    if (n.updated && n.created && n.updated !== n.created) {
      events.push({
        date: n.updated,
        icon: '\u{270F}\u{FE0F}',
        type: 'updated',
        source: `${n.dir}/${n.file}.md`,
        detail: `${n.type} "${n.title}" updated (status: ${n.status})`,
      });
    }
  }

  // 2. Backlink events — notes that reference the topic note
  if (topicNote) {
    const bl = vault.backlinks(topicNote.file);
    for (const b of bl) {
      if (b.type === 'journal') continue;
      if (b.created) {
        events.push({
          date: b.created,
          icon: '\u{1F517}',
          type: 'backlink-created',
          source: `${b.dir}/${b.file}.md`,
          detail: `${b.type} "${b.title}" linked to [[${topicNote.file}]]`,
        });
      }
    }
  }

  // 3. Journal mention events — scan all journals for topic references
  const journalDir = vault.path('journal');
  let journalFiles;
  try { journalFiles = readdirSync(journalDir); } catch { journalFiles = []; }

  const cutoff = days
    ? (() => { const d = new Date(today + 'T12:00:00Z'); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); })()
    : null;

  for (const file of journalFiles) {
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!dateMatch) continue;
    const d = dateMatch[1];
    if (cutoff && d < cutoff) continue;

    const content = vault.read('journal', file);
    if (!content) continue;

    const mentions = extractMentionLines(content, topic, topicTitle);
    if (mentions.length) {
      // Pick the most relevant line (skip navigation/frontmatter lines)
      const best = mentions.find(l => l.startsWith('- ') && l.length > 5) || mentions[0];
      events.push({
        date: d,
        icon: '\u{1F4D3}',
        type: 'journal-mention',
        source: `journal/${file}`,
        detail: best.replace(/^- /, '').slice(0, 120),
      });
    }
  }

  // 4. Related note activity — notes in related field of topic note
  if (topicNote) {
    for (const relName of topicNote.related) {
      const relNote = allNotes.find(n => n.file === relName);
      if (!relNote || relNote.type === 'journal') continue;
      if (relNote.updated && relNote.updated !== relNote.created) {
        events.push({
          date: relNote.updated,
          icon: '\u{1F504}',
          type: 'related-updated',
          source: `${relNote.dir}/${relNote.file}.md`,
          detail: `related note "${relNote.title}" updated`,
        });
      }
    }
  }

  // Sort chronologically
  events.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

  // Deduplicate (same date + same source + same type)
  const seen = new Set();
  const unique = events.filter(e => {
    const key = `${e.date}|${e.source}|${e.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!unique.length) {
    console.log(`No history found for topic: "${topic}"`);
    return { status: 'empty', topic, events: [] };
  }

  // Compute span
  const firstDate = unique[0].date;
  const lastDate = unique[unique.length - 1].date;
  const spanDays = daysBetween(firstDate, lastDate);

  // Console output
  console.log(`\nThread: ${topicTitle}${isTag ? ' (tag)' : topicNote ? ' (note)' : ' (keyword)'}\n`);
  console.log(`Span: ${firstDate} \u2192 ${lastDate} (${spanDays} days, ${unique.length} events)\n`);

  let lastMonth = '';
  for (const e of unique) {
    const month = e.date.slice(0, 7);
    if (month !== lastMonth) {
      if (lastMonth) console.log('');
      console.log(`\u2500\u2500 ${month} \u2500\u2500`);
      lastMonth = month;
    }
    console.log(`  ${e.date}  ${e.icon} ${e.detail}`);
  }

  console.log(`\n${unique.length} events across ${spanDays} days`);

  return {
    status: 'ok',
    topic,
    topicType: topicNote ? 'note' : isTag ? 'tag' : 'keyword',
    firstSeen: firstDate,
    lastSeen: lastDate,
    spanDays,
    eventCount: unique.length,
    events: unique,
  };
}
