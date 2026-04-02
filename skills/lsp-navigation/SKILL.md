---
name: lsp-navigation
description: Navigate code with IDE features - definitions, references, types, call hierarchy. Use as PRIMARY for code intelligence.
---

# LSP Navigation

Use `lsp_navigation` as **PRIMARY** for code intelligence. Do NOT use grep/glob/ast-grep first.

**Requires:** `--lens-lsp` flag

## When to Use (Code Intelligence)

| Question | Operation | Parameters |
|----------|-----------|------------|
| "Where is this defined?" | `definition` | filePath, line, character |
| "Find all usages" | `references` | filePath, line, character |
| "What type is this?" | `hover` | filePath, line, character |
| "What symbols in this file?" | `documentSymbol` | filePath |
| "Find symbol across project" | `workspaceSymbol` | filePath, query |
| "Who implements this interface?" | `implementation` | filePath, line, character |
| "Who calls this function?" | `prepareCallHierarchy` → `incomingCalls` | filePath, line, character |
| "What does this function call?" | `prepareCallHierarchy` → `outgoingCalls` | filePath, line, character |

## Call Hierarchy Pattern

```typescript
// Step 1: Prepare (get the callable item)
const items = await lsp_navigation({
  operation: "prepareCallHierarchy",
  filePath: "src/api.ts",
  line: 42,
  character: 10
});

// Step 2: Get callers (who calls this function)
const callers = await lsp_navigation({
  operation: "incomingCalls",
  filePath: "src/api.ts",
  callHierarchyItem: items[0]
});

// Step 2: Get callees (what this function calls)
const callees = await lsp_navigation({
  operation: "outgoingCalls",
  filePath: "src/api.ts",
  callHierarchyItem: items[0]
});
```

## When NOT to Use LSP

| Task | Use Instead | Why |
|------|-------------|-----|
| Find patterns (console.log) | `ast_grep_search` | Pattern matching |
| Find text/TODOs | `grep` | Text search |
| Find files by name | `glob` | File discovery |
| Read file content | `read` | Direct access |

## Golden Rule

**Code intelligence → LSP first. Text/pattern search → grep/ast-grep.**
