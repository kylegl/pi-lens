# pi-lens

pi-lens focuses on real-time inline code feedback for AI agents.

`pi-lens` focuses on one job: **catch real issues while the agent edits code**, with low-noise inline feedback and deeper reports on demand.

## What It Does

On `write` and `edit`, pi-lens runs a fast pipeline:

- Secret scanning (blocking)
- Type/lint checks (language-aware, with fallbacks)
- AST/structural checks (tree-sitter + ast-grep)
- Safe autofix where supported
- Delta filtering (prefer new issues over legacy noise)

Inline output is intentionally concise and actionable.

- **Blocking issues**: shown inline and stop progress until fixed
- **Warnings**: summarized, with deeper detail in `/lens-booboo`
- **Health/telemetry**: available in `/lens-health`

## Install

```bash
pi install npm:pi-lens
```

Or from git:

```bash
pi install git:github.com/apmantza/pi-lens
```

## Run

```bash
# Standard mode
pi

# Enable full multi-language LSP mode
pi --lens-lsp
```

## Key Commands

- `/lens-booboo` — full quality report for current project state
- `/lens-health` — runtime health, latency, and diagnostic telemetry

## Notes

- Some tools are auto-installed; others are config/availability-based.
- Rule packs are customizable via project-level rule directories.
