/**
 * macOS Notification Center via osascript
 * Gracefully no-ops on non-macOS platforms
 */
import { execSync } from 'child_process';
import { platform } from 'os';

export function notify(title, message, { sound = 'default' } = {}) {
  if (platform() !== 'darwin') return;
  try {
    const t = title.replace(/"/g, '\\"');
    const m = message.replace(/"/g, '\\"');
    const soundClause = sound ? ` sound name "${sound}"` : '';
    execSync(`osascript -e 'display notification "${m}" with title "${t}"${soundClause}'`);
  } catch {
    // Silently ignore — notifications are best-effort
  }
}
