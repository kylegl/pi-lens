/**
 * Similarity Runner: Detect semantic code reuse opportunities
 *
 * Uses Amain's 57×72 state matrix algorithm to find similar functions.
 * Integrated into dispatch flow as a warning (non-blocking) suggestion.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as ts from "typescript";
import { EXCLUDED_DIRS } from "../../file-utils.js";
import { NativeRustCoreClient } from "../../native-rust-client.js";
import {
	buildProjectIndex,
	findSimilarFunctions,
	loadIndex,
	type ProjectIndex,
} from "../../project-index.js";
import { buildStateMatrix, countTransitions } from "../../state-matrix.js";
import type {
	Diagnostic,
	DispatchContext,
	RunnerDefinition,
	RunnerResult,
} from "../types.js";

// Singleton Rust client — initialised once, reused across runner invocations.
const rustClient = new NativeRustCoreClient();

/** Feature flag: set to false to force the pure-TypeScript path. */
const USE_RUST = true;

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
	SIMILARITY_THRESHOLD: 0.9, // 90% minimum similarity — below this false positives dominate
	MIN_TRANSITIONS: 20, // Skip functions with <20 AST transitions
	MAX_SUGGESTIONS: 3, // Max 3 suggestions per file
	USAGE_THRESHOLD: 2, // Only suggest utilities with 2+ uses (placeholder)
};

// ============================================================================
// Runner Implementation
// ============================================================================

const similarityRunner: RunnerDefinition = {
	id: "similarity",
	appliesTo: ["jsts"], // TypeScript/JavaScript only for MVP
	priority: 35, // After ts-lsp, before ast-grep
	enabledByDefault: true,

	async run(ctx: DispatchContext): Promise<RunnerResult> {
		const { filePath } = ctx;

		// Only check TypeScript files
		if (!filePath.match(/\.tsx?$/)) {
			return { status: "skipped", diagnostics: [], semantic: "none" };
		}

		// Load file content
		const content = await fs.readFile(filePath, "utf-8").catch(() => null);
		if (!content) {
			return { status: "skipped", diagnostics: [], semantic: "none" };
		}

		// Find project root and load index
		const projectRoot = await findProjectRoot(filePath);
		if (!projectRoot) {
			return { status: "skipped", diagnostics: [], semantic: "none" };
		}

		// ── Rust fast-path ─────────────────────────────────────────────────────
		// Try Rust for file scanning + similarity detection. If the Rust binary
		// is available, use it. On any failure, fall through to the pure-TS path.
		if (USE_RUST && rustClient.isAvailable()) {
			try {
				const rustResult = await runWithRust(
					filePath,
					projectRoot,
					CONFIG.SIMILARITY_THRESHOLD,
					CONFIG.MAX_SUGGESTIONS,
				);
				if (rustResult !== null) return rustResult;
			} catch {
				// Fall through to TypeScript implementation.
			}
		}
		// ── TypeScript fallback ─────────────────────────────────────────────────

		const index = await loadOrBuildIndex(projectRoot);
		if (!index || index.entries.size === 0) {
			return { status: "skipped", diagnostics: [], semantic: "none" };
		}

		// Parse the file
		const sourceFile = ts.createSourceFile(
			filePath,
			content,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);

		// Extract functions and check for similarities
		const newFunctions = extractFunctions(sourceFile, content);

		const diagnostics: Diagnostic[] = [];

		for (const func of newFunctions) {
			// Guardrail: Skip tiny functions
			if (func.transitionCount < CONFIG.MIN_TRANSITIONS) {
				continue;
			}

			// Find similar functions in index
			const matches = findSimilarFunctions(
				func.matrix,
				index,
				CONFIG.SIMILARITY_THRESHOLD,
				CONFIG.MAX_SUGGESTIONS,
			);

			// Create diagnostic for each match
			for (const match of matches) {
				// Skip if it's the same function (self-match by path/name)
				if (
					match.targetId ===
					`${path.relative(projectRoot, filePath)}:${func.name}`
				) {
					continue;
				}

				diagnostics.push({
					id: `similarity-${func.name}-${match.targetId}`,
					tool: "similarity",
					filePath,
					line: func.line,
					column: func.column,
					message: buildSuggestionMessage(func, match),
					severity: "warning", // 🟡 Not blocking
					semantic: "warning",
				});
			}
		}

		// Return limited number of suggestions
		const limitedResults = diagnostics.slice(0, CONFIG.MAX_SUGGESTIONS);

		if (limitedResults.length === 0) {
			return { status: "succeeded", diagnostics: [], semantic: "none" };
		}

		return {
			status: "succeeded",
			diagnostics: limitedResults,
			semantic: "warning",
		};
	},
};

// ============================================================================
// Function Extraction
// ============================================================================

export interface ExtractedFunction {
	name: string;
	line: number;
	column: number;
	matrix: number[][];
	transitionCount: number;
	signature: string;
}

export function extractFunctions(
	sourceFile: ts.SourceFile,
	_fullContent: string,
): ExtractedFunction[] {
	const functions: ExtractedFunction[] = [];

	function visit(node: ts.Node) {
		// Function declarations
		if (ts.isFunctionDeclaration(node) && node.name) {
			const { line, character } = sourceFile.getLineAndCharacterOfPosition(
				node.getStart(sourceFile),
			);
			const funcCode = getNodeText(node, sourceFile);
			const matrix = buildStateMatrix(funcCode);
			const transitionCount = countTransitions(matrix);

			functions.push({
				name: node.name.text,
				line: line + 1, // 1-indexed
				column: character + 1, // 1-indexed
				matrix,
				transitionCount,
				signature: getSignature(node),
			});
		}

		// Arrow functions assigned to const
		if (ts.isVariableStatement(node)) {
			extractArrowFunctions(node, functions, sourceFile);
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return functions;
}

function extractArrowFunctions(
	node: ts.VariableStatement,
	functions: ExtractedFunction[],
	sourceFile: ts.SourceFile,
): void {
	for (const decl of node.declarationList.declarations) {
		if (!ts.isIdentifier(decl.name) || !decl.initializer) {
			continue;
		}

		const func = decl.initializer;
		if (!ts.isArrowFunction(func) && !ts.isFunctionExpression(func)) {
			continue;
		}

		const { line, character } = sourceFile.getLineAndCharacterOfPosition(
			node.getStart(sourceFile),
		);
		const funcCode = getNodeText(func, sourceFile);
		const matrix = buildStateMatrix(funcCode);
		const transitionCount = countTransitions(matrix);

		functions.push({
			name: decl.name.text,
			line: line + 1,
			column: character + 1,
			matrix,
			transitionCount,
			signature: getArrowSignature(func),
		});
	}
}

function getNodeText(node: ts.Node, sourceFile: ts.SourceFile): string {
	return sourceFile.text.substring(node.getStart(sourceFile), node.getEnd());
}

function getSignature(node: ts.FunctionDeclaration): string {
	const params = node.parameters
		.map((p) => (ts.isIdentifier(p.name) ? p.name.text : "param"))
		.join(", ");
	return `(${params})`;
}

function getArrowSignature(
	node: ts.ArrowFunction | ts.FunctionExpression,
): string {
	const params = node.parameters
		.map((p) => (ts.isIdentifier(p.name) ? p.name.text : "param"))
		.join(", ");
	return `(${params})`;
}

// ============================================================================
// Message Building
// ============================================================================

function buildSuggestionMessage(
	func: ExtractedFunction,
	match: {
		targetId: string;
		targetName: string;
		targetLocation: string;
		similarity: number;
	},
): string {
	const similarityPct = Math.round(match.similarity * 100);
	const parts = match.targetId.split(":");
	const file = parts[0];
	const name = parts[1] || match.targetName;
	const location = `${file}:1`; // TODO: get actual line

	return `Function '${func.name}' has ${similarityPct}% similarity to existing utility '${name}()' in ${location}. Consider reusing the existing utility.`;
}

// ============================================================================
// Rust fast-path
// ============================================================================

/**
 * Run similarity detection via the Rust binary.
 *
 * Flow:
 * 1. Scan project files with Rust (respects .gitignore, much faster than glob).
 * 2. Build the Rust index (persisted to .pi-lens/rust-index.json).
 * 3. Query similarity for the current file.
 * 4. Convert matches to Diagnostics.
 *
 * Returns `null` if the Rust path cannot produce results (no matches is still
 * a valid result — returned as an empty-diagnostic RunnerResult).
 */
async function runWithRust(
	filePath: string,
	projectRoot: string,
	threshold: number,
	maxSuggestions: number,
): Promise<RunnerResult | null> {
	// 1. Scan project files.
	const scanned = await rustClient.scanProject(projectRoot, [".ts", ".tsx"]);
	if (scanned.length === 0) return null;

	const relativeFiles = scanned.map((e) =>
		path.relative(projectRoot, e.path).replace(/\\/g, "/"),
	);

	// 2. Build index (saves to .pi-lens/rust-index.json).
	await rustClient.buildIndex(projectRoot, relativeFiles);

	// 3. Find similarities for the current file.
	const matches = await rustClient.findSimilarities(
		projectRoot,
		filePath,
		threshold,
	);

	if (matches.length === 0) {
		return { status: "succeeded", diagnostics: [], semantic: "none" };
	}

	// 4. Convert to Diagnostics.
	const diagnostics: Diagnostic[] = matches
		.slice(0, maxSuggestions)
		.map((m) => {
			const similarityPct = Math.round(m.similarity * 100);
			// source_id format: "path/to/file.ts::funcName@line"
			const [srcFile, srcFunc] = m.source_id.split("::");
			const [targetFile, targetFunc] = m.target_id.split("::");
			const funcName = srcFunc?.split("@")[0] ?? "?";
			const targetName = targetFunc?.split("@")[0] ?? "?";
			void srcFile; // file is implicit (it's the current file)
			return {
				id: `similarity-rust-${m.source_id}-${m.target_id}`,
				tool: "similarity",
				filePath,
				line: 1, // Rust gives us the function source_id; line resolution is TODO
				column: 1,
				message: `Function '${funcName}' has ${similarityPct}% similarity to '${targetName}()' in ${targetFile}. Consider reusing the existing utility.`,
				severity: "warning" as const,
				semantic: "warning" as const,
			};
		});

	return {
		status: "succeeded",
		diagnostics,
		semantic: diagnostics.length > 0 ? "warning" : "none",
	};
}

// ============================================================================
// Index Management
// ============================================================================

const indexCache = new Map<string, ProjectIndex>();

async function findProjectRoot(filePath: string): Promise<string | null> {
	let dir = path.dirname(filePath);
	while (dir !== path.dirname(dir)) {
		try {
			await fs.access(path.join(dir, "package.json"));
			return dir;
		} catch {
			dir = path.dirname(dir);
		}
	}
	return null;
}

async function loadOrBuildIndex(
	projectRoot: string,
): Promise<ProjectIndex | null> {
	// Check cache
	const cached = indexCache.get(projectRoot);
	if (cached) {
		return cached;
	}

	// Try to load existing index
	const existing = await loadIndex(projectRoot);
	if (existing) {
		indexCache.set(projectRoot, existing);
		return existing;
	}

	// Build new index
	const { glob } = await import("glob");
	// Build ignore patterns from centralized EXCLUDED_DIRS
	const ignorePatterns = [
		...EXCLUDED_DIRS.map((d) => `**/${d}/**`),
		"**/*.test.ts",
		"**/*.spec.ts",
		"**/*.poc.test.ts",
	];
	const files = await glob("**/*.ts", {
		cwd: projectRoot,
		ignore: ignorePatterns,
	});

	if (files.length === 0) {
		return null;
	}

	const absoluteFiles = files.map((f) => path.join(projectRoot, f));
	const index = await buildProjectIndex(projectRoot, absoluteFiles);

	indexCache.set(projectRoot, index);
	return index;
}

// ============================================================================
// Testing Helper
// ============================================================================

export async function buildIndexForTesting(
	projectRoot: string,
): Promise<ProjectIndex> {
	const index = await loadOrBuildIndex(projectRoot);
	if (!index) {
		throw new Error("Failed to build index");
	}
	return index;
}

export { CONFIG };
export default similarityRunner;
