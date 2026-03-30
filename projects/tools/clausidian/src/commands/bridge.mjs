/**
 * bridge — cross-system integration commands
 * Syncs external events/data to vault (Google Calendar, Gmail, GitHub)
 */
import { execSync } from 'child_process';
import { Vault } from '../vault.mjs';
import { todayStr, nextDate } from '../dates.mjs';

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 30000 }).trim(); }
  catch (err) { throw new Error(`gwx error: ${err.message}`); }
}

// ── Google Calendar integration ──

export function bridgeGcal(vaultRoot, { date } = {}) {
  const vault = new Vault(vaultRoot);
  const targetDate = date || todayStr();
  const journalFile = `${targetDate}.md`;

  try {
    // Query gwx calendar for the day
    const fromDate = `${targetDate}T00:00:00Z`;
    const toDate = `${nextDate(targetDate)}T00:00:00Z`;

    let eventsJson;
    try {
      eventsJson = run(`gwx calendar list --from ${targetDate} --to ${nextDate(targetDate)} --format json`);
    } catch (err) {
      if (err.message.includes('oauth2') || err.message.includes('not found')) {
        console.log(JSON.stringify({
          status: 'skipped',
          event: 'bridge_gcal',
          date: targetDate,
          reason: 'gwx not authenticated or installed'
        }));
        return;
      }
      throw err;
    }

    let events = [];
    try {
      const result = JSON.parse(eventsJson);
      if (result.error) {
        console.log(JSON.stringify({
          status: 'error',
          event: 'bridge_gcal',
          date: targetDate,
          error: result.error.message
        }));
        return;
      }
      events = result.events || [];
    } catch {
      console.log(JSON.stringify({
        status: 'skipped',
        event: 'bridge_gcal',
        date: targetDate,
        reason: 'invalid gwx response'
      }));
      return;
    }

    if (events.length === 0) {
      console.log(JSON.stringify({
        status: 'skipped',
        event: 'bridge_gcal',
        date: targetDate,
        reason: 'no events'
      }));
      return;
    }

    // Build meeting blocks
    const meetingBlocks = events.map(event => {
      const start = new Date(event.start.dateTime || event.start.date);
      const end = new Date(event.end.dateTime || event.end.date);
      const startTime = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const endTime = end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const attendees = event.attendees ? event.attendees.map(a => a.email).join(', ') : '(organizer)';
      const description = event.description || '(no description)';

      return `### ${event.summary}
- **Time:** ${startTime}–${endTime}
- **Attendees:** ${attendees}
- **Notes:** ${description}
`;
    }).join('\n');

    // Read existing journal
    const existing = vault.read('journal', journalFile);
    if (!existing) {
      console.log(JSON.stringify({
        status: 'skipped',
        event: 'bridge_gcal',
        date: targetDate,
        reason: 'journal not found'
      }));
      return;
    }

    // Append meeting blocks to journal (after ## 今日記錄 or ## Records)
    let updated = existing;
    const recordsMatch = existing.match(/## (今日[記记]錄|Records)\n/);
    if (recordsMatch) {
      const section = recordsMatch[1];
      updated = existing.replace(
        new RegExp(`(## ${section}\\n)`),
        `$1\n## 會議\n\n${meetingBlocks}\n`
      );
    } else {
      // Append at end
      updated = `${existing}\n\n## 會議\n\n${meetingBlocks}`;
    }

    vault.write('journal', journalFile, updated);
    console.log(JSON.stringify({
      status: 'updated',
      event: 'bridge_gcal',
      date: targetDate,
      meetings: events.length,
      journalFile
    }));
  } catch (err) {
    console.error(`[bridge_gcal error] ${err.message}`);
    return { status: 'error', event: 'bridge_gcal', error: err.message };
  }
}

// ── Gmail integration (placeholder) ──

export function bridgeGmail(vaultRoot, options = {}) {
  console.log(JSON.stringify({
    status: 'skipped',
    event: 'bridge_gmail',
    reason: 'not yet implemented'
  }));
}

// ── GitHub integration (placeholder) ──

export function bridgeGithub(vaultRoot, options = {}) {
  console.log(JSON.stringify({
    status: 'skipped',
    event: 'bridge_github',
    reason: 'not yet implemented'
  }));
}
