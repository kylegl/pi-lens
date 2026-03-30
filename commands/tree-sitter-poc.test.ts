/**
 * PoC: Tree-sitter vs ast-grep for Complex Structural Patterns
 *
 * This test compares both approaches on patterns that are:
 * - EASY for tree-sitter (AST-based, captures full blocks)
 * - HARD for ast-grep (pattern-based, limited context)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TreeSitterClient, regexStructuralSearch } from "../clients/tree-sitter-client.js";
import { safeSpawn } from "../clients/safe-spawn.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test patterns that are COMPLEX (multi-statement, context-dependent)
const COMPLEX_PATTERNS = {
	// Pattern 1: Deep promise chains with error handling
	// Detects: fetch().then().catch().then().finally()
	promiseChain: {
		treeSitter: "$PROMISE.then($$$H1).catch($$$H2).then($$$H3).finally($$$H4)",
		astGrep: "pattern: $PROMISE.then($$$H1).catch($$$H2).then($$$H3).finally($$$H4)",
		description: "Deep promise chain (4+ levels)",
	},

	// Pattern 2: Callback pyramid with error handling
	// Detects: fs.readFile(path, (err, data) => { if (err) { cb(err) } else { ... } })
	callbackPyramid: {
		treeSitter: "fs.readFile($PATH, ($ERR, $DATA) => { if ($ERR) { $$$ERROR_HANDLER } else { $$$SUCCESS_HANDLER } })",
		astGrep: "kind: call_expression\npattern: fs.readFile($PATH, $$$CALLBACK)",
		description: "Callback pyramid with error handling",
	},

	// Pattern 3: Mixed async patterns
	// Detects: async function that uses both await AND .then()
	mixedAsync: {
		treeSitter: "async function $NAME($$$PARAMS) { $BODY }",
		// ast-grep needs 2 patterns + manual correlation
		astGrep: "Requires 2 separate rules + post-processing",
		description: "Mixed async/await + promise chains (same function)",
	},

	// Pattern 4: Complex nested conditionals
	// Detects: if (a) { if (b) { if (c) { ... } else { ... } } }
	deepNesting: {
		treeSitter: "if ($C1) { if ($C2) { if ($C3) { $$$BODY } else { $$$ELSE3 } } else { $$$ELSE2 } }",
		astGrep: "kind: if_statement\ninside:\n  kind: if_statement\n  inside:\n    kind: if_statement",
		description: "3+ level nested if/else",
	},

	// Pattern 5: Function with complex return logic
	// Detects: function with multiple return points including early returns + final return
	complexReturns: {
		treeSitter: "function $NAME($$$PARAMS) { if ($COND1) return $VAL1; if ($COND2) return $VAL2; return $VAL3; }",
		astGrep: "kind: function_declaration\nhas:\n  kind: return_statement\n  stopBy: end",
		description: "Function with 3+ return points (early + final)",
	},

	// Pattern 6: Try/catch with specific error handling pattern
	// Detects: try { await x() } catch (e) { if (e.code === 'ENOENT') ... else throw e }
	specificErrorHandling: {
		treeSitter: "try { $TRY_BLOCK } catch ($ERR) { if ($ERR.code === '$CODE') { $$$HANDLE } else { throw $ERR; } }",
		astGrep: "kind: catch_clause\nhas:\n  kind: if_statement\n  pattern: if ($ERR.code === $CODE)",
		description: "Specific error code handling with rethrow",
	},

	// Pattern 7: Class with anti-pattern
	// Detects: class with both constructor assignment AND method that does same assignment
	classAntiPattern: {
		treeSitter: "class $NAME { constructor($$$CPARAMS) { this.$PROP = $CVAL; } $METHOD($$$MPARAMS) { this.$PROP = $MVAL; } }",
		astGrep: "Requires multiple rules + cross-reference",
		description: "Property set in both constructor AND method",
	},

	// Pattern 8: React useEffect with cleanup
	// Detects: useEffect(() => { setup(); return () => cleanup(); }, [$DEP])
	reactEffectCleanup: {
		treeSitter: "useEffect(() => { $$$SETUP; return () => { $$$CLEANUP; }; }, [$$$DEPS])",
		astGrep: "pattern: useEffect($$$)",
		description: "useEffect with cleanup function",
	},
};

// Create test files with complex patterns
function createTestFiles(testDir: string) {
	const files: Record<string, string> = {
		// Pattern 1: Deep promise chain
		"promise-chain.ts": `
import { fetchUser, fetchPosts, fetchComments } from './api';

// BAD: Deep promise chain (4 levels)
function loadDataBad(userId: string) {
  return fetchUser(userId)
    .then(user => fetchPosts(user.id))
    .catch(err => ({ error: err, posts: [] }))
    .then(result => {
      if (result.error) return result;
      return fetchComments(result.posts[0].id);
    })
    .finally(() => console.log('Done'));
}

// GOOD: async/await
async function loadDataGood(userId: string) {
  try {
    const user = await fetchUser(userId);
    const posts = await fetchPosts(user.id);
    const comments = await fetchComments(posts[0].id);
    return comments;
  } catch (err) {
    return { error: err, posts: [] };
  } finally {
    console.log('Done');
  }
}
`,

		// Pattern 2: Callback pyramid
		"callback-pyramid.ts": `
import * as fs from 'fs';

// BAD: Callback pyramid (3 levels)
function processFileBad(path: string, callback: (err: any, result?: string) => void) {
  fs.readFile(path, 'utf8', (err, data) => {
    if (err) {
      callback(err);
    } else {
      fs.stat(path, (err2, stats) => {
        if (err2) {
          callback(err2);
        } else {
          fs.writeFile(path + '.bak', data, (err3) => {
            if (err3) {
              callback(err3);
            } else {
              callback(null, stats.size.toString());
            }
          });
        }
      });
    }
  });
}

// GOOD: Promisified
import { promisify } from 'util';
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const writeFile = promisify(fs.writeFile);

async function processFileGood(path: string) {
  const data = await readFile(path, 'utf8');
  const stats = await stat(path);
  await writeFile(path + '.bak', data);
  return stats.size.toString();
}
`,

		// Pattern 3: Mixed async
		"mixed-async.ts": `
import { fetchUser } from './api';

// BAD: Mixing async/await with .then()
async function loadUserBad(id: string) {
  const user = await fetchUser(id);
  return user.posts.then(posts => {
    return posts.map(p => p.id);
  });
}

// GOOD: Consistent async/await
async function loadUserGood(id: string) {
  const user = await fetchUser(id);
  const posts = await user.posts;
  return posts.map(p => p.id);
}
`,

		// Pattern 4: Deep nesting
		"deep-nesting.ts": `
// BAD: 3-level nested if
function processDataBad(data: any) {
  if (data) {
    if (data.items) {
      if (data.items.length > 0) {
        return data.items[0];
      } else {
        return null;
      }
    } else {
      return null;
    }
  } else {
    return null;
  }
}

// GOOD: Early returns
function processDataGood(data: any) {
  if (!data) return null;
  if (!data.items) return null;
  if (data.items.length === 0) return null;
  return data.items[0];
}
`,

		// Pattern 5: Complex returns
		"complex-returns.ts": `
// BAD: Multiple return points
function calculateBad(x: number, y: number, z: number) {
  if (x < 0) return 0;
  if (y < 0) return x;
  if (z < 0) return x + y;
  return x + y + z;
}

// GOOD: Single return with accumulator
function calculateGood(x: number, y: number, z: number) {
  let result = 0;
  if (x >= 0) result += x;
  if (y >= 0) result += y;
  if (z >= 0) result += z;
  return result;
}
`,

		// Pattern 6: Specific error handling
		"error-handling.ts": `
import * as fs from 'fs';
import { promisify } from 'util';
const readFile = promisify(fs.readFile);

// GOOD: Specific error handling with rethrow
async function readConfigGood(path: string) {
  try {
    const data = await readFile(path, 'utf8');
    return JSON.parse(data);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { default: true };
    }
    throw err; // Re-throw unknown errors
  }
}

// BAD: Swallowing all errors
async function readConfigBad(path: string) {
  try {
    const data = await readFile(path, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { error: true }; // Silently swallows!
  }
}
`,

		// Pattern 7: Class anti-pattern
		"class-antipattern.ts": `
// BAD: Property set in both constructor AND method
class ConfigBad {
  private timeout: number;
  
  constructor() {
    this.timeout = 5000;
  }
  
  loadFromEnv() {
    this.timeout = parseInt(process.env.TIMEOUT || '5000');
  }
}

// GOOD: Single source of truth
class ConfigGood {
  private timeout: number;
  
  constructor() {
    this.loadFromEnv();
  }
  
  private loadFromEnv() {
    this.timeout = parseInt(process.env.TIMEOUT || '5000');
  }
}
`,

		// Pattern 8: React useEffect
		"react-effect.tsx": `
import { useEffect, useState } from 'react';

// GOOD: useEffect with cleanup
function useWindowSizeGood() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  
  useEffect(() => {
    const handler = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    
    window.addEventListener('resize', handler);
    handler(); // Initial call
    
    return () => {
      window.removeEventListener('resize', handler);
    };
  }, []);
  
  return size;
}

// BAD: useEffect without cleanup (memory leak)
function useWindowSizeBad() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  
  useEffect(() => {
    const handler = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    
    window.addEventListener('resize', handler);
    // Missing cleanup!
  }, []);
  
  return size;
}
`,
	};

	// Write files
	for (const [name, content] of Object.entries(files)) {
		fs.writeFileSync(path.join(testDir, name), content);
	}

	return Object.keys(files);
}

describe("PoC: Tree-sitter vs ast-grep for Complex Patterns", () => {
	let testDir: string;
	let treeSitter: TreeSitterClient;
	let testFiles: string[];

	beforeAll(async () => {
		// Create temp test directory
		testDir = path.join(__dirname, "..", ".test-poc-complex-patterns");
		if (!fs.existsSync(testDir)) {
			fs.mkdirSync(testDir, { recursive: true });
		}
		testFiles = createTestFiles(testDir);

		// Init tree-sitter
		treeSitter = new TreeSitterClient();
		await treeSitter.init();
	}, 30000);

	afterAll(() => {
		// Cleanup
		try {
			fs.rmSync(testDir, { recursive: true });
		} catch {}
	});

	describe("Pattern 1: Deep Promise Chains (4+ levels)", () => {
		it("tree-sitter should detect deep promise chains", async () => {
			const matches = await treeSitter.structuralSearch(
				"$PROMISE.then($$$H1).catch($$$H2).then($$$H3).finally($$$H4)",
				"typescript",
				testDir
			);

			console.log("Tree-sitter matches:", matches.length);
			matches.forEach(m => {
				console.log(`  ${m.file}:${m.line} - ${m.matchedText.slice(0, 50)}...`);
			});

			expect(matches.length).toBeGreaterThan(0);
			// Should find the BAD example
			const badExample = matches.find(m => m.matchedText.includes("fetchUser"));
			expect(badExample).toBeDefined();
		});

		it("ast-grep equivalent (if it works)", async () => {
			// Write ast-grep rule
			const ruleDir = path.join(testDir, ".sg-rules");
			fs.mkdirSync(ruleDir, { recursive: true });
			
			const rule = `
id: deep-promise-chain
language: TypeScript
message: "Deep promise chain detected"
rule:
  pattern: $P.then($$$).catch($$$).then($$$).finally($$$)
`;
			fs.writeFileSync(path.join(ruleDir, "deep-promise.yml"), rule);

			// Run ast-grep
			const result = safeSpawn("npx", [
				"sg", "scan",
				"--rules", ruleDir,
				"--json",
				testDir
			], { timeout: 30000 });

			console.log("ast-grep exit code:", result.status);
			console.log("ast-grep stdout:", result.stdout?.slice(0, 500));
			console.log("ast-grep stderr:", result.stderr?.slice(0, 500));

			// Ast-grep may struggle with variadic chains
			const found = result.stdout && result.stdout.includes("deep-promise-chain");
			console.log("ast-grep detected pattern:", found);
		});
	});

	describe("Pattern 2: Callback Pyramid", () => {
		it("tree-sitter should detect callback pyramids", async () => {
			const matches = await treeSitter.structuralSearch(
				"fs.readFile($PATH, ($ERR, $DATA) => { $$$BODY })",
				"typescript",
				testDir
			);

			console.log("Tree-sitter callback matches:", matches.length);
			
			// Filter for nested callbacks
			const nested = matches.filter(m => {
				const body = m.captures.BODY || "";
				return body.includes("fs.") && body.includes("=>");
			});

			console.log("Nested callbacks:", nested.length);
			nested.forEach(m => {
				console.log(`  ${m.file}:${m.line}`);
			});

			expect(nested.length).toBeGreaterThan(0);
		});
	});

	describe("Pattern 3: Mixed Async (await + .then)", () => {
		it("tree-sitter should detect mixed async patterns", async () => {
			// First find all async functions
			const asyncFns = await treeSitter.structuralSearch(
				"async function $NAME($$$PARAMS) { $BODY }",
				"typescript",
				testDir
			);

			console.log("Async functions found:", asyncFns.length);

			// Filter for those with both await and .then
			const mixed = asyncFns.filter(m => {
				const body = m.captures.BODY || "";
				const hasAwait = body.includes("await");
				const hasThen = body.match(/\.\s*then\s*\(/);
				return hasAwait && hasThen;
			});

			console.log("Mixed async/await + .then:", mixed.length);
			mixed.forEach(m => {
				console.log(`  ${m.file}:${m.line} - ${m.captures.NAME}`);
			});

			expect(mixed.length).toBeGreaterThan(0);
		});
	});

	describe("Pattern 4: Deep Nesting (3+ levels)", () => {
		it("tree-sitter should detect deeply nested conditionals", async () => {
			const matches = await treeSitter.structuralSearch(
				"if ($C1) { if ($C2) { if ($C3) { $$$BODY } } }",
				"typescript",
				testDir
			);

			console.log("Deep nesting matches:", matches.length);
			matches.forEach(m => {
				console.log(`  ${m.file}:${m.line}`);
			});

			expect(matches.length).toBeGreaterThan(0);
		});
	});

	describe("Value Capture Comparison", () => {
		it("tree-sitter captures actual values", async () => {
			const matches = await treeSitter.structuralSearch(
				"console.$METHOD($MSG)",
				"typescript",
				testDir
			);

			console.log("Console statements found:", matches.length);
			
			// Check we capture the method name and message
			const first = matches[0];
			if (first) {
				console.log("Captured METHOD:", first.captures.METHOD);
				console.log("Captured MSG:", first.captures.MSG?.slice(0, 30));
				
				expect(first.captures.METHOD).toBeDefined();
				expect(first.captures.MSG).toBeDefined();
			}
		});
	});

	describe("Performance Comparison", () => {
		it("tree-sitter vs regex fallback", async () => {
			const pattern = "console.log($MSG)";
			
			// Tree-sitter timing
			const tsStart = Date.now();
			const tsMatches = await treeSitter.structuralSearch(
				pattern,
				"typescript",
				testDir,
				{ maxResults: 100 }
			);
			const tsTime = Date.now() - tsStart;

			// Regex fallback timing
			const regexStart = Date.now();
			const regexMatches = regexStructuralSearch(
				pattern,
				testFiles.map(f => path.join(testDir, f)),
				{ maxResults: 100 }
			);
			const regexTime = Date.now() - regexStart;

			console.log(`\nPerformance:`);
			console.log(`  Tree-sitter: ${tsTime}ms, ${tsMatches.length} matches`);
			console.log(`  Regex:       ${regexTime}ms, ${regexMatches.length} matches`);
			console.log(`  Accuracy:    Tree-sitter has AST precision, regex may have false positives`);
		});
	});
});

describe("PoC Summary: When to use each tool", () => {
	it("documents the decision matrix", () => {
		const matrix = `
┌─────────────────────────────────────────────────────────────────┐
│                    Pattern Complexity Matrix                      │
├─────────────────────────────────────────────────────────────────┤
│                              │ Tree-sitter │  ast-grep  │ Regex  │
├─────────────────────────────────────────────────────────────────┤
│ Simple patterns (console.log)  │    Good     │   Best*    │  OK    │
│ Multi-statement chains       │    Best     │    Hard    │  Bad   │
│ Context-dependent            │    Best     │    Hard    │  Bad   │
│ Capture actual values        │    Best     │   Limited  │  OK    │
│ Needs auto-fix               │   Manual    │   Best*    │  N/A   │
│ Performance (large codebase) │   Slower    │   Fast*    │  Fast  │
│ Setup complexity             │   WASM dep  │  CLI tool  │  None  │
└─────────────────────────────────────────────────────────────────┘

* ast-grep is best when:
  - Pattern has a fix: block defined
  - Running at CLI (outside pi)
  - Need fastest performance
  - Using existing rule ecosystem

* Tree-sitter is best when:
  - Pattern spans multiple statements
  - Need to capture actual values (not just presence)
  - Context-dependent matching
  - Building custom analysis (no fix needed)
  - Runtime programmatic API needed
`;
		console.log(matrix);
		expect(true).toBe(true);
	});
});
