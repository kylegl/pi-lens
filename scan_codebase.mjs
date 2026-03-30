import * as fs from "node:fs";
import * as path from "node:path";

// Find all TS files
function findTsFiles(dir) {
	const files = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		
		// Skip node_modules, .git, etc
		if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === ".pi-lens") {
			continue;
		}
		
		if (entry.isDirectory()) {
			files.push(...findTsFiles(fullPath));
		} else if (entry.isFile() && fullPath.endsWith(".ts") && !fullPath.endsWith(".test.ts")) {
			files.push(fullPath);
		}
	}
	
	return files;
}

const tsFiles = findTsFiles(process.cwd());
console.log(`Found ${tsFiles.length} TypeScript files to scan\n`);

// Load the NAPI runner
const runner = (await import("./clients/dispatch/runners/ast-grep-napi.js")).default;

// Mock context
const createContext = (filePath) => ({
	filePath,
	cwd: process.cwd(),
	kind: "jsts",
	autofix: false,
	deltaMode: false,
	baselines: { get: () => [], add: () => {}, save: () => {} },
	pi: {},
	hasTool: async () => false,
	log: () => {},
});

// Scan all files
const allIssues = [];
let totalTime = 0;

for (let i = 0; i < tsFiles.length; i++) {
	const file = tsFiles[i];
	const ctx = createContext(file);
	
	const start = Date.now();
	const result = await runner.run(ctx);
	const elapsed = Date.now() - start;
	totalTime += elapsed;
	
	if (result.diagnostics.length > 0) {
		console.log(`\n${path.relative(process.cwd(), file)} (${elapsed}ms):`);
		for (const d of result.diagnostics) {
			console.log(`  Line ${d.line}: [${d.rule}] ${d.message.split('\n')[0]}`);
			allIssues.push({
				file: path.relative(process.cwd(), file),
				line: d.line,
				rule: d.rule,
				message: d.message.split('\n')[0],
			});
		}
	} else if (i % 10 === 0) {
		process.stdout.write(".");
	}
}

console.log(`\n\n=== SUMMARY ===`);
console.log(`Files scanned: ${tsFiles.length}`);
console.log(`Total time: ${totalTime}ms`);
console.log(`Issues found: ${allIssues.length}`);
console.log(`Avg time per file: ${(totalTime / tsFiles.length).toFixed(1)}ms`);

// Group by rule
const byRule = {};
for (const issue of allIssues) {
	byRule[issue.rule] = (byRule[issue.rule] || 0) + 1;
}

console.log(`\n=== BY RULE ===`);
for (const [rule, count] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
	console.log(`  ${rule}: ${count}`);
}

// Show top 10 files with most issues
const byFile = {};
for (const issue of allIssues) {
	byFile[issue.file] = (byFile[issue.file] || 0) + 1;
}

console.log(`\n=== TOP FILES WITH ISSUES ===`);
const topFiles = Object.entries(byFile)
	.sort((a, b) => b[1] - a[1])
	.slice(0, 10);
for (const [file, count] of topFiles) {
	console.log(`  ${file}: ${count} issues`);
}
