/**
 * Python Slop runner for dispatch system
 *
 * Detects "slop" patterns in Python code:
 * - Verbose patterns (ceremony that adds no value)
 * - Defensive over-checking (excessive guards)
 * - Manual reimplementation of builtins
 * - Unnecessary object allocations
 *
 * Based on slop-code-bench: https://github.com/SprocketLab/slop-code-bench
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
	Diagnostic,
	DispatchContext,
	RunnerDefinition,
	RunnerResult,
} from "../types.js";

// Cache availability check
let sgAvailable: boolean | null = null;

function isSgAvailable(): boolean {
	if (sgAvailable !== null) return sgAvailable;

	const check = spawnSync("npx", ["sg", "--version"], {
		encoding: "utf-8",
		timeout: 5000,
		shell: process.platform === "win32",
	});

	sgAvailable = !check.error && check.status === 0;
	return sgAvailable;
}

function findSlopConfig(cwd: string): string | undefined {
	// Check for local config first
	const localPath = path.join(cwd, "rules", "python-slop-rules", ".sgconfig.yml");
	if (fs.existsSync(localPath)) {
		return localPath;
	}

	// Fall back to extension rules
	const extensionPaths = [
		"rules/python-slop-rules/.sgconfig.yml",
		"../rules/python-slop-rules/.sgconfig.yml",
	];

	for (const candidate of extensionPaths) {
		const fullPath = path.resolve(cwd, candidate);
		if (fs.existsSync(fullPath)) {
			return fullPath;
		}
	}

	return undefined;
}

const pythonSlopRunner: RunnerDefinition = {
	id: "python-slop",
	appliesTo: ["python"],
	priority: 25, // Between pyright (5) and ruff (10)
	enabledByDefault: true,
	skipTestFiles: true, // Slop rules can be noisy in test files

	async run(ctx: DispatchContext): Promise<RunnerResult> {
		// Check if ast-grep is available
		if (!isSgAvailable()) {
			return { status: "skipped", diagnostics: [], semantic: "none" };
		}

		// Find slop config
		const configPath = findSlopConfig(ctx.cwd);
		if (!configPath) {
			return { status: "skipped", diagnostics: [], semantic: "none" };
		}

		// Run ast-grep scan
		const args = ["sg", "scan", "--config", configPath, "--json", ctx.filePath];

		const result = spawnSync("npx", args, {
			encoding: "utf-8",
			timeout: 30000,
			shell: process.platform === "win32",
		});

		const raw = result.stdout + result.stderr;

		if (result.status === 0 && !raw.trim()) {
			return { status: "succeeded", diagnostics: [], semantic: "none" };
		}

		// Parse results
		const diagnostics = parseSlopOutput(raw, ctx.filePath);

		if (diagnostics.length === 0) {
			return { status: "succeeded", diagnostics: [], semantic: "none" };
		}

		return {
			status: "failed",
			diagnostics,
			semantic: "warning",
		};
	},
};

function parseSlopOutput(raw: string, filePath: string): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			for (const item of parsed) {
				const line = item.range?.start?.line || 1;
				const ruleId = item.rule || "unknown";
				const message = item.message || "";

				// Categorize by severity based on weight from metadata
				const weight = item.metadata?.weight || 3;
				const severity = weight >= 4 ? "error" : "warning";
				const category = item.metadata?.category || "slop";

				// Add slop category indicator to message
				let enhancedMessage = `[${category}] ${message}`;
				if (item.replacement) {
					const preview =
						item.replacement.length > 40
							? `${item.replacement.substring(0, 40)}...`
						: item.replacement;
					enhancedMessage += `\n💡 Suggested fix: → "${preview}"`;
				}

				diagnostics.push({
					id: `python-slop-${line}-${ruleId}`,
					message: enhancedMessage,
					filePath,
					line,
					column: item.range?.start?.column || 0,
					severity,
					semantic: severity === "error" ? "blocking" : "warning",
					tool: "python-slop",
					rule: ruleId,
					fixable: !!item.replacement,
					fixSuggestion: item.replacement,
				});
			}
		}
	} catch {
		// JSON parse failed, try line-by-line
		const lines = raw.split("\n");
		for (const line of lines) {
			if (line.includes(":") && line.includes("L")) {
				const match = line.match(/L(\d+):?\s*(.+)/);
				if (match) {
					diagnostics.push({
						id: `python-slop-${match[1]}-line`,
						message: `[slop] ${match[2].trim()}`,
						filePath,
						line: parseInt(match[1], 10),
						severity: "warning",
						semantic: "warning",
						tool: "python-slop",
					});
				}
			}
		}
	}

	return diagnostics;
}

export default pythonSlopRunner;
