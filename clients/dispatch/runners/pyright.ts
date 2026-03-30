/**
 * Pyright runner for dispatch system
 *
 * Provides real Python type-checking (not just linting).
 * Catches type errors like: result: str = add(1, 2)  # Type "int" not assignable to "str"
 *
 * Requires: pyright (pip install pyright or npm install -g pyright)
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

// Cache pyright availability check
let pyrightAvailable: boolean | null = null;
let pyrightCommand: string | null = null;

/**
 * Find pyright command, checking venv first, then global.
 * Looks in .venv/bin, venv/bin (Unix), .venv/Scripts, venv/Scripts (Windows)
 */
function findPyrightCommand(cwd: string): string {
	// Check common venv locations
	const venvPaths = [
		".venv/bin/pyright",
		"venv/bin/pyright",
		".venv/Scripts/pyright.exe",
		"venv/Scripts/pyright.exe",
	];

	for (const venvPath of venvPaths) {
		const fullPath = path.join(cwd, venvPath);
		if (fs.existsSync(fullPath)) {
			return `"${fullPath}"`; // Quote for Windows paths with spaces
		}
	}

	// Fall back to global
	return "pyright";
}

function isPyrightAvailable(cwd?: string): boolean {
	if (pyrightAvailable !== null) return pyrightAvailable;

	const command = findPyrightCommand(cwd || process.cwd());

	const check = spawnSync(command, ["--version"], {
		encoding: "utf-8",
		timeout: 5000,
		shell: process.platform === "win32",
	});
	pyrightAvailable = !check.error && check.status === 0;
	if (pyrightAvailable) pyrightCommand = command;
	return pyrightAvailable;
}

const pyrightRunner: RunnerDefinition = {
	id: "pyright",
	appliesTo: ["python"],
	priority: 5, // Higher priority than ruff (10) - type errors are more important
	enabledByDefault: true,

	async run(ctx: DispatchContext): Promise<RunnerResult> {
		// Skip if pyright is not installed
		if (!isPyrightAvailable(ctx.cwd || process.cwd())) {
			return { status: "skipped", diagnostics: [], semantic: "none" };
		}

		// Run pyright with JSON output (use venv-local or global command)
		const result = spawnSync(pyrightCommand!, ["--outputjson", ctx.filePath], {
			encoding: "utf-8",
			timeout: 60000,
			shell: process.platform === "win32",
		});

		// Pyright returns non-zero when errors found, that's OK
		if (result.error) {
			return { status: "skipped", diagnostics: [], semantic: "none" };
		}

		const output = (result.stdout || "").trim();
		if (!output) {
			return { status: "succeeded", diagnostics: [], semantic: "none" };
		}

		try {
			const data = JSON.parse(output);
			const diagnostics = parsePyrightOutput(data, ctx.filePath);

			if (diagnostics.length === 0) {
				return { status: "succeeded", diagnostics: [], semantic: "none" };
			}

			const hasErrors = diagnostics.some((d) => d.severity === "error");

			return {
				status: hasErrors ? "failed" : "succeeded",
				diagnostics,
				semantic: "warning",
			};
		} catch {
			// JSON parse failed, skip
			return { status: "skipped", diagnostics: [], semantic: "none" };
		}
	},
};

interface PyrightDiagnostic {
	file: string;
	severity: "error" | "warning" | "information";
	message: string;
	range: {
		start: { line: number; character: number };
		end: { line: number; character: number };
	};
	rule: string;
}

interface PyrightResult {
	generalDiagnostics: PyrightDiagnostic[];
}

function parsePyrightOutput(
	data: PyrightResult,
	filePath: string,
): Diagnostic[] {
	if (!data.generalDiagnostics) return [];

	return data.generalDiagnostics
		.filter((d) => {
			// Only include errors and warnings, skip informational
			return d.severity === "error" || d.severity === "warning";
		})
		.map((d) => ({
			id: `pyright-${d.range.start.line}-${d.rule}`,
			message: d.message.split("\n")[0], // First line only (pyright has multi-line messages)
			filePath,
			line: d.range.start.line + 1, // Pyright is 0-indexed, we're 1-indexed
			column: d.range.start.character + 1,
			severity: d.severity === "error" ? "error" : "warning",
			semantic: d.severity === "error" ? "blocking" : "warning",
			tool: "pyright",
			rule: d.rule,
			fixable: false, // Pyright can't auto-fix, only suggest
		}));
}

export default pyrightRunner;
