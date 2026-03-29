/**
 * /lens-rate command
 *
 * Provides a visual scoring breakdown of code quality across multiple dimensions.
 * Uses existing scan data to calculate scores.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

interface CategoryScore {
	name: string;
	score: number; // 0-100
	icon: string;
	issues: string[];
}

interface RateResult {
	overall: number;
	categories: CategoryScore[];
	fileCount: number;
}

/**
 * Calculate scores from scan results
 */
export function calculateScores(
	typeCoverage: number, // 0-100
	complexityScore: number, // 0-100
	securityFindings: number, // count
	archViolations: number, // count
	deadCodeCount: number, // count
	testPassRate: number, // 0-100
): RateResult {
	const categories: CategoryScore[] = [
		{
			name: "Type Safety",
			score: Math.round(typeCoverage),
			icon: "🔷",
			issues:
				typeCoverage < 90 ? [`${Math.round(100 - typeCoverage)}% untyped`] : [],
		},
		{
			name: "Complexity",
			score: Math.round(complexityScore),
			icon: "🧩",
			issues: complexityScore < 70 ? ["High complexity files detected"] : [],
		},
		{
			name: "Security",
			score: Math.max(0, 100 - securityFindings * 20),
			icon: "🔒",
			issues:
				securityFindings > 0 ? [`${securityFindings} secret(s) found`] : [],
		},
		{
			name: "Architecture",
			score: Math.max(0, 100 - archViolations * 15),
			icon: "🏗️",
			issues: archViolations > 0 ? [`${archViolations} rule violation(s)`] : [],
		},
		{
			name: "Dead Code",
			score: Math.max(0, 100 - deadCodeCount * 10),
			icon: "🗑️",
			issues: deadCodeCount > 0 ? [`${deadCodeCount} unused export(s)`] : [],
		},
		{
			name: "Tests",
			score: Math.round(testPassRate),
			icon: "✅",
			issues:
				testPassRate < 100
					? [`${Math.round(100 - testPassRate)}% failing`]
					: [],
		},
	];

	const overall = Math.round(
		categories.reduce((sum, c) => sum + c.score, 0) / categories.length,
	);

	return { overall, categories, fileCount: 0 };
}

/**
 * Format score as a bar
 */
function scoreBar(score: number, width = 10): string {
	const filled = Math.round((score / 100) * width);
	const empty = width - filled;
	const color = score >= 80 ? "🟩" : score >= 60 ? "🟨" : "🟥";
	return color.repeat(filled) + "⬜".repeat(empty);
}

/**
 * Get grade from score
 */
function getGrade(score: number): string {
	if (score >= 90) return "A";
	if (score >= 80) return "B";
	if (score >= 70) return "C";
	if (score >= 60) return "D";
	return "F";
}

/**
 * Format rate result for terminal
 */
export function formatRateResult(result: RateResult): string {
	const lines: string[] = [];

	lines.push("┌─────────────────────────────────────────────────────────┐");
	lines.push(
		`│  📊 CODE QUALITY SCORE: ${result.overall}/100 (${getGrade(result.overall)})${" ".repeat(Math.max(0, 22 - String(result.overall).length))}│`,
	);
	lines.push("├─────────────────────────────────────────────────────────┤");

	for (const cat of result.categories) {
		const name = cat.name.padEnd(14);
		const bar = scoreBar(cat.score);
		const score = String(cat.score).padStart(3);
		lines.push(`│  ${cat.icon} ${name} ${bar} ${score} │`);
	}

	lines.push("└─────────────────────────────────────────────────────────┘");

	// Show issues if any
	const allIssues = result.categories
		.filter((c) => c.issues.length > 0)
		.flatMap((c) => c.issues.map((i) => `${c.icon} ${c.name}: ${i}`));

	if (allIssues.length > 0) {
		lines.push("");
		lines.push("Issues to address:");
		for (const issue of allIssues.slice(0, 5)) {
			lines.push(`  • ${issue}`);
		}
		if (allIssues.length > 5) {
			lines.push(`  ... and ${allIssues.length - 5} more`);
		}
		lines.push("");
		lines.push("💡 Run /lens-booboo for full details");
	}

	return lines.join("\n");
}

/**
 * Handle /lens-rate command
 */
export async function handleRate(ctx: ExtensionContext): Promise<string> {
	const cwd = ctx.cwd || process.cwd();

	// Gather metrics from existing scan data
	// For now, return a message explaining the feature
	// Full implementation would integrate with existing clients

	const files = getSourceFiles(cwd);

	return formatRateResult({
		overall: 0,
		fileCount: files.length,
		categories: [
			{
				name: "Type Safety",
				score: 0,
				icon: "🔷",
				issues: ["Run /lens-booboo to calculate"],
			},
			{
				name: "Complexity",
				score: 0,
				icon: "🧩",
				issues: ["Run /lens-booboo to calculate"],
			},
			{
				name: "Security",
				score: 0,
				icon: "🔒",
				issues: ["Run /lens-booboo to calculate"],
			},
			{
				name: "Architecture",
				score: 0,
				icon: "🏗️",
				issues: ["Run /lens-booboo to calculate"],
			},
			{
				name: "Dead Code",
				score: 0,
				icon: "🗑️",
				issues: ["Run /lens-booboo to calculate"],
			},
			{
				name: "Tests",
				score: 0,
				icon: "✅",
				issues: ["Run /lens-booboo to calculate"],
			},
		],
	});
}

function getSourceFiles(dir: string): string[] {
	const files: string[] = [];
	try {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);
			if (
				entry.isDirectory() &&
				!entry.name.startsWith(".") &&
				entry.name !== "node_modules"
			) {
				files.push(...getSourceFiles(fullPath));
			} else if (
				entry.isFile() &&
				/\.(ts|tsx|js|jsx|py|go|rs)$/.test(entry.name) &&
				!entry.name.endsWith(".test.ts") &&
				!entry.name.endsWith(".test.js")
			) {
				files.push(fullPath);
			}
		}
	} catch {
		// Ignore permission errors
	}
	return files;
}
