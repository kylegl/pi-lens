# OpenCode-Inspired Refactoring Plan for pi-lens

> Based on analysis of [OpenCode](https://github.com/anomalyco/opencode) LSP implementation and pi-lens current architecture.

## Executive Summary

OpenCode provides several architectural patterns that could significantly improve pi-lens:
1. **Effect-TS Service Layer** - Composable, testable async operations
2. **Bus/Event System** - Decoupled pub/sub for diagnostic updates
3. **LSP Client Management** - Multi-server lifecycle with debouncing
4. **Auto-Installation** - Seamless tool acquisition
5. **Smart Root Detection** - `NearestRoot()` for monorepos

---

## Current pi-lens Architecture

```
index.ts (800+ lines)
├── Client instances (tsClient, biomeClient, ruffClient, etc.)
├── Event handlers (session_start, tool_call, tool_result, turn_end)
├── Command handlers (/lens-booboo, /lens-booboo-fix, etc.)
└── Flag registration

dispatch/ (Phase 2 refactor)
├── dispatcher.ts - Registry + dispatchForFile()
├── runners/ - Individual tool wrappers
│   ├── biome.ts
│   ├── ruff.ts
│   ├── ts-lsp.ts
│   └── ...
└── plan.ts - TOOL_PLANS by FileKind
```

### Strengths
- Declarative dispatch system with `RunnerDefinition` pattern
- Delta mode (baseline tracking) for showing only NEW issues
- Output semantics (blocking/warning/fixed/silent)
- File kind detection system

### Pain Points
1. **No event bus** - Direct coupling between clients and handlers
2. **LSP is per-process** - No multi-server support like OpenCode
3. **No auto-install** - Tools must be pre-installed
4. **Sequential execution** - No concurrent runner execution
5. **Monolithic state** - `index.ts` manages all state

---

## Phase 1: Event Bus Architecture

### Goal: Decouple clients from handlers via pub/sub

OpenCode Reference: [`packages/opencode/src/bus/`](https://github.com/anomalyco/opencode/tree/dev/packages/opencode/src/bus)

```typescript
// NEW: src/bus/bus.ts
export namespace Bus {
  const subscribers = new Map<string, Set<(event: BusEvent) => void>>();
  
  export function publish<T>(event: BusEvent<T>) {
    const subs = subscribers.get(event.type) ?? new Set();
    for (const handler of subs) {
      handler(event);
    }
  }
  
  export function subscribe<T>(
    eventType: string, 
    handler: (event: BusEvent<T>) => void
  ): () => void {
    // ... return unsubscribe
  }
}

// NEW: src/bus/bus-event.ts
export namespace BusEvent {
  export function define<T>(
    type: string,
    schema: z.ZodSchema<T>
  ) {
    return {
      type,
      create: (properties: T) => ({ type, properties }),
    };
  }
}

// NEW: Diagnostic event types
export const Event = {
  // From OpenCode: packages/opencode/src/lsp/client.ts
  Diagnostics: BusEvent.define(
    "lsp.diagnostics",
    z.object({
      runnerId: z.string(),
      filePath: z.string(),
      diagnostics: z.array(DiagnosticSchema),
    })
  ),
  
  FileModified: BusEvent.define(
    "file.modified",
    z.object({
      filePath: z.string(),
      content: z.string().optional(),
    })
  ),
  
  RunnerCompleted: BusEvent.define(
    "runner.completed",
    z.object({
      runnerId: z.string(),
      filePath: z.string(),
      durationMs: z.number(),
    })
  ),
};
```

### Migration Strategy

```typescript
// BEFORE (index.ts)
pi.on("tool_result", async (event) => {
  const output = await dispatchLint(filePath, cwd, pi);
  return { content: [...event.content, { type: "text", text: output }] };
});

// AFTER (decoupled)
// FileWatcher publishes FileModified → RunnerManager subscribes → publishes Diagnostics → UI subscribes
pi.on("tool_result", async (event) => {
  Bus.publish(Event.FileModified.create({ filePath, content }));
  // UI handler subscribes to Diagnostics and aggregates
});
```

---

## Phase 2: Effect-TS Service Layer

### Goal: Replace imperative clients with composable Effect services

OpenCode Reference: [`packages/opencode/src/lsp/index.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/lsp/index.ts)

```typescript
// NEW: src/services/lsp/service.ts
import { Effect, Layer, ServiceMap } from "effect";

export namespace LSPService {
  export interface Interface {
    readonly init: () => Effect.Effect<void>;
    readonly status: () => Effect.Effect<LSPStatus[]>;
    readonly hasClients: (file: string) => Effect.Effect<boolean>;
    readonly touchFile: (input: string, waitForDiagnostics?: boolean) => Effect.Effect<void>;
    readonly diagnostics: () => Effect.Effect<Record<string, Diagnostic[]>>;
    readonly hover: (input: LocInput) => Effect.Effect<any>;
    readonly definition: (input: LocInput) => Effect.Effect<any[]>;
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@pi-lens/LSP") {}
  
  // Layer composition for dependency injection
  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      // Similar to OpenCode's state management
      const state = yield* InstanceState.make<State>(
        Effect.fn("LSP.state")(function* () {
          const cfg = yield* config.get();
          // ... initialize LSP clients per language
          return { clients: [], servers: cfg.lspServers ?? {} };
        })
      );
      
      return Service.of({
        init: Effect.fn("LSP.init")(function* () {
          yield* InstanceState.get(state);
        }),
        // ... other methods
      });
    })
  );
}
```

### Key Benefits

1. **Automatic error handling** - `Effect.catchCause`
2. **Resource management** - `Effect.addFinalizer` for cleanup
3. **Concurrent execution** - `Effect.all` for parallel runners
4. **Timeout handling** - `Effect.timeout`
5. **Testability** - Layer mocking

---

## Phase 3: Multi-LSP Client Management

### Goal: Support multiple LSP servers per file (like OpenCode)

OpenCode Reference: [`packages/opencode/src/lsp/client.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/lsp/client.ts)

```typescript
// NEW: src/lsp/client.ts (adapted from OpenCode)
export namespace LSPClient {
  const DIAGNOSTICS_DEBOUNCE_MS = 150;
  
  export async function create(input: {
    serverID: string;
    server: LSPServer.Handle;
    root: string;
  }) {
    const connection = createMessageConnection(
      new StreamMessageReader(input.server.process.stdout),
      new StreamMessageWriter(input.server.process.stdin),
    );
    
    const diagnostics = new Map<string, Diagnostic[]>();
    
    // From OpenCode: debounced diagnostics
    connection.onNotification("textDocument/publishDiagnostics", (params) => {
      const filePath = Filesystem.normalizePath(fileURLToPath(params.uri));
      const exists = diagnostics.has(filePath);
      diagnostics.set(filePath, params.diagnostics);
      
      // Debounce to allow follow-up diagnostics (semantic after syntax)
      if (!exists && input.serverID === "typescript") return;
      
      Bus.publish(Event.Diagnostics.create({
        path: filePath,
        serverID: input.serverID,
        diagnostics: params.diagnostics,
      }));
    });
    
    // Initialize with timeout (45s from OpenCode)
    await withTimeout(
      connection.sendRequest("initialize", {
        rootUri: pathToFileURL(input.root).href,
        capabilities: {
          textDocument: {
            publishDiagnostics: { versionSupport: true },
          },
        },
      }),
      45_000
    );
    
    return {
      notify: {
        async open(input: { path: string }) {
          // Send textDocument/didOpen
        },
        async change(input: { path: string; content: string }) {
          // Send textDocument/didChange with incremental sync
        },
      },
      get diagnostics() { return diagnostics; },
      async waitForDiagnostics(input: { path: string }) {
        // From OpenCode: wait with debounce
        return withTimeout(
          new Promise((resolve) => {
            const unsub = Bus.subscribe(Event.Diagnostics, (event) => {
              if (event.properties.path === normalizedPath) {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                  unsub();
                  resolve();
                }, DIAGNOSTICS_DEBOUNCE_MS);
              }
            });
          }),
          3000
        );
      },
      async shutdown() {
        connection.end();
        connection.dispose();
        await Process.stop(input.server.process);
      },
    };
  }
}
```

### Multi-Server Support

```typescript
// NEW: src/lsp/server.ts (adapted from OpenCode)
export namespace LSPServer {
  // From OpenCode: NearestRoot for monorepo detection
  const NearestRoot = (includePatterns: string[], excludePatterns?: string[]): RootFunction => {
    return async (file) => {
      // Walk up tree looking for markers
      const files = Filesystem.up({
        targets: includePatterns,
        start: path.dirname(file),
        stop: Instance.directory,
      });
      const first = await files.next();
      await files.return();
      return first.value ? path.dirname(first.value) : Instance.directory;
    };
  };
  
  export const TypeScript: Info = {
    id: "typescript",
    // From OpenCode: detect via lockfiles
    root: NearestRoot([
      "package-lock.json", "bun.lockb", "bun.lock", 
      "pnpm-lock.yaml", "yarn.lock"
    ], ["deno.json", "deno.jsonc"]),
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    async spawn(root) {
      // Use typescript-language-server
      const proc = spawn(bun.which(), [
        "x", "typescript-language-server", "--stdio"
      ], { cwd: root });
      return { process: proc };
    },
  };
  
  export const Pyright: Info = {
    id: "pyright",
    root: NearestRoot([
      "pyproject.toml", "setup.py", "requirements.txt", "Pipfile"
    ]),
    extensions: [".py", ".pyi"],
    async spawn(root) {
      // Auto-install if missing (see Phase 4)
    },
  };
  
  // ... 40+ languages from OpenCode
}
```

---

## Phase 4: Auto-Installation System

### Goal: Seamlessly install missing tools like OpenCode

OpenCode Reference: [`packages/opencode/src/lsp/server.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/lsp/server.ts) (see ESLint, gopls, clangd implementations)

```typescript
// NEW: src/installer/index.ts
export namespace ToolInstaller {
  export interface InstallStrategy {
    check(): Promise<boolean>;
    install(): Promise<boolean>;
  }
  
  // Strategy: npm/bun packages
  export const npmPackage = (name: string): InstallStrategy => ({
    async check() {
      return which(name) !== null || await resolveModule(name);
    },
    async install() {
      // From OpenCode: bun install in global bin dir
      await Process.spawn([
        Bun.which(), "install", name
      ], { cwd: Global.Path.bin }).exited;
      return true;
    },
  });
  
  // Strategy: GitHub releases (like OpenCode's clangd, zls)
  export const githubRelease = (repo: string, assetMatcher: RegExp): InstallStrategy => ({
    async check() {
      return which(binaryName) !== null;
    },
    async install() {
      const release = await fetch(`https://api.github.com/repos/${repo}/releases/latest`).then(r => r.json());
      const asset = release.assets.find(a => assetMatcher.test(a.name));
      // Download, extract, chmod, symlink
      return true;
    },
  });
  
  // Strategy: Go install (like OpenCode's gopls)
  export const goInstall = (pkg: string): InstallStrategy => ({
    async check() { return which(binaryName) !== null; },
    async install() {
      await Process.spawn([
        "go", "install", pkg
      ], { env: { GOBIN: Global.Path.bin } }).exited;
      return true;
    },
  });
  
  // Strategy: Custom build (like OpenCode's ESLint)
  export const customBuild = (steps: BuildStep[]): InstallStrategy => ({
    async install() {
      // Download source, npm install, compile
      // From OpenCode ESLint: download VS Code eslint, npm run compile
    },
  });
}

// Runner integration
export async function ensureTool(
  runnerId: string,
  strategies: InstallStrategy[]
): Promise<boolean> {
  for (const strategy of strategies) {
    if (await strategy.check()) return true;
    if (await strategy.install()) return true;
  }
  return false;
}
```

### Runner Integration

```typescript
// UPDATE: src/dispatch/runners/pyright.ts
const pyrightRunner: RunnerDefinition = {
  id: "pyright",
  appliesTo: ["python"],
  
  async run(ctx: DispatchContext): Promise<RunnerResult> {
    // Auto-install if missing
    const available = await ensureTool("pyright", [
      ToolInstaller.npmPackage("pyright"),
    ]);
    
    if (!available) {
      return { 
        status: "skipped", 
        diagnostics: [], 
        semantic: "none",
        rawOutput: "pyright not available and auto-install failed"
      };
    }
    
    // ... run pyright
  },
};
```

---

## Phase 5: File Watching

### Goal: Proactive diagnostics via file watching (like OpenCode)

OpenCode Reference: [`packages/opencode/src/file/watcher.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/file/watcher.ts)

```typescript
// NEW: src/file/watcher.ts
export namespace FileWatcher {
  const log = Log.create({ service: "file.watcher" });
  
  // From OpenCode: @parcel/watcher with native bindings
  const watcher = lazy((): typeof import("@parcel/watcher") | undefined => {
    try {
      const binding = require(`@parcel/watcher-${process.platform}-${process.arch}`);
      return createWrapper(binding);
    } catch (error) {
      log.error("failed to load watcher binding", { error });
      return undefined;
    }
  });
  
  export async function init(dir: string) {
    const w = watcher();
    if (!w) return;
    
    // From OpenCode: backend-specific (fs-events, inotify, windows)
    const backend = process.platform === "win32" ? "windows" 
      : process.platform === "darwin" ? "fs-events" 
      : "inotify";
    
    const subscription = await w.subscribe(dir, (err, events) => {
      if (err) return;
      for (const evt of events) {
        if (evt.type === "create") {
          Bus.publish(Event.FileCreated.create({ filePath: evt.path }));
        } else if (evt.type === "update") {
          Bus.publish(Event.FileModified.create({ filePath: evt.path }));
        } else if (evt.type === "delete") {
          Bus.publish(Event.FileDeleted.create({ filePath: evt.path }));
        }
      }
    }, {
      ignore: [...FileIgnore.PATTERNS, ...protectedPaths],
      backend,
    });
    
    return subscription;
  }
}
```

### Integration

```typescript
// index.ts
pi.on("session_start", async (_event, ctx) => {
  // Start file watcher
  const watcher = await FileWatcher.init(ctx.cwd ?? process.cwd());
  
  // Subscribe to file changes for proactive linting
  Bus.subscribe(Event.FileModified.type, async (event) => {
    // Trigger lightweight lint on background file change
    if (!isInActiveEdit(event.properties.filePath)) {
      await runBackgroundLint(event.properties.filePath);
    }
  });
});
```

---

## Phase 6: Configuration Schema

### Goal: User-configurable LSP servers like OpenCode

OpenCode Reference: [`packages/opencode/src/config/config.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/config/config.ts)

```typescript
// NEW: src/config/schema.ts
export const ConfigSchema = z.object({
  // From OpenCode: LSP configuration
  lsp: z.union([
    z.literal(false), // Disable all LSPs
    z.record(z.string(), z.union([
      z.object({ disabled: z.literal(true) }),
      z.object({
        command: z.array(z.string()),
        extensions: z.array(z.string()).optional(),
        disabled: z.boolean().optional(),
        env: z.record(z.string(), z.string()).optional(),
        initialization: z.record(z.string(), z.any()).optional(),
      }),
    ]))
  ]).optional(),
  
  // Runner configuration
  runners: z.record(z.string(), z.object({
    enabled: z.boolean().default(true),
    priority: z.number().optional(),
    semantic: z.enum(["blocking", "warning", "fixed", "silent"]).optional(),
    options: z.record(z.string(), z.any()).optional(),
  })).optional(),
  
  // From OpenCode: file watcher config
  watcher: z.object({
    ignore: z.array(z.string()).optional(),
    debounceMs: z.number().default(150),
  }).optional(),
  
  // Auto-install settings
  autoInstall: z.object({
    enabled: z.boolean().default(true),
    globalBinDir: z.string().optional(),
  }).optional(),
});

// Load from .pi-lens/config.json or pi.config.json
export async function loadConfig(cwd: string): Promise<Config> {
  const configPaths = [
    path.join(cwd, ".pi-lens", "config.json"),
    path.join(cwd, ".pi-lens.json"),
    path.join(cwd, "pi.config.json"),
  ];
  
  for (const configPath of configPaths) {
    if (await Filesystem.exists(configPath)) {
      return ConfigSchema.parse(await Filesystem.readJson(configPath));
    }
  }
  
  return ConfigSchema.parse({});
}
```

---

## Phase 7: Enhanced Runner Architecture

### Goal: Concurrent execution, better error handling, caching

```typescript
// UPDATE: src/dispatch/dispatcher.ts
export async function dispatchForFile(
  ctx: DispatchContext,
  groups: RunnerGroup[]
): Promise<DispatchResult> {
  const allDiagnostics: Diagnostic[] = [];
  
  for (const group of groups) {
    const runnerDefs = group.runnerIds
      .map(id => getRunner(id))
      .filter((r): r is RunnerDefinition => r !== undefined)
      .filter(r => r.when ? r.when(ctx) : true);
    
    if (group.mode === "all") {
      // NEW: Concurrent execution with Effect
      const results = await Effect.runPromise(
        Effect.all(
          runnerDefs.map(runner => 
            Effect.tryPromise({
              try: () => runRunner(ctx, runner, group.semantic ?? "warning"),
              catch: (error) => ({ status: "failed" as const, error }),
            }).pipe(
              Effect.timeout(30000), // Per-runner timeout
              Effect.catchAllCause(() => Effect.succeed({ 
                status: "failed", 
                diagnostics: [],
                semantic: "none"
              }))
            )
          ),
          { concurrency: "unbounded" } // Run all in parallel
        )
      );
      
      for (const result of results) {
        if (result.status === "failed") continue;
        allDiagnostics.push(...result.diagnostics);
      }
      
    } else if (group.mode === "fallback") {
      // Sequential until first success
      for (const runner of runnerDefs) {
        const result = await runRunner(ctx, runner, group.semantic ?? "warning");
        if (result.diagnostics.length === 0 || result.semantic === "fixed") {
          allDiagnostics.push(...result.diagnostics);
          break;
        }
      }
    }
  }
  
  return {
    diagnostics: allDiagnostics,
    // ...
  };
}
```

---

## Phase 8: TUI Sidebar Integration

### Goal: Real-time status display like OpenCode's LSP sidebar

OpenCode Reference: [`packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/lsp.tsx`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/lsp.tsx)

```typescript
// NEW: src/tui/sidebar.ts
export function createLensSidebar(api: TuiPluginApi) {
  const [runners, setRunners] = createSignal<RunnerStatus[]>([]);
  
  // Subscribe to runner status updates
  Bus.subscribe(Event.RunnerCompleted.type, (event) => {
    setRunners(prev => [...prev, {
      id: event.properties.runnerId,
      status: "completed",
      duration: event.properties.durationMs,
    }]);
  });
  
  return () => (
    <box>
      <text><b>LSP / Lint</b></text>
      <For each={runners()}>
        {(runner) => (
          <box flexDirection="row" gap={1}>
            <text style={{
              fg: runner.status === "completed" ? theme().success 
                : runner.status === "error" ? theme().error 
                : theme().textMuted
            }}>
              •
            </text>
            <text fg={theme().textMuted}>
              {runner.id} {runner.duration ? `(${runner.duration}ms)` : ""}
            </text>
          </box>
        )}
      </For>
    </box>
  );
}
```

---

## Implementation Roadmap

### Sprint 1: Foundation
1. **Bus/Event System** (2 days)
   - Create `src/bus/` with pub/sub
   - Define diagnostic event types
   - Migrate `tool_result` handler to use events

2. **Effect-TS Setup** (3 days)
   - Add effect dependency
   - Create service layer structure
   - Migrate one client (Biome) to Effect pattern

### Sprint 2: LSP Architecture
3. **LSP Client** (5 days)
   - Port OpenCode's `LSPClient` to pi-lens
   - Implement `LSPServer` registry
   - Add TypeScript and Python LSP support

4. **Auto-Installation** (3 days)
   - Create `ToolInstaller` namespace
   - Implement npm/go/github strategies
   - Add pyright auto-install

### Sprint 3: Enhancement
5. **File Watcher** (2 days)
   - Integrate @parcel/watcher
   - Connect to bus events
   - Background lint on file changes

6. **Configuration** (2 days)
   - Create config schema
   - Add `.pi-lens/config.json` support
   - User-defined LSP servers

### Sprint 4: Polish
7. **Concurrent Runners** (2 days)
   - Effect.all for parallel execution
   - Per-runner timeouts
   - Improved error handling

8. **TUI Sidebar** (2 days)
   - Real-time runner status
   - LSP connection status
   - Diagnostic counts

---

## Code References

### OpenCode (to study)

| Feature | File | Lines |
|---------|------|-------|
| LSP Client | `packages/opencode/src/lsp/client.ts` | 1-250 |
| LSP Service | `packages/opencode/src/lsp/index.ts` | 1-500 |
| LSP Servers | `packages/opencode/src/lsp/server.ts` | 1-2000 |
| Bus System | `packages/opencode/src/bus/` | - |
| File Watcher | `packages/opencode/src/file/watcher.ts` | 1-200 |
| Config Schema | `packages/opencode/src/config/config.ts` | 1-300 |
| Ripgrep | `packages/opencode/src/file/ripgrep.ts` | 1-300 |
| Formatter | `packages/opencode/src/format/formatter.ts` | 1-400 |
| LSP Sidebar | `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/lsp.tsx` | 1-80 |

### pi-lens (to refactor)

| File | Current Lines | Target |
|------|--------------|--------|
| `index.ts` | ~1000 | ~300 (delegated to services) |
| `clients/dispatch/dispatcher.ts` | ~400 | ~300 (add Effect) |
| `clients/dispatch/runners/*.ts` | ~50 each | ~60 each (add auto-install) |

---

## Expected Outcomes

1. **Better Performance**: Concurrent runner execution, debounced diagnostics
2. **Better UX**: Real-time status in sidebar, auto-installed tools
3. **Better Maintainability**: Decoupled services, Effect error handling
4. **Better Language Support**: 40+ languages via LSP
5. **Better Monorepo Support**: `NearestRoot()` detection per language

---

## Migration Strategy

1. **Backward Compatibility**: Keep existing runner API, add Effect wrapper
2. **Gradual Migration**: Move one runner at a time to new architecture
3. **Feature Flags**: `lens-experimental-lsp`, `lens-experimental-bus`
4. **Testing**: Maintain existing tests, add Effect tests incrementally

---

*This plan draws heavily from OpenCode's proven architecture while respecting pi-lens's existing strengths (delta mode, output semantics, declarative dispatch).*
