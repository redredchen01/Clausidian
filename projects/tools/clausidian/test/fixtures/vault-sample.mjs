/**
 * Sample vault data for testing
 * Provides reusable note templates, tags, and backlinks
 */

export const SAMPLE_NOTES = {
  // Projects
  'projects/build-api.md': {
    title: 'Build API',
    type: 'project',
    tags: ['backend', 'api'],
    status: 'active',
    summary: 'Build the core REST API',
    created: '2026-03-27',
    updated: '2026-03-27',
    related: ['build-auth', 'setup-db'],
    body: '# Build API\n\nCore REST API for the platform.\n'
  },
  'projects/build-auth.md': {
    title: 'Build Auth',
    type: 'project',
    tags: ['backend', 'security'],
    status: 'active',
    summary: 'Implement JWT authentication',
    created: '2026-03-26',
    updated: '2026-03-28',
    related: ['build-api'],
    body: '# Build Auth\n\nJWT-based authentication system.\n'
  },
  'projects/web-frontend.md': {
    title: 'Web Frontend',
    type: 'project',
    tags: ['frontend', 'react'],
    status: 'planning',
    summary: 'Build React dashboard',
    created: '2026-03-25',
    updated: '2026-03-27',
    related: ['build-api'],
    body: '# Web Frontend\n\nReact-based admin dashboard.\n'
  },

  // Areas
  'areas/backend.md': {
    title: 'Backend Development',
    type: 'area',
    tags: ['backend', 'infrastructure'],
    status: 'active',
    summary: 'All backend infrastructure work',
    created: '2026-03-01',
    updated: '2026-03-28',
    related: [],
    body: '# Backend Development\n\nBackend systems and infrastructure.\n'
  },
  'areas/frontend.md': {
    title: 'Frontend Development',
    type: 'area',
    tags: ['frontend', 'ui'],
    status: 'active',
    summary: 'All frontend UI work',
    created: '2026-03-01',
    updated: '2026-03-28',
    related: [],
    body: '# Frontend Development\n\nFrontend and UI systems.\n'
  },

  // Resources
  'resources/node-docs.md': {
    title: 'Node.js Documentation',
    type: 'resource',
    tags: ['node', 'reference'],
    status: 'active',
    summary: 'Node.js official documentation',
    created: '2026-03-20',
    updated: '2026-03-20',
    related: [],
    body: '# Node.js Documentation\n\nReference for Node.js APIs.\n'
  },
  'resources/react-docs.md': {
    title: 'React Documentation',
    type: 'resource',
    tags: ['react', 'reference'],
    status: 'active',
    summary: 'React official documentation',
    created: '2026-03-20',
    updated: '2026-03-20',
    related: [],
    body: '# React Documentation\n\nReference for React APIs.\n'
  },

  // Ideas
  'ideas/vector-search.md': {
    title: 'Vector Search',
    type: 'idea',
    tags: ['search', 'ai', 'feature'],
    status: 'draft',
    summary: 'Use embeddings for semantic search',
    created: '2026-03-27',
    updated: '2026-03-27',
    related: [],
    body: '# Vector Search\n\nUse vector embeddings for semantic search.\n'
  },
  'ideas/cache-optimization.md': {
    title: 'Cache Optimization',
    type: 'idea',
    tags: ['performance', 'optimization'],
    status: 'draft',
    summary: 'Implement multi-layer caching strategy',
    created: '2026-03-28',
    updated: '2026-03-28',
    related: ['build-api'],
    body: '# Cache Optimization\n\nMulti-layer cache for performance.\n'
  },
};

/**
 * Generate frontmatter YAML from metadata
 */
export function generateFrontmatter(meta) {
  const lines = ['---'];
  lines.push(`title: "${meta.title}"`);
  lines.push(`type: ${meta.type}`);
  lines.push(`tags: [${meta.tags.join(', ')}]`);
  lines.push(`status: ${meta.status}`);
  lines.push(`summary: "${meta.summary}"`);
  lines.push(`created: ${meta.created}`);
  lines.push(`updated: ${meta.updated}`);
  lines.push(`related: [${meta.related.join(', ')}]`);
  lines.push('---');
  return lines.join('\n');
}

/**
 * Generate complete note content from metadata
 */
export function generateNoteContent(meta) {
  const frontmatter = generateFrontmatter(meta);
  return `${frontmatter}\n\n${meta.body}`;
}

/**
 * Get tags used in sample notes
 */
export function getSampleTags() {
  const tags = new Set();
  Object.values(SAMPLE_NOTES).forEach(note => {
    note.tags.forEach(tag => tags.add(tag));
  });
  return Array.from(tags).sort();
}

/**
 * Get notes by type
 */
export function getNotesByType(type) {
  return Object.entries(SAMPLE_NOTES)
    .filter(([_, meta]) => meta.type === type)
    .map(([path, _]) => path);
}

/**
 * Get notes by tag
 */
export function getNotesByTag(tag) {
  return Object.entries(SAMPLE_NOTES)
    .filter(([_, meta]) => meta.tags.includes(tag))
    .map(([path, _]) => path);
}
