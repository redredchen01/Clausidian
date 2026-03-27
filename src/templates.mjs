/**
 * Template engine — resolves {{PLACEHOLDER}} in templates
 */
import { resolve, join, dirname } from 'path';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const BUILTIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scaffold', 'templates');

export class TemplateEngine {
  constructor(vaultRoot) {
    this.vaultDir = join(vaultRoot, 'templates');
  }

  /**
   * Load a template by name (e.g. "journal", "project")
   * Prefers vault's templates/ over built-in scaffold/templates/
   */
  load(name) {
    const vaultPath = join(this.vaultDir, `${name}.md`);
    if (existsSync(vaultPath)) return readFileSync(vaultPath, 'utf8');
    const builtinPath = join(BUILTIN_DIR, `${name}.md`);
    if (existsSync(builtinPath)) return readFileSync(builtinPath, 'utf8');
    throw new Error(`Template not found: ${name}`);
  }

  /**
   * Render a template with variables
   * @param {string} name - template name
   * @param {Record<string, string>} vars - key/value pairs for {{KEY}} replacement
   */
  render(name, vars = {}) {
    let content = this.load(name);
    // Strip AGENT comment blocks
    content = content.replace(/<!--\s*AGENT[\s\S]*?-->\n?/g, '');
    for (const [key, val] of Object.entries(vars)) {
      content = content.replaceAll(`{{${key}}}`, val);
    }
    return content;
  }
}
