/**
 * Biome runner for dispatch system
 *
 * Requires: @biomejs/biome (npm install -D @biomejs/biome)
 */

import { spawnSync } from "node:child_process";
import type {
	Diagnostic,
	DispatchContext,
	RunnerDefinition,
	RunnerResult,
} from "../types.js";

// Cache biome availability check
let biomeAvailable: boolean | null = null;

function isBiomeAvailable(): boolean {
	if (biomeAvailable !== null) return biomeAvailable;

	// Check if biome CLI is available (do NOT auto-install via npx)
	const check = spawnSync("biome", ["--version"], {
		encoding: "utf-8",
		timeout: 5000,
		shell: process.platform === "win32",
	});
	biomeAvailable = !check.error && check.status === 0;
	return biomeAvailable;
}

const biomeRunner: RunnerDefinition = {
	id: "biome-lint",
	appliesTo: ["jsts", "json"],
	priority: 10,
	enabledByDefault: true,

	async run(ctx: DispatchContext): Promise<RunnerResult> {
		// Skip if biome is not installed
		if (!isBiomeAvailable()) {
			return { status: "skipped", diagnostics: [], semantic: "none" };
		}

		// IMPORTANT: Never use --write in dispatch runner to prevent infinite loops.
		// Writing to the file would trigger another tool_result event, which would
		// call dispatchLint again, creating a feedback loop.
		// Use /lens-format command for explicit formatting, or autofix flags on
		// the write/edit tools directly.
		const args = ["check", ctx.filePath];

		const result = spawnSync("biome", args, {
			encoding: "utf-8",
			timeout: 30000,
			shell: process.platform === "win32",
		});

		const output = result.stdout + result.stderr;

		if (result.status === 0) {
			return { status: "succeeded", diagnostics: [], semantic: "none" };
		}

		// Parse diagnostics (never autofix in dispatch to prevent loops)
		const diagnostics = parseBiomeOutput(output, ctx.filePath, false);

		return {
			status: "failed",
			diagnostics,
			semantic: "warning",
		};
	},
};

function parseBiomeOutput(
	raw: string,
	filePath: string,
	autofix: boolean,
): Diagnostic[] {
	const clean = raw.replace(/\x1b\[[0-9;]*m/g, "");
	const lines = clean.split("\n").filter((l) => l.trim());
	const diagnostics: Diagnostic[] = [];

	for (const line of lines) {
		// Parse biome output format: file:line:col message (category)
		const match = line.match(/^(.+?):(\d+):(\d+)\s+(.+?)\s*\((.+?)\)/);
		if (match) {
			diagnostics.push({
				id: `biome-${match[2]}-${match[5]}`,
				message: `${match[5]}: ${match[4]}`,
				filePath,
				line: parseInt(match[2], 10),
				column: parseInt(match[3], 10),
				severity: line.includes("error") ? "error" : "warning",
				semantic: "warning",
				tool: "biome",
				rule: match[5],
				fixable: true,
				fixSuggestion: autofix
					? "Auto-fix applied"
					: "Run with --autofix-biome to fix",
			});
		}
	}

	return diagnostics;
}

export default biomeRunner;
