# Caching Architecture

pi-lens uses a multi-layer caching strategy to avoid redundant work across sessions.

## Cache Layers

### 1. Tool Availability Cache

**Location:** `clients/tool-availability.ts`

```
Map<toolName, {available, version}>
• Persisted for session lifetime
• Refreshed on extension restart
```

Avoids repeated `which`/`where` calls for tools like `biome`, `ruff`, `pyright`.

### 2. Dispatch Baselines (Delta Mode)

**Location:** `clients/dispatch/dispatcher.ts`

```
Map<filePath, Diagnostic[]>
• Cleared at turn start
• Updated after each runner execution
• Filters: only NEW issues shown
```

First edit shows all issues; subsequent edits only show issues that weren't there before.

### 3. Client-Level Caches

| Client | Cache | TTL | Purpose |
|--------|-------|-----|---------|
| **Knip** | `clients/cache-manager.ts` | 5 min | Dead code analysis |
| **jscpd** | `clients/cache-manager.ts` | 5 min | Duplicate detection |
| **Type Coverage** | In-memory | Session | `any` type percentage |
| **Complexity** | In-memory | File-level | MI, cognitive complexity |

### 4. Session Turn State

**Location:** `clients/cache-manager.ts`

Tracks per-turn state:
- Modified files this turn
- Modified line ranges per file
- Import changes detected
- Turn cycle counter (max 10)

Used by:
- jscpd: Only re-scan modified files
- Madge: Only check deps if imports changed
- Cycle detection: Prevents infinite fix loops

### 5. Tree-sitter Caches

| Component | Location | Strategy | Details |
|-----------|----------|----------|---------|
| **TreeCache** | `clients/tree-sitter-cache.ts` | SHA-256 content hash + mtime | Parsed ASTs cached by file content; 50-file LRU; mtime check for invalidation |
| **Query Cache** | `clients/tree-sitter-client.ts` | In-memory Map | Compiled tree-sitter queries cached per language |
| **Navigator** | `clients/tree-sitter-navigator.ts` | Runtime scope detection | Parent/sibling traversal, test block detection, try-catch detection |

**TreeCache implementation:**
- SHA-256 hashing of file content for cache keys
- mtime tracking for fast invalidation checks
- LRU eviction when cache exceeds 50 files
- `incrementalUpdate()` API ready for full incremental parsing when old content is tracked

## Cache Invalidation

- **Tool caches:** Refreshed on extension restart
- **File caches:** Invalidated by mtime change
- **Turn state:** Reset at each turn start
