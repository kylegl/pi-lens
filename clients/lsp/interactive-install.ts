/**
 * Interactive LSP Installer
 * 
 * Provides lazy auto-install with user prompt for common languages.
 * 
 * Features:
 * - 30-second timeout with auto-accept
 * - --auto-install flag for non-interactive mode
 * - User choice caching per project
 * - Only prompts for "common" languages (Go, Rust, YAML, JSON, Bash)
 */

import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";

// Languages that support interactive auto-install prompt
const COMMON_LANGUAGES: Record<string, {
	toolId: string;
	toolName: string;
	installCommand: string;
	packageName: string;
}> = {
	go: {
		toolId: "gopls",
		toolName: "Go Language Server (gopls)",
		installCommand: "go install golang.org/x/tools/gopls@latest",
		packageName: "golang.org/x/tools/gopls",
	},
	rust: {
		toolId: "rust-analyzer",
		toolName: "Rust Language Server (rust-analyzer)",
		installCommand: "rustup component add rust-analyzer",
		packageName: "rust-analyzer",
	},
	yaml: {
		toolId: "yaml-language-server",
		toolName: "YAML Language Server",
		installCommand: "npm install -g yaml-language-server",
		packageName: "yaml-language-server",
	},
	json: {
		toolId: "vscode-json-languageserver",
		toolName: "JSON Language Server",
		installCommand: "npm install -g vscode-langservers-extracted",
		packageName: "vscode-langservers-extracted",
	},
	bash: {
		toolId: "bash-language-server",
		toolName: "Bash Language Server",
		installCommand: "npm install -g bash-language-server",
		packageName: "bash-language-server",
	},
};

interface InstallChoice {
	choice: "yes" | "no" | "auto";
	timestamp: number;
}

/**
 * Get the cache file path for install choices
 */
function getCachePath(cwd: string): string {
	return path.join(cwd, ".pi-lens", "install-choices.json");
}

/**
 * Read cached install choices
 */
async function readChoices(cwd: string): Promise<Record<string, InstallChoice>> {
	try {
		const cachePath = getCachePath(cwd);
		const content = await fs.readFile(cachePath, "utf-8");
		return JSON.parse(content);
	} catch {
		return {};
	}
}

/**
 * Save install choice to cache
 */
async function saveChoice(
	cwd: string,
	toolId: string,
	choice: "yes" | "no" | "auto"
): Promise<void> {
	const choices = await readChoices(cwd);
	choices[toolId] = { choice, timestamp: Date.now() };
	
	try {
		const cachePath = getCachePath(cwd);
		await fs.mkdir(path.dirname(cachePath), { recursive: true });
		await fs.writeFile(cachePath, JSON.stringify(choices, null, 2));
	} catch {
		// Ignore cache write errors
	}
}

/**
 * Prompt user with timeout
 */
function promptUser(timeoutMs: number): Promise<"yes" | "no"> {
	return new Promise((resolve) => {
		// Set up stdin for single char input
		process.stdin.setRawMode?.(true);
		process.stdin.resume();
		process.stdin.setEncoding("utf8");

		const onData = (data: Buffer | string) => {
			const char = data.toString().trim().toLowerCase();
			cleanup();
			
			if (char === "y" || char === "\n" || char === "\r") {
				resolve("yes");
			} else if (char === "n") {
				resolve("no");
			}
			// For any other input, auto-accept after timeout
		};

		process.stdin.on("data", onData);

		// Auto-accept after timeout
		const timeout = setTimeout(() => {
			cleanup();
			resolve("yes");
		}, timeoutMs);

		// Handle stdin closing
		process.stdin.on("end", () => {
			cleanup();
			resolve("yes");
		});

		function cleanup() {
			clearTimeout(timeout);
			process.stdin.removeListener("data", onData);
			process.stdin.setRawMode?.(false);
			process.stdin.pause();
		}
	});
}

/**
 * Check if --auto-install flag is set
 */
function isAutoInstallEnabled(): boolean {
	// Check environment variable or process arguments
	return process.env.PI_LENS_AUTO_INSTALL === "1" ||
		process.argv.includes("--auto-install");
}

/**
 * Attempt to install a tool
 */
async function installTool(toolId: string, packageName: string): Promise<boolean> {
	console.error(`[pi-lens] Installing ${toolId}...`);
	
	return new Promise((resolve) => {
		const proc = spawn("npm", ["install", "-g", packageName], {
			stdio: "inherit",
			shell: true,
		});

		proc.on("close", (code) => {
			if (code === 0) {
				console.error(`[pi-lens] ✓ ${toolId} installed successfully`);
				resolve(true);
			} else {
				console.error(`[pi-lens] ✗ ${toolId} installation failed (exit code ${code})`);
				resolve(false);
			}
		});

		proc.on("error", (err) => {
			console.error(`[pi-lens] ✗ ${toolId} installation error:`, err.message);
			resolve(false);
		});
	});
}

/**
 * Prompt user for installation with timeout, or auto-install if flag set
 * 
 * @param language - Language identifier (go, rust, yaml, json, bash)
 * @param cwd - Project root
 * @returns true if tool is/should be installed, false to skip
 */
export async function promptForInstall(
	language: string,
	cwd: string
): Promise<boolean> {
	const config = COMMON_LANGUAGES[language];
	if (!config) {
		// Not a common language, don't prompt
		return false;
	}

	// Check cache first
	const choices = await readChoices(cwd);
	const cached = choices[config.toolId];
	
	if (cached) {
		// Cache valid for 30 days
		const thirtyDays = 30 * 24 * 60 * 60 * 1000;
		if (Date.now() - cached.timestamp < thirtyDays) {
			if (cached.choice === "yes" || cached.choice === "auto") {
				return true;
			}
			return false;
		}
	}

	// Check auto-install flag
	if (isAutoInstallEnabled()) {
		console.error(`[pi-lens] Auto-install enabled, installing ${config.toolName}...`);
		await saveChoice(cwd, config.toolId, "auto");
		return await installTool(config.toolId, config.packageName);
	}

	// Show interactive prompt
	console.error(`\n⚠️  ${config.toolName} not found`);
	console.error(`   Install: ${config.installCommand}`);
	console.error(`\n   Install now? [Y/n] (auto-accepts in 30s)`);

	const answer = await promptUser(30000);
	await saveChoice(cwd, config.toolId, answer);

	if (answer === "yes") {
		return await installTool(config.toolId, config.packageName);
	}

	console.error(`[pi-lens] Skipped ${config.toolName} installation`);
	return false;
}

/**
 * Get install command for display purposes
 */
export function getInstallCommand(language: string): string | undefined {
	return COMMON_LANGUAGES[language]?.installCommand;
}

/**
 * Check if a language supports interactive install
 */
export function supportsInteractiveInstall(language: string): boolean {
	return language in COMMON_LANGUAGES;
}
