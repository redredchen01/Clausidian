/**
 * yaml-lite — minimal YAML parser/serializer for .base files
 *
 * Handles the YAML subset used by Obsidian Bases:
 * - Scalars (strings, numbers, booleans)
 * - Arrays (both flow [...] and block - item)
 * - Objects (nested key: value)
 * - Quoted strings
 *
 * NOT a full YAML parser — only what Bases needs.
 */

// ── Parse ──

export function parseYaml(text) {
  const lines = text.split('\n');
  return parseBlock(lines, 0, 0).value;
}

function parseBlock(lines, start, baseIndent) {
  const result = {};
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) { i++; continue; }

    const indent = line.search(/\S/);
    if (indent < baseIndent) break;
    if (indent > baseIndent && i > start) break;

    const trimmed = line.trim();

    // Array item: - value or - \n  key: val (object array)
    if (trimmed.startsWith('- ')) {
      const arr = [];
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === '' || l.trim().startsWith('#')) { i++; continue; }
        const ind = l.search(/\S/);
        if (ind < baseIndent) break;
        const t = l.trim();
        if (!t.startsWith('- ')) break;

        const itemContent = t.slice(2).trim();
        if (itemContent === '' || itemContent.includes(':')) {
          // Object item: parse subsequent indented lines as object
          const obj = {};
          if (itemContent.includes(':')) {
            const [k, ...v] = itemContent.split(':');
            obj[k.trim()] = parseScalar(v.join(':').trim());
          }
          i++;
          // Read remaining object fields at deeper indent
          while (i < lines.length) {
            const nl = lines[i];
            if (nl.trim() === '' || nl.trim().startsWith('#')) { i++; continue; }
            const nInd = nl.search(/\S/);
            if (nInd <= baseIndent) break;
            if (nl.trim().startsWith('- ')) break;
            const nt = nl.trim();
            const ci = nt.indexOf(':');
            if (ci !== -1) {
              obj[nt.slice(0, ci).trim()] = parseScalar(nt.slice(ci + 1).trim());
            }
            i++;
          }
          arr.push(Object.keys(obj).length > 0 ? obj : null);
        } else {
          arr.push(parseScalar(itemContent));
          i++;
        }
      }
      return { value: arr, end: i };
    }

    // Key: value
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) { i++; continue; }

    const key = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();

    if (rest === '') {
      // Block value — could be object or array
      const nextNonEmpty = findNextNonEmpty(lines, i + 1);
      if (nextNonEmpty >= lines.length) { result[key] = null; i++; continue; }

      const nextIndent = lines[nextNonEmpty].search(/\S/);
      if (nextIndent <= indent) { result[key] = null; i++; continue; }

      if (lines[nextNonEmpty].trim().startsWith('- ')) {
        const { value, end } = parseBlock(lines, nextNonEmpty, nextIndent);
        result[key] = value;
        i = end;
      } else {
        const { value, end } = parseBlock(lines, nextNonEmpty, nextIndent);
        result[key] = value;
        i = end;
      }
    } else if (rest.startsWith('[')) {
      // Flow array
      result[key] = parseFlowArray(rest);
      i++;
    } else if (rest.startsWith('{')) {
      // Flow object
      result[key] = parseFlowObject(rest);
      i++;
    } else {
      result[key] = parseScalar(rest);
      i++;
    }
  }

  return { value: result, end: i };
}

function findNextNonEmpty(lines, start) {
  let i = start;
  while (i < lines.length && (lines[i].trim() === '' || lines[i].trim().startsWith('#'))) i++;
  return i;
}

function parseScalar(s) {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  // Strip quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseFlowArray(s) {
  s = s.trim();
  if (!s.startsWith('[') || !s.endsWith(']')) return [s];
  const inner = s.slice(1, -1).trim();
  if (inner === '') return [];
  return inner.split(',').map(item => parseScalar(item.trim()));
}

function parseFlowObject(s) {
  s = s.trim();
  if (!s.startsWith('{') || !s.endsWith('}')) return {};
  const inner = s.slice(1, -1).trim();
  if (inner === '') return {};
  const obj = {};
  for (const pair of inner.split(',')) {
    const [k, ...v] = pair.split(':');
    if (k) obj[k.trim()] = parseScalar(v.join(':').trim());
  }
  return obj;
}

// ── Serialize ──

export function toYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  let out = '';

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item);
        if (entries.length > 0) {
          const [firstKey, firstVal] = entries[0];
          out += `${pad}- ${firstKey}: ${serializeScalar(firstVal)}\n`;
          for (let j = 1; j < entries.length; j++) {
            const [k, v] = entries[j];
            out += `${pad}  ${k}: ${serializeScalar(v)}\n`;
          }
        } else {
          out += `${pad}- {}\n`;
        }
      } else {
        out += `${pad}- ${serializeScalar(item)}\n`;
      }
    }
    return out;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      out += `${pad}${key}:\n`;
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        out += `${pad}${key}: []\n`;
      } else if (value.every(v => typeof v !== 'object')) {
        // Flow array for simple values
        out += `${pad}${key}: [${value.map(serializeScalar).join(', ')}]\n`;
      } else {
        out += `${pad}${key}:\n`;
        out += toYaml(value, indent + 1);
      }
    } else if (typeof value === 'object') {
      out += `${pad}${key}:\n`;
      out += toYaml(value, indent + 1);
    } else {
      out += `${pad}${key}: ${serializeScalar(value)}\n`;
    }
  }
  return out;
}

function serializeScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    // Needs quoting if contains special chars
    if (v.includes(':') || v.includes('#') || v.includes("'") || v.startsWith(' ') || v.endsWith(' ')
        || v.includes('"') || v.includes('!=') || v.includes('==')) {
      // Use single quotes to avoid escaping issues with double quotes in filter expressions
      if (!v.includes("'")) return `'${v}'`;
      return `"${v.replace(/"/g, '\\"')}"`;
    }
    return v;
  }
  return String(v);
}
