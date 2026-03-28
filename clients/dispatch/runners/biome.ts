/**
 * Biome runner for dispatch system
 */

import type { DispatchContext, RunnerDefinition } from "../types.js";
import { spawnSync } from "node:child_process";

const biomeRunner: RunnerDefinition = {
	id: "biome-lint",
	appliesTo: ["jsts", "json"],
	priority: 10,
	enabledByDefault: true,

	async run(ctx: DispatchContext): Promise<{ status: "succeeded" | "failed" | "skipped"; output: string }> {
		const args = ctx.autofix
			? ["check", "--write", ctx.filePath]
			: ["check", ctx.filePath];

		const result = spawnSync("npx", ["@biomejs/biome", ...args], {
			encoding: "utf-8",
			timeout: 30000,
			shell: true,
		});

		if (result.error) {
			return { status: "skipped", output: "" };
		}

		const output = result.stdout + result.stderr;

		if (result.status === 0) {
			return { status: "succeeded", output: "" };
		}

		return {
			status: "failed",
			output: formatBiomeOutput(output, ctx.autofix),
		};
	},
};

function formatBiomeOutput(raw: string, autofix: boolean): string {
	// Remove ANSI codes
	const clean = raw.replace(/\x1b\[[0-9;]*m/g, "");

	if (!clean.trim()) {
		return "";
	}

	const lines = clean.split("\n").filter((l) => l.trim());
	if (lines.length === 0) {
		return "";
	}

	let output = "";

	// Parse biome output
	const issues: string[] = [];
	for (const line of lines) {
		// Look for error/warning lines
		if (line.includes("error") || line.includes("warning")) {
			issues.push(line);
		}
	}

	if (issues.length > 0) {
		const prefix = autofix ? "🟠" : "🔴";
		output += `\n${prefix} Fix ${issues.length} Biome issue(s):\n`;
		for (const issue of issues.slice(0, 20)) {
			output += `  ${issue}\n`;
		}
		if (issues.length > 20) {
			output += `  ... and ${issues.length - 20} more\n`;
		}
		if (autofix) {
			output += `\n  → Auto-fix applied, remaining issues shown above`;
		}
	}

	return output;
}

export default biomeRunner;
