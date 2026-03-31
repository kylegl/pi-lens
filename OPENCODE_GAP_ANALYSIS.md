# OpenCode vs pi-lens Gap Analysis

## 1. LSP Support Comparison

### OpenCode LSP Servers (35+ languages)
| Category | Languages |
|----------|-----------|
| **JavaScript/TypeScript** | typescript, deno, eslint, oxlint |
| **Python** | pyright |
| **Go** | gopls |
| **Rust** | rust-analyzer |
| **C/C++** | clangd |
| **Java** | jdtls |
| **C# / F#** | csharp, fsharp |
| **Ruby** | ruby-lsp (with rubocop) |
| **PHP** | php intelephense |
| **Swift** | sourcekit-lsp |
| **Kotlin** | kotlin-ls |
| **Lua** | lua-ls |
| **Haskell** | hls |
| **Clojure** | clojure-lsp |
| **Elixir** | elixir-ls |
| **Julia** | julials |
| **OCaml** | ocaml-lsp |
| **Dart** | dart |
| **Zig** | zls |
| **Gleam** | gleam |
| **Nix** | nixd |
| **Astro** | astro |
| **Svelte** | svelte |
| **Vue** | vue |
| **Prisma** | prisma |
| **Terraform** | terraform |
| **Typst** | tinymist |
| **YAML** | yaml-ls |
| **Bash** | bash |
| **R** | air |

### pi-lens LSP Support
| Language | LSP | Status |
|----------|-----|--------|
| TypeScript | typescript-language-server | ✅ |
| Python | pyright | ✅ |
| Go | gopls | ❌ (has go-vet) |
| Rust | rust-analyzer | ❌ (has clippy) |
| Ruby | ruby-lsp | ❌ |
| PHP | intelephense | ❌ |
| C/C++ | clangd | ❌ |
| Java | jdtls | ❌ |
| Kotlin | kotlin-lsp | ❌ |
| Swift | sourcekit-lsp | ❌ |
| Dart | dart | ❌ |
| Elixir | elixir-ls | ❌ |
| C# | csharp-ls | ❌ |
| Vue | vue-language-server | ❌ |
| Svelte | svelte-language-server | ❌ |
| Astro | astro-language-server | ❌ |
| Prisma | prisma LSP | ❌ |
| Terraform | terraform-ls | ❌ |
| Lua | lua-ls | ❌ |
| Zig | zls | ❌ |
| OCaml | ocaml-lsp | ❌ |
| Nix | nil/nixd | ❌ |
| YAML | yaml-language-server | ⚠️ (interactive only) |
| JSON | json-language-server | ❌ |
| Bash | bash-language-server | ❌ (has shellcheck) |
| CSS | css-language-server | ❌ |

### LSP Gaps Identified

**HIGH PRIORITY (Common languages in web dev):**
1. **Vue** - Very common frontend framework
2. **Svelte** - Growing frontend framework
3. **Astro** - Modern static site builder
4. **CSS** - css-language-server for CSS IntelliSense
5. **Prisma** - Database schema files
6. **YAML** - Full LSP support (currently interactive-only)

**MEDIUM PRIORITY (Backend/mobile languages):**
7. **Go** - gopls (better than go-vet)
8. **Rust** - rust-analyzer (better than just clippy)
9. **C#** - omnisharp/csharp-ls
10. **Java** - jdtls
11. **Kotlin** - kotlin-lsp
12. **Swift** - sourcekit-lsp
13. **PHP** - intelephense

**LOW PRIORITY (Niche languages):**
14. **Lua** - lua-ls
15. **Zig** - zls
16. **Elixir** - elixir-ls
17. **OCaml** - ocaml-lsp
18. **Nix** - nixd
19. **Terraform** - terraform-ls
20. **Dart** - dart (Flutter)

## 2. Auto-Format Comparison

### OpenCode Formatters (28 formatters)
1. **air** (R)
2. **biome** (JS/TS/CSS/HTML/JSON/YAML/MD)
3. **cargofmt** (Rust - same as cargo fmt)
4. **clang-format** (C/C++)
5. **cljfmt** (Clojure)
6. **dart** (Dart)
7. **dfmt** (D)
8. **gleam** (Gleam)
9. **gofmt** (Go)
10. **htmlbeautifier** (ERB)
11. **ktlint** (Kotlin)
12. **mix** (Elixir)
13. **nixfmt** (Nix)
14. **ocamlformat** (OCaml)
15. **ormolu** (Haskell)
16. **oxfmt** (JS/TS - experimental)
17. **pint** (PHP - Laravel)
18. **prettier** (JS/TS/CSS/HTML/JSON/YAML/MD)
19. **rubocop** (Ruby)
20. **ruff** (Python)
21. **rustfmt** (Rust)
22. **shfmt** (Shell)
23. **standardrb** (Ruby alt)
24. **terraform** (Terraform)
25. **uv** (Python alt)
26. **zig** (Zig)

### pi-lens Formatters (15 formatters)
1. **biome** (JS/TS/CSS/HTML/JSON)
2. **prettier** (JS/TS/CSS/HTML/JSON/YAML/MD)
3. **ruff** (Python)
4. **black** (Python)
5. **gofmt** (Go)
6. **rustfmt** (Rust)
7. **zig fmt** (Zig)
8. **dart format** (Dart)
9. **shfmt** (Shell)
10. **nixfmt** (Nix)
11. **mix format** (Elixir)
12. **ocamlformat** (OCaml)
13. **clang-format** (C/C++)
14. **ktlint** (Kotlin)
15. **terraform fmt** (Terraform)

### Formatter Gaps

**Missing from pi-lens:**
1. **dfmt** (D language) - Very niche
2. **gleam format** (Gleam) - Niche
3. **ormolu** (Haskell) - Niche
4. **htmlbeautifier** (ERB/Rails) - Ruby ecosystem
5. **rubocop** (Ruby) - Has linting, not just formatting
6. **standardrb** (Ruby alt) - Same as above
7. **pint** (PHP/Laravel) - PHP ecosystem
8. **air** (R) - Data science niche
9. **uv** (Python) - Already have ruff/black
10. **oxfmt** (JS/TS) - Experimental, already have biome/prettier

**Verdict:** pi-lens formatters are comprehensive for mainstream languages. Missing niche formatters don't matter much.

## 3. Auto-Fix Comparison

### OpenCode
- Auto-fix via LSP code actions
- Format-on-save (automatic)
- Biome's autofix for JS/TS
- Ruff's autofix for Python
- Integrated into write operations

### pi-lens
- ✅ Biome autofix for JS/TS
- ✅ Ruff autofix for Python
- ✅ Auto-format on write (default enabled)
- ⚠️ LSP code actions not exposed (we have diagnostics but not code actions)

### Auto-Fix Gaps

**Minor gap:**
- pi-lens doesn't expose LSP code actions (quick fixes) to the user
- Could add code action support for quick fixes like "add import", "fix typo", etc.
- Not critical - AI can handle these via edit tool

## 4. Unique OpenCode Features (Not in pi-lens)

### Commands:
1. **`/rmslop`** - Remove AI slop from diffs
   - Detects: extra comments, defensive checks, `any` casts, inconsistent style
   - Already documented in featurestoadd.md
   
2. **`/learn`** - Extract learnings to AGENTS.md
   - Analyzes session for non-obvious discoveries
   - Writes to appropriate AGENTS.md files
   - Could add to pi-lens as `/lens-learn`

3. **`/spellcheck`** - Spellcheck markdown changes
   - pi-lens has spellcheck runner, but not as a command
   - Could add `/lens-spellcheck` command

4. **`/commit`** - AI-generated commit messages
   - pi doesn't have this, out of scope for pi-lens

5. **`/changelog`** - Generate changelog entries
   - Out of scope

6. **`/issues`** - GitHub issue management
   - Out of scope

7. **`/ai-deps`** - Check AI SDK dependency updates
   - Very specific use case

### Agents/Subagents:
1. **build agent** - Default dev agent
2. **plan agent** - Read-only exploration agent
3. **general subagent** - For complex searches

### TUI Features:
1. Built-in TUI (Terminal User Interface)
2. Multiple panels/panes
3. Real-time streaming

## 5. pi-lens Features Not in OpenCode

### Code Review:
1. **`/lens-booboo`** - Comprehensive code review
   - Design smells
   - Complexity metrics
   - Dead code detection
   - Duplicate detection
   - Type coverage
   - Knip analysis
   - jscpd analysis
   - Madge circular deps
   - Architect rules
   - 
2. **Similarity detection** - Tree-sitter based function similarity
3. **Project indexing** - For large codebase navigation
4. **Semantic slop detection** - ts-slop-rules, python-slop
5. **Config validation** - Detects config/env typos
6. **Delta mode** - Shows only new issues (baseline tracking)

### Unique Runners:
1. **ast-grep-napi** - Fast structural analysis
2. **Similarity runner** - Function deduplication
3. **Type-safety runner** - Runtime type checks
4. **Architect runner** - Architectural rule validation
5. **Spellcheck** - Markdown spellcheck

## 6. /lens-booboo Enhancement Ideas from OpenCode

OpenCode doesn't have a direct equivalent to `/lens-booboo` (comprehensive code review). This is a differentiator.

But we could enhance `/lens-booboo` with features inspired by OpenCode:

### Potential Additions:

1. **AI-Powered Analysis Layer**
   - After all runners complete, send aggregated results to AI
   - AI provides higher-level insights:
     - "These 3 similar functions could be consolidated"
     - "This complexity spike correlates with recent changes"
     - "Consider extracting this pattern into a utility"

2. **Slop Score**
   - Quantify "AI slop" in codebase
   - Track slop score over time
   - Alert when slop increases significantly

3. **Trend Analysis**
   - Compare with previous booboo reports
   - Show trending issues (increasing/decreasing)
   - Track technical debt velocity

4. **Actionable Summary**
   - OpenCode style: 1-3 sentence summary
   - Prioritized action items
   - Quick wins vs deep refactoring

5. **Integration with `/rmslop`**
   - Detect slop in booboo report
   - Offer to auto-remove it

## 7. Summary of Gaps

### HIGH PRIORITY (Add Soon):
1. **LSP: Vue** - Very common, high user demand
2. **LSP: Svelte** - Growing framework
3. **LSP: CSS** - CSS IntelliSense needed
4. **LSP: Prisma** - Common in modern stacks
5. **Command: /lens-rmslop** - Remove AI slop (already in roadmap)
6. **Command: /lens-learn** - Extract learnings to AGENTS.md

### MEDIUM PRIORITY (Add When Time Permits):
7. **LSP: Go** - gopls (better than go-vet)
8. **LSP: Rust** - rust-analyzer (better than clippy alone)
9. **LSP: YAML** - Full LSP (currently interactive only)
10. **LSP: C#** - For .NET projects
11. **LSP: Java** - For JVM projects
12. **Command: /lens-spellcheck** - Explicit spellcheck command
13. **Linter: stylelint** - CSS/SCSS linting
14. **Linter: hadolint** - Dockerfile linting

### LOW PRIORITY (Niche):
15. **LSP: Astro** - Static site builder
16. **LSP: Swift** - iOS dev
17. **LSP: Kotlin** - Android/JVM
18. **LSP: PHP** - Legacy web
19. **Linter: markdownlint** - Documentation standards
20. **Linter: ESLint LSP** - For ESLint-dependent legacy projects

### NO ACTION NEEDED (Already Good):
- ✅ Formatters comprehensive
- ✅ Mainstream linters (Biome, Ruff, Clippy) excellent
- ✅ Type checkers (TS LSP, Pyright) solid
- ✅ Tree-sitter structural analysis unique advantage
- ✅ Delta mode unique advantage
