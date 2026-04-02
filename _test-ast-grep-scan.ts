/**
 * Quick script to run ast-grep-napi YAML rules against project files
 * and identify false positives.
 *
 * Usage: npx tsx _test-ast-grep-scan.ts
 */

// We'll use the CLI approach since the runner is embedded in the extension
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const RULES_DIR = path.join(
	import.meta.dirname ?? ".",
	"rules",
	"ast-grep-rules",
	"rules",
);
const TARGET_FILES = [
	"clients/latency-logger.ts",
	"clients/pipeline.ts",
	"clients/biome-client.ts",
	"clients/complexity-client.ts",
	"clients/formatters.ts",
	"clients/cache-manager.ts",
	"clients/safe-spawn.ts",
	"clients/file-kinds.ts",
	"clients/dispatch/dispatcher.ts",
	"clients/lsp/server.ts",
	"clients/lsp/launch.ts",
	"clients/typescript-client.ts",
	"clients/test-runner-client.ts",
	"index.ts",
	"commands/booboo.ts",
];

interface Finding {
	rule: string;
	file: string;
	line: number;
	message: string;
	matchText: string;
}

async function main() {
	// Check if ast-grep CLI is available
	let sgBin: string;
	try {
		execSync("ast-grep --version", { stdio: "pipe" });
		sgBin = "ast-grep";
	} catch {
		const localBin = path.join(
			".",
			".pi-lens",
			"tools",
			"node_modules",
			".bin",
			"ast-grep",
		);
		if (fs.existsSync(localBin) || fs.existsSync(localBin + ".cmd")) {
			sgBin = localBin;
		} else {
			console.error("ast-grep not found");
			process.exit(1);
		}
	}

	// Get all rule files
	const ruleFiles = fs.readdirSync(RULES_DIR).filter((f) => f.endsWith(".yml"));
	console.log(`Found ${ruleFiles.length} rules in ${RULES_DIR}`);
	console.log(`Scanning ${TARGET_FILES.length} files\n`);

	const findings: Finding[] = [];

	for (const file of TARGET_FILES) {
		if (!fs.existsSync(file)) {
			console.log(`⏭️  ${file} — not found, skipping`);
			continue;
		}

		try {
			const result = execSync(
				`${sgBin} scan --rule "${RULES_DIR.replace(/\\/g, "/")}" "${file}" --json 2>/dev/null`,
				{ encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] },
			);

			if (result.trim()) {
				const matches = JSON.parse(result);
				for (const m of matches) {
					findings.push({
						rule: m.ruleId ?? m.rule_id ?? "unknown",
						file,
						line: m.range?.start?.line ?? m.start?.line ?? 0,
						message: m.message ?? "",
						matchText: (m.text ?? m.matchedText ?? "").substring(0, 80),
					});
				}
			}
		} catch (e: any) {
			// ast-grep returns exit code 1 when matches found
			if (e.stdout) {
				try {
					const matches = JSON.parse(e.stdout);
					for (const m of matches) {
						findings.push({
							rule: m.ruleId ?? m.rule_id ?? "unknown",
							file,
							line: (m.range?.start?.line ?? 0) + 1,
							message: m.message ?? "",
							matchText: (m.text ?? m.matchedText ?? "").substring(0, 80),
						});
					}
				} catch {
					console.log(`⚠️  ${file} — parse error`);
				}
			}
		}
	}

	// Group by rule
	const byRule = new Map<string, Finding[]>();
	for (const f of findings) {
		const list = byRule.get(f.rule) ?? [];
		list.push(f);
		byRule.set(f.rule, list);
	}

	console.log(`\n${"=".repeat(80)}`);
	console.log(
		`RESULTS: ${findings.length} total findings across ${byRule.size} rules`,
	);
	console.log(`${"=".repeat(80)}\n`);

	// Sort by count descending (most hits = most likely false positives)
	const sorted = [...byRule.entries()].sort(
		(a, b) => b[1].length - a[1].length,
	);

	for (const [rule, hits] of sorted) {
		const uniqueFiles = new Set(hits.map((h) => h.file)).size;
		console.log(`\n📋 ${rule} — ${hits.length} hits in ${uniqueFiles} file(s)`);
		console.log(`   Message: ${hits[0].message}`);
		// Show first 5 examples
		for (const h of hits.slice(0, 5)) {
			console.log(`   L${h.line} ${h.file}: ${h.matchText}`);
		}
		if (hits.length > 5) {
			console.log(`   ... and ${hits.length - 5} more`);
		}
	}
}

main().catch(console.error);
