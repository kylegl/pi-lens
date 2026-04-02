/**
 * Test: import the actual ast-grep-napi runner and run it against project files.
 */
import * as path from "node:path";
import type {
	DispatchContext,
	RunnerResult,
} from "./clients/dispatch/types.js";

// Import the runner
const runnerModule = await import(
	"./clients/dispatch/runners/ast-grep-napi.js"
);
const runner = runnerModule.default;

const FILES = [
	"clients/latency-logger.ts",
	"clients/pipeline.ts",
	"clients/biome-client.ts",
	"clients/formatters.ts",
	"clients/dispatch/dispatcher.ts",
	"clients/lsp/server.ts",
	"clients/typescript-client.ts",
	"index.ts",
];

const cwd = process.cwd();

console.log(`Running ast-grep-napi runner on ${FILES.length} files...\n`);

let totalDiags = 0;
const diagsByRule = new Map<string, number>();

for (const file of FILES) {
	const filePath = path.resolve(cwd, file);
	const ctx = {
		filePath,
		cwd,
		pi: { getFlag: () => undefined } as any,
		blockingOnly: false,
		baselines: undefined as any,
	} as DispatchContext;

	const result: RunnerResult = await runner.run(ctx);

	if (result.diagnostics.length > 0) {
		console.log(
			`📄 ${file} — ${result.diagnostics.length} diagnostics (${result.semantic})`,
		);
		for (const d of result.diagnostics.slice(0, 5)) {
			console.log(`   L${d.line}: ${d.message}`);
			const rule = d.rule ?? "unknown";
			diagsByRule.set(rule, (diagsByRule.get(rule) ?? 0) + 1);
		}
		if (result.diagnostics.length > 5) {
			console.log(`   ... and ${result.diagnostics.length - 5} more`);
			for (const d of result.diagnostics.slice(5)) {
				const rule = d.rule ?? "unknown";
				diagsByRule.set(rule, (diagsByRule.get(rule) ?? 0) + 1);
			}
		}
		totalDiags += result.diagnostics.length;
	} else {
		console.log(`✅ ${file} — clean`);
	}
}

console.log(`\n${"=".repeat(60)}`);
console.log(`Total: ${totalDiags} diagnostics`);
console.log(`\nBy rule:`);
const sorted = [...diagsByRule.entries()].sort((a, b) => b[1] - a[1]);
for (const [rule, count] of sorted) {
	console.log(`  ${rule}: ${count}`);
}
