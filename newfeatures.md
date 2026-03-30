# New Features for pi-lens

Inspired by patterns from [better-result](https://github.com/dmmulroy/better-result) - a production-ready Result type library for TypeScript.

---

## 1. Result Type for Runner Execution

**Current:** Runners return ad-hoc objects with optional error fields.
**Proposed:** Explicit `Result<T, E>` type for all runner operations.

```typescript
// Current (commands/booboo.ts)
const result = safeSpawn(...); // { stdout, stderr, status, error? }

// Proposed: Explicit Result type
type RunnerResult<T> = Result<T, RunnerError>;

class RunnerNotAvailable extends TaggedError("RunnerNotAvailable")<{ 
  runner: string;
}>() {}

class RunnerTimeout extends TaggedError("RunnerTimeout")<{ 
  runner: string; 
  timeout: number;
}>() {}

// Type-safe execution
const result: RunnerResult<AstGrepFindings> = await runAstGrep(path);
// Type: Result<AstGrepFindings, RunnerNotAvailable | RunnerTimeout>
```

**Benefits:**
- Compile-time error handling guarantees
- Exhaustive error type checking
- No silent failures

---

## 2. Generator-Based Dispatch Composition

**Current:** Nested async/await with manual error handling per runner.
**Proposed:** Flat generator composition with automatic short-circuit on errors.

```typescript
// Current (nested, error-prone)
await tracker.run("ast-grep", async () => {
  const result = safeSpawn(...);
  if (result.error) return { findings: 0, status: "error" };
  const parsed = parseAstGrepJson(result.stdout);
  return { findings: parsed.length };
});

// Proposed: Flat composition
const boobooResults = Result.gen(async function* () {
  const astResults = yield* await runAstGrep(targetPath);
  const similarFns = yield* await findSimilarFunctions(targetPath);
  const complexity = yield* await analyzeComplexity(targetPath);
  
  return Result.ok({
    astFindings: astResults,
    similarFunctions: similarFns,
    complexity: complexity
  });
});
// Type: Result<BooBooResults, AstGrepError | SimilarityError | ComplexityError>
```

**Benefits:**
- No callback nesting
- Early exit on any failure (yield* Err short-circuits)
- Automatic error union typing

---

## 3. TaggedError for Issue Categories

**Current:** String-based categorization in `summaryItems` array.
**Proposed:** Branded error types that can be pattern-matched exhaustively.

```typescript
class DesignSmell extends TaggedError("DesignSmell")<{
  file: string;
  line: number;
  rule: string;
  fixable: boolean;
}>() {}

class HighComplexity extends TaggedError("HighComplexity")<{
  file: string;
  cognitive: number;
  threshold: number;
}>() {}

class DeadCode extends TaggedError("DeadCode")<{
  type: "export" | "file" | "dependency";
  name: string;
  file?: string;
}>() {}

// Pattern matching in fix command
issues.forEach(issue => matchError(issue, {
  DesignSmell: (e) => fixDesignSmell(e),      // Agent fixes
  HighComplexity: (e) => deferToRefactor(e), // Too big for auto-fix
  DeadCode: (e) => safelyRemove(e),          // Safe to auto-fix
  // Compile error if we forget a case!
}));
```

**Benefits:**
- Exhaustive matching (compile-time safety)
- Rich structured data per issue type
- Type guards for narrowing

---

## 4. Panic for Defects vs Expected Errors

**Problem:** Currently can't distinguish "runner not installed" (expected) from "callback threw" (bug).

```typescript
// Proposed: Defect handling
const result = Result.try({
  try: () => clients.biome.fixFiles(files),
  catch: (e) => new BiomeExecutionError({ cause: e })
});

// If the callback itself throws, that's a Panic (defect in our code)
// If biome returns an error status, that's an Err (expected failure)

try {
  const fixed = result.unwrap();
} catch (e) {
  if (isPanic(e)) {
    // Log to error reporting (bug in pi-lens)
    reportDefect(e);
  } else {
    // Handle expected error (biome not found, etc.)
    ctx.ui.notify(`Biome failed: ${e.message}`, "error");
  }
}
```

**Benefits:**
- Rust-style panic for unrecoverable errors
- Preserves type safety (no `Err<unknown>`)
- Clear distinction between domain errors and bugs

---

## 5. Retry for Flaky Operations

**Current:** Single-shot operations that fail permanently.
**Proposed:** Configurable retry with backoff strategies.

```typescript
// For subprocess spawning that can be flaky
const knipResult = await Result.tryPromise(
  () => runKnip(targetPath),
  {
    retry: {
      times: 3,
      delayMs: 100,
      backoff: "exponential", // or "linear" | "constant"
      shouldRetry: (e) => e._tag === "SpawnError" // Only retry spawn failures
    }
  }
);

// For network-based AI calls
const aiFix = await Result.tryPromise(
  () => aiClient.fixIssue(issue),
  {
    retry: {
      times: 3,
      delayMs: 500,
      backoff: "exponential",
      shouldRetry: (e) => e._tag === "RateLimitError"
    }
  }
);
```

**Benefits:**
- Resilient to transient failures
- Conditional retry (only for specific errors)
- Built-in backoff strategies

---

## 6. Partition for Batch Results

**Current:** Manual filtering of success/failure arrays.
**Proposed:** Built-in partition function for batch operations.

```typescript
// Current
const results = await Promise.all(files.map(f => fixFile(f)));
const fixed = results.filter(r => r.success);
const failed = results.filter(r => !r.success);

// Proposed
const results = await Promise.all(files.map(f => fixFile(f)));
const [fixed, failed] = Result.partition(results);

ctx.ui.notify(`✅ Fixed ${fixed.length}, ❌ Failed ${failed.length}`);

// Can also partition by error type
const [fixed, notFound, timeout, other] = Result.partitionBy(results, {
  FileNotFound: (e) => e._tag === "FileNotFound",
  Timeout: (e) => e._tag === "Timeout",
  Other: () => true
});
```

**Benefits:**
- Clean separation of success/failure
- Functional programming pattern
- Easy reporting statistics

---

## 7. Serialization for Caching/State

**Current:** Manual JSON handling for fix-session.json.
**Proposed:** Type-safe serialization/deserialization.

```typescript
// Cache booboo results
const serialized = Result.serialize(boobooResults);
// { status: "ok", value: { ... } }

// Store in .pi-lens/reviews/
fs.writeFileSync(path, JSON.stringify(serialized));

// Later: deserialize with type safety
const cached = Result.deserialize<BooBooResults, CacheError>(
  JSON.parse(fs.readFileSync(path, "utf-8"))
);

if (Result.isError(cached)) {
  // Handle corrupted cache
  reScan(); 
} else {
  useCached(cached.value);
}
```

**Benefits:**
- Type-safe caching
- Distinguish corrupt cache from valid data
- Easy RPC if pi-lens goes distributed

---

## 8. AI Skills Integration (like better-result's CLI)

**Idea:** `pi-lens` could install agent skills for advanced workflows.

```bash
npx pi-lens init
# Installs:
# - .pi/skills/pi-lens/
# - Commands like /analyze-complexity, /extract-helpers
# - Migration skills for upgrading projects
```

**Example skill commands:**

```
/analyze-complexity --threshold=20
/extract-helpers --similarity=0.8
/fix-types --files=clients/*.ts
```

**Benefits:**
- Self-documenting capabilities
- Consistent interface across projects
- AI-aware tooling

---

## Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Result type for `safe-spawn.ts` | Low | High (foundation) |
| 2 | TaggedError for issue categories | Medium | High (type safety) |
| 3 | Partition for batch operations | Low | Medium (DX) |
| 4 | Retry for flaky operations | Low | Medium (reliability) |
| 5 | Generator composition for dispatch | High | High (architecture) |
| 6 | Panic/defect handling | Medium | Medium (robustness) |
| 7 | Serialization for caching | Low | Low (convenience) |
| 8 | CLI skills integration | High | Medium (ecosystem) |

---

## Migration Path

1. **Phase 1:** Add Result types to low-level utilities (`safe-spawn.ts`)
2. **Phase 2:** Update runners to return Result types
3. **Phase 3:** Refactor dispatch system to use generator composition
4. **Phase 4:** Add TaggedError taxonomy for all issue types
5. **Phase 5:** Pattern-match in fix commands for smart dispatch

---

## Reference: Files That Would Benefit

| File | Current Pain Point | Proposed Pattern |
|------|-------------------|------------------|
| `clients/safe-spawn.ts` | Multiple failure modes unclear | `Result<Output, SpawnError \| TimeoutError>` |
| `clients/biome-client.ts` | Ad-hoc `{success, error}` returns | `Result<FixResult, BiomeError>` |
| `clients/ruff-client.ts` | Same as biome | `Result<FixResult, RuffError>` |
| `commands/booboo.ts` | Manual error checking per runner | `Result.gen()` composition |
| `commands/fix-from-booboo.ts` | String categorization | `TaggedError` + `matchError` |
| `clients/runner-tracker.ts` | No error accumulation | `Result` aggregation |

---

## See Also

- [better-result GitHub](https://github.com/dmmulroy/better-result)
- [Rust Result type](https://doc.rust-lang.org/std/result/)
- [Railway Oriented Programming](https://fsharpforfunandprofit.com/posts/recipe-part2/)
