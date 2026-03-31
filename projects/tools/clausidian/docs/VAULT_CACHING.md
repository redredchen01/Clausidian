# Vault Query Caching (B2.2)

Smart caching layer for vault queries with TTL management. Reduces repeated queries from 200ms to <5ms on cache hits.

## Overview

`VaultQueryCache` provides intelligent caching of vault queries with pattern-based TTL assignment and automatic cache management.

**Performance Target**: Repeated queries <5ms (cache hits)
**Cache Hit Rate Target**: >70% in typical usage

## Architecture

### Cache Storage
- **In-memory Map**: Fast O(1) lookups for cached results
- **Metadata tracking**: TTL, creation time, expiration time, original query
- **Optional disk persistence**: Save/load across sessions

### TTL Strategy

Pattern-based TTL assignment:

| Pattern | TTL | Examples |
|---------|-----|----------|
| **Stable** | 24 hours | ideas, skills, templates, projects, archive |
| **Time-sensitive** | 5 minutes | urgent, recent, today, unread, inbox |
| **General** | 1 hour | api, database, config, schema, backend, devops |
| **Unknown** | 1 hour | custom queries |

## API Reference

### Constructor

```javascript
const cache = new VaultQueryCache(cachePath, vaultIndexer);
```

- `cachePath` (optional): Path to cache file
- `vaultIndexer` (optional): Reference to VaultIndexer for warm-up

### Key Methods

#### Cache Key Generation

```javascript
const key = cache.getCacheKey(query, params);
```

Generates deterministic SHA256 cache key from query and parameters.

#### Query with Caching

```javascript
const result = await cache.queryWithCache(query, queryFn, params);
```

Execute a query with automatic caching.

#### Cache Invalidation

```javascript
const count = cache.invalidateCache(pattern);
```

Invalidate entries matching a pattern (string or RegExp).

#### Statistics

```javascript
const stats = cache.getCacheStats();
```

Returns cache statistics including hit rate and memory usage.

## Usage Examples

### Basic Caching

```javascript
const cache = new VaultQueryCache();

const result = await cache.queryWithCache('ideas', async () => {
  return vaultIndexer.searchByTag('ideas');
});
```

### With Warm-up

```javascript
const cache = new VaultQueryCache(null, indexer);
await cache.warmupCache();
```

## Testing

```bash
node test/vault-query-cache.test.mjs
```

18 tests, all passing (cache hit/miss, TTL, invalidation, persistence, concurrency).

## Integration with B2.1

Works with Vault Incremental Indexer for fast vault queries.

## Performance Characteristics

- **Cache hit**: <1ms
- **Cache miss + function**: 200ms+ (depends on vault size)
- **Memory**: ~100-500 bytes per cached entry

## Next: B2.3 Parallel Query Execution

Ready for parallel execution of cached queries.
