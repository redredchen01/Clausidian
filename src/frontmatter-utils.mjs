/**
 * Frontmatter Utilities — unified parsing and serialization of YAML frontmatter
 */

/**
 * Parse YAML frontmatter from note content.
 * @param {string} content - Full note content (including frontmatter)
 * @returns {Object} Parsed frontmatter object {title, type, tags, status, ...}
 */
export function parseFrontmatter(content) {
  if (!content) return {};
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = match[1];
  const result = {};
  for (const line of fm.split('\n')) {
    // Match key: value, allowing colons in value portion
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!m) continue;
    let [, key, val] = m;
    val = val.trim();
    if (!val) continue;
    val = val.replace(/^"(.*)"$/, '$1');
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s =>
        s.trim().replace(/^"(.*)"$/, '$1').replace(/^\[\[(.*)\]\]$/, '$1')
      ).filter(Boolean);
    }
    result[key] = val;
  }
  return result;
}

/**
 * Extract body content (after frontmatter).
 * @param {string} content - Full note content (including frontmatter)
 * @returns {string} Body text without frontmatter
 */
export function extractBody(content) {
  if (!content) return '';
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

/**
 * Serialize frontmatter to YAML string.
 * @param {Object} frontmatter - Frontmatter object
 * @returns {string} YAML frontmatter block (---\n...\n---)
 */
export function serializeFrontmatter(frontmatter) {
  let fm = '---\n';
  for (const [key, val] of Object.entries(frontmatter)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      fm += `${key}: [${val.join(', ')}]\n`;
    } else {
      fm += `${key}: "${val}"\n`;
    }
  }
  fm += '---\n';
  return fm;
}

/**
 * Merge new frontmatter into existing content, preserving body.
 * @param {string} content - Original content (with frontmatter and body)
 * @param {Object} updates - Partial frontmatter updates
 * @returns {string} Updated content with merged frontmatter
 */
export function mergeFrontmatter(content, updates) {
  const existing = parseFrontmatter(content);
  const merged = { ...existing, ...updates };
  const body = extractBody(content);
  return serializeFrontmatter(merged) + body;
}

/**
 * Update a single frontmatter field in content.
 * @param {string} content - Original content
 * @param {string} key - Field key
 * @param {any} value - Field value
 * @returns {string} Updated content
 */
export function updateFrontmatterField(content, key, value) {
  return mergeFrontmatter(content, { [key]: value });
}
