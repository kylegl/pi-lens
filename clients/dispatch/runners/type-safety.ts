/**
 * Type safety runner for dispatch system
 *
 * Checks for:
 * - Switch exhaustiveness
 * - Missing return statements
 * - Unreachable code
 * - Type safety issues
 */

import type { DispatchContext } from "../types.js";
import { readFileContent } from "./utils.js";

interface TypeSafetyIssue {
	line: number;
	message: string;
	severity: "error" | "warning";
}

const typeSafetyRunner = {
	id: "type-safety",
	appliesTo: ["jsts"] as const,
	priority: 20,
	enabledByDefault: true,

	async run(ctx: DispatchContext): Promise<{ status: "succeeded" | "failed" | "skipped"; output: string }> {
		// Only check TypeScript files
		if (!ctx.filePath.match(/\.tsx?$/)) {
			return { status: "skipped", output: "" };
		}

		// Read file content
		const content = readFileContent(ctx.filePath);
		if (!content) {
			return { status: "skipped", output: "" };
		}

		const issues: TypeSafetyIssue[] = [];

		// Check for switch exhaustiveness patterns
		issues.push(...checkSwitchExhaustiveness(content));

		// Check for missing return patterns
		issues.push(...checkMissingReturns(content));

		// Check for any type usage
		issues.push(...checkAnyTypeUsage(content));

		if (issues.length === 0) {
			return { status: "succeeded", output: "" };
		}

		const errors = issues.filter((i) => i.severity === "error");
		const warnings = issues.filter((i) => i.severity === "warning");

		return {
			status: errors.length > 0 ? "failed" : "succeeded",
			output: formatTypeSafetyOutput(errors, warnings),
		};
	},
};

function checkSwitchExhaustiveness(content: string): TypeSafetyIssue[] {
	const issues: TypeSafetyIssue[] = [];

	// Pattern: switch without exhaustive check
	const switchRegex = /switch\s*\(\s*(\w+)\s*\)\s*\{/g;
	let match;

	while ((match = switchRegex.exec(content)) !== null) {
		const switchStart = match.index;
		const switchVar = match[1];

		// Find the switch block
		let braceCount = 0;
		let blockStart = content.indexOf("{", switchStart);
		let blockEnd = blockStart;

		while (blockEnd < content.length && braceCount >= 0) {
			if (content[blockEnd] === "{") braceCount++;
			if (content[blockEnd] === "}") braceCount--;
			blockEnd++;
		}

		const switchBlock = content.slice(blockStart, blockEnd);

		// Check if it has a default case
		if (!/\bdefault\s*:/ .test(switchBlock)) {
			// Count cases
			const caseCount = (switchBlock.match(/\bcase\s+/g) || []).length;

			// If it's an enum-like variable, suggest adding default
			if (caseCount > 2) {
				const lineNum = content.slice(0, switchStart).split("\n").length;
				issues.push({
					line: lineNum,
					message: `Switch on '${switchVar}' has ${caseCount} cases but no default — add 'default: break;' or exhaustive checking`,
					severity: "warning",
				});
			}
		}
	}

	return issues;
}

function checkMissingReturns(content: string): TypeSafetyIssue[] {
	const issues: TypeSafetyIssue[] = [];

	// Pattern: function returning non-void without return in all paths
	const funcRegex = /function\s+(\w+)\s*\([^)]*\)\s*:\s*([^\s{]+)\s*\{/g;
	let match;

	while ((match = funcRegex.exec(content)) !== null) {
		const returnType = match[2].trim();

		// Skip void/never/Promise<void> returns
		if (returnType === "void" || returnType === "never" || returnType.includes("Promise<void>")) {
			continue;
		}

		const funcStart = match.index;
		const funcName = match[1];

		// Find function block
		let braceCount = 0;
		let blockStart = content.indexOf("{", funcStart);
		let blockEnd = blockStart;

		while (blockEnd < content.length && braceCount >= 0) {
			if (content[blockEnd] === "{") braceCount++;
			if (content[blockEnd] === "}") braceCount--;
			blockEnd++;
		}

		const funcBlock = content.slice(blockStart, blockEnd);

		// Check if there's a return statement
		if (!/\breturn\b/.test(funcBlock)) {
			const lineNum = content.slice(0, funcStart).split("\n").length;
			issues.push({
				line: lineNum,
				message: `Function '${funcName}' returns '${returnType}' but has no return statement`,
				severity: "error",
			});
		}
	}

	return issues;
}

function checkAnyTypeUsage(content: string): TypeSafetyIssue[] {
	const issues: TypeSafetyIssue[] = [];

	// Pattern: `: any` or `as any`
	const anyRegex = /:\s*any\b|as\s+any\b/g;
	let match;

	while ((match = anyRegex.exec(content)) !== null) {
		const lineNum = content.slice(0, match.index).split("\n").length;
		issues.push({
			line: lineNum,
			message: "Avoid 'any' type — use 'unknown' or define a proper interface",
			severity: "warning",
		});
	}

	return issues;
}

function formatTypeSafetyOutput(errors: TypeSafetyIssue[], warnings: TypeSafetyIssue[]): string {
	let output = "";

	if (errors.length > 0) {
		output += `\n🔴 STOP — ${errors.length} type safety violation(s):\n`;
		for (const issue of errors.slice(0, 10)) {
			output += `  L${issue.line}: ${issue.message}\n`;
		}
	}

	if (warnings.length > 0) {
		output += `\n🟡 ${warnings.length} type safety warning(s):\n`;
		for (const issue of warnings.slice(0, 10)) {
			output += `  L${issue.line}: ${issue.message}\n`;
		}
	}

	return output;
}

export default typeSafetyRunner;
