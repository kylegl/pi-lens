import * as fs from "node:fs";
import * as path from "node:path";

export const ESLINT_CONFIGS = [
	".eslintrc",
	".eslintrc.js",
	".eslintrc.cjs",
	".eslintrc.json",
	".eslintrc.yaml",
	".eslintrc.yml",
	"eslint.config.js",
	"eslint.config.mjs",
	"eslint.config.cjs",
];

export function hasEslintConfig(cwd: string): boolean {
	for (const cfg of ESLINT_CONFIGS) {
		if (fs.existsSync(path.join(cwd, cfg))) return true;
	}
	try {
		const pkg = JSON.parse(
			fs.readFileSync(path.join(cwd, "package.json"), "utf-8"),
		);
		if (pkg.eslintConfig) return true;
	} catch {}
	return false;
}

export function findEslintBin(cwd: string): string {
	const isWin = process.platform === "win32";
	const local = path.join(
		cwd,
		"node_modules",
		".bin",
		isWin ? "eslint.cmd" : "eslint",
	);
	if (fs.existsSync(local)) return local;
	return "eslint";
}
