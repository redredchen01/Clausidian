/**
 * note — create a new note with automatic linking
 */
import { Vault } from '../vault.mjs';
import { TemplateEngine } from '../templates.mjs';
import { IndexManager } from '../index-manager.mjs';
import { todayStr } from '../dates.mjs';

export function note(vaultRoot, title, type, { tags = [], goal = '', summary = '' } = {}) {
  const vault = new Vault(vaultRoot);
  const tpl = new TemplateEngine(vaultRoot);
  const idx = new IndexManager(vault);

  const validTypes = ['area', 'project', 'resource', 'idea'];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`);
  }

  const filename = title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/(^-|-$)/g, '');
  if (!filename) {
    throw new Error(`Cannot derive a valid filename from title: "${title}"`);
  }
  const dir = vault.typeDir(type);

  if (vault.exists(dir, `${filename}.md`)) {
    const np = vault.notePath(dir, filename);
    console.log(`Note already exists: ${np}`);
    return { status: 'exists', file: np };
  }

  // Find related notes
  const related = vault.findRelated(title, tags);
  const relatedLinks = related.map(r => `[[${r.file}]]`);

  // Choose template — use specific type or fallback to 'note'
  let templateName = type;
  try { tpl.load(templateName); } catch { templateName = 'note'; }

  const vars = {
    TITLE: title,
    DATE: todayStr(),
    TYPE: type,
    GOAL: goal,
    CONTENT: '',
  };

  let content = tpl.render(templateName, vars);

  // Inject related links and tags into frontmatter
  if (relatedLinks.length) {
    content = content.replace(/related: \[\]/, `related: [${relatedLinks.map(l => `"${l}"`).join(', ')}]`);
  }
  if (tags.length) {
    content = content.replace(/tags: \[\]/, `tags: [${tags.join(', ')}]`);
  }
  if (summary) {
    content = content.replace(/summary: ""/, `summary: "${summary}"`);
  }

  vault.write(dir, `${filename}.md`, content);
  idx.updateDirIndex(dir, filename, summary || title);
  idx.sync();

  // Update reverse links on related notes
  for (const rel of related) {
    const relContent = vault.read(rel.dir, `${rel.file}.md`);
    if (relContent && !relContent.includes(`[[${filename}]]`)) {
      const updated = relContent.replace(
        /related: \[(.*)]/,
        (match, inner) => {
          const existing = inner ? `${inner}, ` : '';
          return `related: [${existing}"[[${filename}]]"]`;
        }
      );
      if (updated !== relContent) {
        vault.write(rel.dir, `${rel.file}.md`, updated.replace(/updated: "\d{4}-\d{2}-\d{2}"/, `updated: "${todayStr()}"`));
      }
    }
  }

  const np = vault.notePath(dir, filename);
  console.log(`Created ${np} (${relatedLinks.length} related notes linked)`);
  return { status: 'created', file: np, related: relatedLinks.length };
}
