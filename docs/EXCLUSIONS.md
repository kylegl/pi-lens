# File Exclusions

pi-lens automatically excludes certain files from analysis to reduce noise.

## Test Files

All runners respect test file exclusions.

**Excluded patterns:**
```
**/*.test.ts      **/*.test.tsx      **/*.test.js      **/*.test.jsx
**/*.spec.ts      **/*.spec.tsx      **/*.spec.js      **/*.spec.jsx
**/*.poc.test.ts  **/*.poc.test.tsx
**/test-utils.ts  **/test-*.ts
**/__tests__/**  **/tests/**  **/test/**
```

**Why:** Test files intentionally duplicate patterns and have different complexity standards.

## Build Artifacts (Source-Filter Module)

**New in 3.8.0:** pi-lens uses **sibling-file detection** via `clients/source-filter.ts` to eliminate build artifacts:

**How it works:**
- For each file, check if a "higher precedence" source sibling exists
- If yes, skip as build artifact; if no, keep as hand-written source

**Source precedence rules:**
| Source Extension | Shadows (Excluded) |
|------------------|-------------------|
| `.ts` | `.js`, `.mjs`, `.cjs` |
| `.tsx` | `.jsx`, `.js`, `.mjs`, `.cjs` |
| `.vue` | `.js`, `.mjs` |
| `.svelte` | `.js`, `.mjs` |
| `.coffee` | `.js` |

**Example:**
```
src/
  utils.ts      ✓ Kept (source)
  utils.js      ✗ Excluded (has .ts sibling)
  
  manual.js     ✓ Kept (no higher-precedence sibling)
```

**Benefits:**
- Works in mixed TS/JS projects (pure JS files kept when no TS sibling)
- Handles Vue/Svelte → JavaScript compilation
- No dependency on `tsconfig.json` detection

## Excluded Directories

| Directory | Reason |
|-----------|--------|
| `node_modules/` | Third-party dependencies |
| `.git/` | Version control metadata |
| `dist/`, `build/` | Build outputs |
| `.pi-lens/`, `.pi/` | pi agent internal files |
| `.next/`, `.ruff_cache/` | Framework/build caches |
| `coverage/` | Test coverage reports |

## Per-Runner Summary

| Runner | Test Files | Build Artifacts | Directories |
|--------|-----------|-----------------|-------------|
| **dispatch runners** | ✅ `skipTestFiles` | ✅ `isBuildArtifact()` from source-filter | ✅ `EXCLUDED_DIRS` |
| **booboo /lens-booboo** | ✅ `shouldIncludeFile()` | ✅ `collectSourceFiles()` from source-filter | ✅ `EXCLUDED_DIRS` |
| **Secrets scan** | ❌ No exclusion (security) | ❌ No exclusion | ✅ Dirs excluded |

Secrets scanning excludes nothing — security takes precedence over noise reduction.

**API:**
```typescript
// Check if a file is a build artifact
import { isBuildArtifact } from "./clients/source-filter.js";
if (isBuildArtifact("src/utils.js")) {
  // Has src/utils.ts sibling → skip
}

// Collect deduplicated source files
import { collectSourceFiles } from "./clients/source-filter.js";
const files = collectSourceFiles("./src"); // No build artifacts
```
