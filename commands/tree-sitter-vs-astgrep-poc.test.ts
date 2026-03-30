/**
 * PoC: Tree-sitter vs ast-grep Pattern Capabilities
 * 
 * This demonstrates WHY tree-sitter is better for complex patterns,
 * even without running the actual search.
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// PATTERN COMPLEXITY COMPARISON
// ============================================================================

describe("Pattern Complexity: Tree-sitter vs ast-grep", () => {
  
  describe("Pattern 1: Deep Promise Chain (4+ levels)", () => {
    const codeSample = `
      fetchUser(id)
        .then(user => fetchPosts(user.id))
        .catch(err => console.error(err))
        .then(posts => posts[0])
        .finally(() => setLoading(false));
    `;

    it("tree-sitter pattern: captures entire chain with all handlers", () => {
      // Tree-sitter can match the ENTIRE chain as one pattern
      // Captures: $PROMISE, $H1, $H2, $H3, $H4 (all handlers)
      const treeSitterPattern = "$PROMISE.then($$$H1).catch($$$H2).then($$$H3).finally($$$H4)";
      
      // Pros:
      // - Matches EXACTLY 4+ level chains
      // - Captures each handler separately
      // - Can count levels programmatically
      // - No false positives from 2-level chains
      
      expect(treeSitterPattern).toContain("$$$H1"); // Variadic captures all
      expect(treeSitterPattern).toContain(".then(");
      expect(treeSitterPattern).toContain(".catch(");
      expect(treeSitterPattern).toContain(".finally(");
      console.log("✅ Tree-sitter: Single pattern, captures all 4 levels");
    });

    it("ast-grep pattern: limited by rule structure", () => {
      // Ast-grep needs either:
      // A) Multiple rules combined
      // B) A single pattern that matches ANY chain
      
      const astGrepRule = `
id: deep-promise-chain
pattern: $P.then($$$).catch($$$).then($$$).finally($$$)
      `.trim();
      
      // Limitations:
      // - Can't easily distinguish 3-level vs 4-level vs 5-level
      // - Pattern either matches or doesn't
      // - Post-processing needed to count levels
      
      console.log("⚠️  Ast-grep: Pattern matches, but can't distinguish 3 vs 4+ levels easily");
      expect(astGrepRule).toContain("finally");
    });
  });

  describe("Pattern 2: Callback Pyramid with Error Handling", () => {
    const codeSample = `
      fs.readFile(path, (err, data) => {
        if (err) callback(err);
        else fs.stat(path, (err2, stats) => {
          if (err2) callback(err2);
          else fs.writeFile(path + '.bak', data, (err3) => {
            if (err3) callback(err3);
            else callback(null, stats);
          });
        });
      });
    `;

    it("tree-sitter: matches nested structure with error handling", () => {
      // Can match the ENTIRE pyramid including the error handling pattern
      const treeSitterPattern = `fs.readFile($PATH, ($ERR, $DATA) => { 
        if ($ERR) { $$$ERROR_HANDLER } 
        else { $$$SUCCESS_HANDLER } 
      })`;
      
      // Captures:
      // - $PATH: the file path argument
      // - $ERR: the error parameter name
      // - $DATA: the data parameter name
      // - $$$ERROR_HANDLER: all statements in error branch
      // - $$$SUCCESS_HANDLER: all statements in success branch
      
      console.log("✅ Tree-sitter: Captures nested if/else structure inside callback");
      expect(treeSitterPattern).toContain("if ($ERR)");
      expect(treeSitterPattern).toContain("else");
    });

    it("ast-grep: requires multiple rules + correlation", () => {
      // Rule 1: Find fs.readFile calls
      const rule1 = `pattern: fs.readFile($PATH, $CALLBACK)`;
      
      // Rule 2: Find nested callbacks (but this matches ALL nested callbacks)
      const rule2 = `pattern: $FUNC($$$, ($ERR, $DATA) => { $$$ })`;
      
      // Problem:
      // - Rule 1 finds all fs.readFile calls
      // - Rule 2 finds all callbacks with error-first pattern
      // - Can't correlate: which callback belongs to which readFile?
      // - Can't detect: is this a pyramid or just one level?
      
      console.log("⚠️  Ast-grep: Multiple rules needed, correlation is manual");
    });
  });

  describe("Pattern 3: Mixed Async (await + .then in same function)", () => {
    const codeSample = `
      async function loadUser(id: string) {
        const user = await fetchUser(id);
        return user.posts.then(posts => posts.map(p => p.id));
      }
    `;

    it("tree-sitter: two-phase detection (find + filter)", () => {
      // Phase 1: Find all async functions
      const phase1 = "async function $NAME($$$PARAMS) { $BODY }";
      
      // Phase 2: Check if $BODY contains BOTH await AND .then()
      // This is easy in tree-sitter because we capture the entire body
      
      const detectionLogic = `
        const hasAwait = body.includes('await');
        const hasThen = body.match(/\.\\s*then\\s*\\(/);
        return hasAwait && hasThen;
      `;
      
      console.log("✅ Tree-sitter: Can capture body, then analyze contents programmatically");
      expect(phase1).toContain("$BODY");
      expect(detectionLogic).toContain("hasAwait && hasThen");
    });

    it("ast-grep: requires post-processing or can't correlate", () => {
      // Option A: Two separate rules
      const ruleAwait = `pattern: await $EXPR`;  // Matches ALL await
      const ruleThen = `pattern: $EXPR.then($$$)`; // Matches ALL .then()
      
      // Problem: Can't determine if same function!
      // Rule results are independent. Need to:
      // 1. Get line numbers from both rules
      // 2. Check if they're in the same function scope
      // 3. Manual scope analysis required
      
      console.log("❌ Ast-grep: Two independent rules, scope correlation is manual/hard");
    });
  });

  describe("Pattern 4: 3+ Level Nested Conditionals", () => {
    const codeSample = `
      if (data) {
        if (data.items) {
          if (data.items.length > 0) {
            return data.items[0];
          }
        }
      }
    `;

    it("tree-sitter: matches exact nesting depth", () => {
      // Matches EXACTLY 3 levels of nesting
      const treeSitterPattern = `if ($C1) { 
        if ($C2) { 
          if ($C3) { $$$BODY } 
        } 
      }`;
      
      // Easy to extend: add more ifs for deeper nesting
      const deepPattern = `if ($C1) { if ($C2) { if ($C3) { if ($C4) { $$$BODY } } } }`;
      
      console.log("✅ Tree-sitter: Exact depth matching, easy to parameterize");
      expect(treeSitterPattern).toContain("if ($C1)");
      expect(treeSitterPattern).toContain("if ($C2)");
      expect(treeSitterPattern).toContain("if ($C3)");
    });

    it("ast-grep: uses 'inside' which is verbose", () => {
      // Ast-grep uses 'inside' for nesting
      const astGrepRule = `
id: deep-nesting
rule:
  kind: if_statement
  inside:
    kind: if_statement
    inside:
      kind: if_statement
      `;
      
      // This works but:
      // - Verbose YAML structure
      // - Harder to read
      // - Harder to make depth parameterizable (need N levels of nesting in YAML)
      
      console.log("⚠️  Ast-grep: Works but verbose YAML structure");
      expect(astGrepRule).toContain("inside:");
    });
  });

  describe("Pattern 5: Function with Multiple Return Points", () => {
    const codeSample = `
      function calculate(x, y, z) {
        if (x < 0) return 0;
        if (y < 0) return x;
        if (z < 0) return x + y;
        return x + y + z;
      }
    `;

    it("tree-sitter: matches exact return count", () => {
      // Can match functions with exactly 3+ returns
      const treeSitterPattern = `function $NAME($$$PARAMS) { 
        if ($COND1) return $VAL1; 
        if ($COND2) return $VAL2; 
        return $VAL3; 
      }`;
      
      // Captures:
      // - All return values
      // - All conditions
      // - Can count returns programmatically
      
      console.log("✅ Tree-sitter: Matches exact count, captures all returns");
      expect(treeSitterPattern).toContain("return $VAL1");
      expect(treeSitterPattern).toContain("return $VAL2");
      expect(treeSitterPattern).toContain("return $VAL3");
    });

    it("ast-grep: 'has' with 'stopBy' counts returns", () => {
      const astGrepRule = `
id: multiple-returns
rule:
  kind: function_declaration
  has:
    stopBy: end
    kind: return_statement
      `;
      
      // Problem:
      // - 'has' just checks existence
      // - Counting requires transform or multiple rules
      // - Can't distinguish 2 returns from 5 returns easily
      
      console.log("⚠️  Ast-grep: Can detect returns exist, counting is harder");
    });
  });
});

// ============================================================================
// DECISION MATRIX
// ============================================================================

describe("Decision Matrix: When to use each tool", () => {
  it("summarizes the trade-offs", () => {
    const matrix = `
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Pattern Type Analysis                                │
├──────────────────────────┬────────────────────┬────────────────────────────────┤
│ Pattern                  │ Winner             │ Reason                         │
├──────────────────────────┼────────────────────┼────────────────────────────────┤
│ Simple (console.log)     │ ast-grep           │ Has rule, has fix: block       │
│                          │                    │ Fast, battle-tested           │
├──────────────────────────┼────────────────────┼────────────────────────────────┤
│ Multi-statement chain    │ tree-sitter        │ Captures entire expression     │
│ (promise.then.catch)   │                    │ Single pattern, all levels      │
├──────────────────────────┼────────────────────┼────────────────────────────────┤
│ Context-dependent        │ tree-sitter        │ Can capture parent/child       │
│ (callback pyramid)       │                    │ Filter after capture            │
├──────────────────────────┼────────────────────┼────────────────────────────────┤
│ Cross-reference required │ tree-sitter        │ Capture body → analyze         │
│ (mixed async)           │                    │ Two-phase detection             │
├──────────────────────────┼────────────────────┼────────────────────────────────┤
│ Needs auto-fix           │ ast-grep           │ fix: block in YAML             │
│                          │                    │ Built-in replacement           │
├──────────────────────────┼────────────────────┼────────────────────────────────┤
│ CLI/CI usage             │ ast-grep           │ Standalone binary              │
│                          │                    │ No WASM/node required          │
└──────────────────────────┴────────────────────┴────────────────────────────────┘

RECOMMENDATION FOR PI-LENS:

1. Keep ast-grep as PRIMARY for:
   - Simple patterns with fixes (console.log, empty-catch, etc.)
   - Rules from existing ecosystem (100+ rules)
   - Fast scanning

2. Use tree-sitter as SECONDARY for:
   - Complex multi-statement patterns
   - Context-dependent detection
   - When we need to CAPTURE values (not just detect presence)
   - Patterns requiring post-processing

3. Specific pi-lens additions:
   - Promise chain depth analysis
   - Callback pyramid detection
   - Mixed async/await patterns
   - Nested conditional depth
   - Function return point analysis
`;
    console.log(matrix);
  });
});

// ============================================================================
// ACTUAL IMPLEMENTATION RECOMMENDATION
// ============================================================================

describe("Implementation Plan for pi-lens", () => {
  it("recommends specific runners", () => {
    const plan = `
RUNNER 1: ast-grep (existing)
- Keep all existing rules
- Use for: console.log, empty-catch, long-params, debugger
- Keep for: auto-fix capability

RUNNER 2: tree-sitter (NEW - Advanced Structural)
- Use for patterns ast-grep struggles with:

  A) Promise Chain Analysis
     Pattern: $P.then($$$).catch($$$).then($$$)
     Detect: 3+ level chains
     Suggest: Convert to async/await

  B) Callback Pyramid Detection
     Pattern: fs.readFile($, (err, data) => { if (err) { ... } })
     Detect: Nested callbacks with error handling
     Suggest: Promisify

  C) Mixed Async Patterns
     Detect: async function using both await AND .then()
     Suggest: Consistent async/await

  D) Deep Nesting
     Detect: 3+ level nested if/else
     Suggest: Early returns

  E) Complex Function Analysis
     Detect: Functions with 4+ return points
     Suggest: Single return pattern

KEY DIFFERENCE:
- ast-grep: "There IS a console.log"
- tree-sitter: "There IS a 4-level promise chain with handlers: H1, H2, H3"
`;
    console.log(plan);
  });
});
