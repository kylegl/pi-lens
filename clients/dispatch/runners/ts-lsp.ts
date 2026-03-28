/**
 * TypeScript LSP runner for dispatch system
 *
 * Wraps the existing TypeScriptClient for LSP diagnostics.
 */

import type { DispatchContext } from "../types.js";
import { TypeScriptClient } from "../../typescript-client.js";
import { readFileContent } from "./utils.js";

const tsLspRunner = {
	id: "ts-lsp",
	appliesTo: ["jsts"] as const,
	priority: 5,
	enabledByDefault: true,

	async run(ctx: DispatchContext): Promise<{ status: "succeeded" | "failed" | "skipped"; output: string }> {
		// Only check TypeScript files
		if (!ctx.filePath.match(/\.tsx?$/)) {
			return { status: "skipped", output: "" };
		}

		// Use the existing TypeScriptClient
		const tsClient = new TypeScriptClient();

		const content = readFileContent(ctx.filePath);
		if (!content) {
			return { status: "skipped", output: "" };
		}
		tsClient.updateFile(ctx.filePath, content);

		const diags = tsClient.getDiagnostics(ctx.filePath);

		if (diags.length === 0) {
			return { status: "succeeded", output: "" };
		}

		// Separate unused imports from other diagnostics
		const unusedImports = diags.filter((d) => d.code === 6133 || d.code === 6196);
		const otherDiags = diags.filter((d) => d.code !== 6133 && d.code !== 6196);

		let output = "";

		if (unusedImports.length > 0) {
			output += `\n🧹 Remove ${unusedImports.length} unused import(s):\n`;
			for (const d of unusedImports.slice(0, 10)) {
				output += `  L${d.range.start.line + 1}: ${d.message}\n`;
			}
		}

		const errors = otherDiags.filter((d) => d.severity !== 2);
		const warnings = otherDiags.filter((d) => d.severity === 2);

		if (errors.length > 0) {
			output += `\n🔴 Fix ${errors.length} TypeScript error(s):\n`;
			for (const d of errors.slice(0, 10)) {
				output += `  L${d.range.start.line + 1}: ${d.message}\n`;
			}
		}

		if (warnings.length > 0) {
			output += `\n🟡 ${warnings.length} TypeScript warning(s):\n`;
			for (const d of warnings.slice(0, 10)) {
				output += `  L${d.range.start.line + 1}: ${d.message}\n`;
			}
		}

		return {
			status: errors.length > 0 ? "failed" : "succeeded",
			output,
		};
	},
};

export default tsLspRunner;
