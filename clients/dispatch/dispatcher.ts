/**
 * Declarative tool dispatcher
 *
 * Replaces the 500+ lines of if/else in index.ts's tool_result handler
 * with a declarative, config-driven approach.
 *
 * Based on pi-formatter's dispatch.ts pattern but adapted for pi-lens's
 * lint-focused workflow.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import type {
	DispatchContext,
	RunnerDefinition,
	RunnerGroup,
	RunnerResult,
	RunnerRegistry,
	DispatchOptions,
} from "./types.js";
import { TOOL_PLANS } from "./plan.js";
import { detectFileKind, isFileKind, type FileKind } from "../file-kinds.js";

// --- Runner Registry ---

const globalRegistry: Map<string, RunnerDefinition> = new Map();

export function registerRunner(runner: RunnerDefinition): void {
	if (globalRegistry.has(runner.id)) {
		console.error(`[dispatch] Duplicate runner registration: ${runner.id}`);
		return;
	}
	globalRegistry.set(runner.id, runner);
}

export function getRunner(id: string): RunnerDefinition | undefined {
	return globalRegistry.get(id);
}

export function getRunnersForKind(kind: FileKind): RunnerDefinition[] {
	const runners: RunnerDefinition[] = [];
	for (const runner of globalRegistry.values()) {
		if (runner.appliesTo.includes(kind) || runner.appliesTo.length === 0) {
			runners.push(runner);
		}
	}
	return runners.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

export function listRunners(): RunnerDefinition[] {
	return Array.from(globalRegistry.values());
}

// --- Tool Availability Cache ---

const toolCache: Map<string, boolean> = new Map();

function checkToolAvailability(command: string): boolean {
	if (toolCache.has(command)) {
		return toolCache.get(command)!;
	}

	const result = spawnSync(command, ["--version"], {
		encoding: "utf-8",
		timeout: 5000,
		shell: true,
	});

	const available = !result.error && result.status === 0;
	toolCache.set(command, available);
	return available;
}

// --- Dispatch Context Factory ---

export function createDispatchContext(
	filePath: string,
	cwd: string,
	pi: { getFlag: (flag: string) => boolean },
): DispatchContext {
	const kind = detectFileKind(filePath);

	return {
		filePath,
		cwd,
		kind,
		pi,
		autofix: pi.getFlag("autofix-biome") || pi.getFlag("autofix-ruff"),
		deltaMode: !pi.getFlag("no-delta"),

		async hasTool(command: string): Promise<boolean> {
			return checkToolAvailability(command);
		},

		getAvailableTools(): string[] {
			return Array.from(toolCache.entries())
				.filter(([, v]) => v)
				.map(([k]) => k);
		},

		log(message: string): void {
			console.error(`[dispatch] ${message}`);
		},
	};
}

// --- Dispatch Logic ---

const DEFAULT_OPTIONS: DispatchOptions = {
	maxOutputLength: 5000,
	showFixed: true,
	stopOnError: true,
};

/**
 * Dispatch linting tools for a file based on its kind
 */
export async function dispatchForFile(
	ctx: DispatchContext,
	options: Partial<DispatchOptions> = {},
): Promise<string> {
	const opts = { ...DEFAULT_OPTIONS, ...options };

	if (!ctx.kind) {
		return ""; // Unsupported file kind
	}

	const plan = TOOL_PLANS[ctx.kind];
	if (!plan) {
		return "";
	}

	let output = "";
	let stopped = false;

	for (const group of plan.groups) {
		if (stopped && opts.stopOnError) {
			break;
		}

		// Filter runners by kind if specified
		const runnerIds = group.filterKinds
			? group.runnerIds.filter((id) => {
					const r = getRunner(id);
					return r && group.filterKinds!.includes(ctx.kind!);
				})
			: group.runnerIds;

		const groupOutput = await runRunnerGroup(ctx, runnerIds, group.mode);
		output += groupOutput;

		// Check if we should stop
		if (output.includes("🔴 STOP") && opts.stopOnError) {
			stopped = true;
		}
	}

	// Truncate if needed
	const maxLen = opts.maxOutputLength ?? 5000;
	if (output.length > maxLen) {
		output = output.substring(0, maxLen - 100) + "\n... (output truncated)";
	}

	return output;
}

/**
 * Run a group of runners based on mode
 */
async function runRunnerGroup(
	ctx: DispatchContext,
	runnerIds: string[],
	mode: RunnerGroup["mode"],
): Promise<string> {
	if (runnerIds.length === 0) {
		return "";
	}

	switch (mode) {
		case "all": {
			// Run all runners, collect all output
			let output = "";
			for (const id of runnerIds) {
				const result = await runSingleRunner(ctx, id);
				output += result.output;
			}
			return output;
		}

		case "fallback": {
			// Run first available runner
			for (const id of runnerIds) {
				const runner = getRunner(id);
				if (!runner) continue;

				let available = false;
				if (runner.when) {
					available = await runner.when(ctx);
				} else {
					available = await ctx.hasTool(id);
				}

				if (available) {
					const result = await runSingleRunner(ctx, id);
					return result.output;
				}
			}
			return "";
		}

		case "first-success": {
			// Run until one succeeds
			for (const id of runnerIds) {
				const result = await runSingleRunner(ctx, id);
				if (result.status === "succeeded") {
					return result.output;
				}
			}
			return "";
		}

		default:
			return "";
	}
}

/**
 * Run a single runner
 */
async function runSingleRunner(
	ctx: DispatchContext,
	runnerId: string,
): Promise<RunnerResult> {
	const runner = getRunner(runnerId);
	if (!runner) {
		return { status: "skipped", output: "" };
	}

	// Check preconditions
	if (runner.when && !(await runner.when(ctx))) {
		return { status: "skipped", output: "" };
	}

	try {
		const result = await runner.run(ctx);
		return result;
	} catch (error) {
		ctx.log(`Runner ${runnerId} failed: ${error}`);
		return {
			status: "failed",
			output: `Runner ${runnerId} failed: ${error}`,
		};
	}
}

// --- Architectural Rules Integration ---

/**
 * Check architectural rules for a file
 */
export async function checkArchitecturalRules(
	ctx: DispatchContext,
	rules: Array<{
		pattern: string;
		message: string;
	}>,
): Promise<string> {
	if (!ctx.kind) return "";

	let output = "";

	try {
		const content = fs.readFileSync(ctx.filePath, "utf-8");

		for (const rule of rules) {
			const regex = new RegExp(rule.pattern, "gi");
			const match = regex.exec(content);

			if (match) {
				const lineNum = content.slice(0, match.index).split("\n").length;
				output += `\n🔴 STOP — Architectural violation:\n`;
				output += `  L${lineNum}: ${rule.message}\n`;
			}
		}
	} catch {
		// File doesn't exist or can't be read
	}

	return output;
}

// --- Export registry factory ---

export function createRegistry(): RunnerRegistry {
	const registry = new Map<string, RunnerDefinition>();

	return {
		register(runner: RunnerDefinition): void {
			if (registry.has(runner.id)) {
				throw new Error(`Duplicate runner: ${runner.id}`);
			}
			registry.set(runner.id, runner);
		},

		get(id: string): RunnerDefinition | undefined {
			return registry.get(id);
		},

		getForKind(kind: FileKind): RunnerDefinition[] {
			const runners: RunnerDefinition[] = [];
			for (const runner of registry.values()) {
				if (runner.appliesTo.includes(kind)) {
					runners.push(runner);
				}
			}
			return runners;
		},

		list(): RunnerDefinition[] {
			return Array.from(registry.values());
		},
	};
}
