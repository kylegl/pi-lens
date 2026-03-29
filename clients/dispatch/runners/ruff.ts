/**
 * Ruff runner for dispatch system
 *
 * Ruff handles both formatting and linting for Python files.
 * Supports venv-local installations.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { stripAnsi } from "../../sanitize.js";
import type {
	Diagnostic,
	DispatchContext,
	RunnerDefinition,
	RunnerResult,
} from "../types.js";

// Cache ruff availability check
let ruffAvailable: boolean | null = null;
let ruffCommand: string | null = null;

/**
 * Find ruff command, checking venv first, then global.
 */
function findRuffCommand(cwd: string): string {
	const venvPaths = [
		".venv/bin/ruff",
		"venv/bin/ruff",
		".venv/Scripts/ruff.exe",
		"venv/Scripts/ruff.exe",
	];

	for (const venvPath of venvPaths) {
		const fullPath = path.join(cwd, venvPath);
		if (fs.existsSync(fullPath)) {
			return `"${fullPath}"`;
		}
	}

	return "ruff";
}

function isRuffAvailable(cwd?: string): boolean {
	if (ruffAvailable !== null) return ruffAvailable;

	const command = findRuffCommand(cwd || process.cwd());
	const check = spawnSync(command, ["--version"], {
		encoding: "utf-8",
		timeout: 5000,
		shell: true,
	});

	ruffAvailable = !check.error && check.status === 0;
	if (ruffAvailable) ruffCommand = command;
	return ruffAvailable;
}

const ruffRunner: RunnerDefinition = {
	id: "ruff-lint",
	appliesTo: ["python"],
	priority: 10,
	enabledByDefault: true,

	async run(ctx: DispatchContext): Promise<RunnerResult> {
		// Skip if ruff is not installed
		if (!isRuffAvailable(ctx.cwd || process.cwd())) {
			return { status: "skipped", diagnostics: [], semantic: "none" };
		}

		// Run ruff check
		const args = ctx.autofix
			? ["check", "--fix", ctx.filePath]
			: ["check", ctx.filePath];

		const result = spawnSync(ruffCommand!, args, {
			encoding: "utf-8",
			timeout: 30000,
			shell: true,
		});

		const raw = stripAnsi(result.stdout + result.stderr);

		if (result.status === 0) {
			return { status: "succeeded", diagnostics: [], semantic: "none" };
		}

		// Parse diagnostics
		const diagnostics = parseRuffOutput(raw, ctx.filePath);

		return {
			status: "failed",
			diagnostics,
			semantic: "warning",
		};
	},
};

function parseRuffOutput(raw: string, filePath: string): Diagnostic[] {
	const lines = raw.split("\n").filter((l) => l.trim());
	const diagnostics: Diagnostic[] = [];

	for (const line of lines) {
		// Parse ruff output: file:line:col: message (code)
		const match = line.match(/^(.+?):(\d+):(\d+):\s*(.+?)\s+\((.+?)\)/);
		if (match) {
			diagnostics.push({
				id: `ruff-${match[2]}-${match[5]}`,
				message: `${match[5]}: ${match[4]}`,
				filePath,
				line: parseInt(match[2], 10),
				column: parseInt(match[3], 10),
				severity: line.includes("error") ? "error" : "warning",
				semantic: "warning",
				tool: "ruff",
				rule: match[5],
				fixable: true,
			});
		}
	}

	return diagnostics;
}

export default ruffRunner;
