import {
	type Diagnostic,
	DiagnosticFound,
	FileModified,
	type OutputSemantic,
	ReportReady,
	RunnerCompleted,
	RunnerStarted,
} from "../bus/events.js";
import { formatDiagnostics } from "./utils/format-utils.js";
// Import runners to register them
import "./runners/index.js";

import type {
	DispatchContext,
	RunnerDefinition,
	RunnerGroup,
	RunnerResult,
} from "./types.js";

// --- Enhanced Dispatch Result ---

export interface BusDispatchResult {
	diagnostics: Diagnostic[];
	blockers: Diagnostic[];
	warnings: Diagnostic[];
	fixed: Diagnostic[];
	silent: Diagnostic[];
	output: string;
	hasBlockers: boolean;
	durationMs: number;
	runnerResults: Array<{
		runnerId: string;
		status: "succeeded" | "failed" | "skipped" | "completed";
		durationMs: number;
		diagnosticCount: number;
	}>;
}

// --- Core Functions ---

async function runRunner(
	ctx: DispatchContext,
	runner: RunnerDefinition,
	defaultSemantic: OutputSemantic,
): Promise<RunnerResult & { durationMs: number }> {
	const startTime = Date.now();

	// Publish runner started event
	RunnerStarted.publish({
		runnerId: runner.id,
		filePath: ctx.filePath,
		timestamp: startTime,
	});

	try {
		// Check when() condition async-safely (sync filter in caller can't await Promises)
		if (runner.when && !(await runner.when(ctx))) {
			return {
				status: "skipped",
				diagnostics: [],
				semantic: defaultSemantic,
				durationMs: Date.now() - startTime,
			};
		}
		const result = await runner.run(ctx);
		const durationMs = Date.now() - startTime;

		// Publish diagnostic found event
		if (result.diagnostics.length > 0) {
			DiagnosticFound.publish({
				runnerId: runner.id,
				filePath: ctx.filePath,
				diagnostics: result.diagnostics,
				durationMs,
			});
		}

		// Publish runner completed event
		// Map "succeeded" to "completed" for the event status
		const eventStatus =
			result.status === "succeeded" ? "completed" : result.status;
		RunnerCompleted.publish({
			runnerId: runner.id,
			filePath: ctx.filePath,
			status: eventStatus,
			durationMs,
			diagnosticCount: result.diagnostics.length,
		});

		return {
			...result,
			semantic: result.semantic ?? defaultSemantic,
			durationMs,
		};
	} catch (error) {
		const durationMs = Date.now() - startTime;
		ctx.log?.(`Runner ${runner.id} failed: ${error}`);

		RunnerCompleted.publish({
			runnerId: runner.id,
			filePath: ctx.filePath,
			status: "failed",
			durationMs,
			diagnosticCount: 0,
		});

		return {
			status: "failed",
			diagnostics: [],
			semantic: defaultSemantic,
			durationMs,
		};
	}
}

// --- Concurrent Dispatch (new feature) ---

export async function dispatchConcurrent(
	ctx: DispatchContext,
	groups: RunnerGroup[],
): Promise<BusDispatchResult> {
	const startTime = Date.now();
	const allDiagnostics: Diagnostic[] = [];
	const runnerResults: BusDispatchResult["runnerResults"] = [];
	let stopped = false;

	for (const group of groups) {
		if (stopped && ctx.pi.getFlag("stop-on-error")) {
			break;
		}

		// Get applicable runners
		const { getRunner } = await import("./dispatcher.js");
		const runnerIds = group.filterKinds
			? group.runnerIds.filter((id) => {
					const runner = getRunner(id);
					return runner && ctx.kind && group.filterKinds?.includes(ctx.kind);
				})
			: group.runnerIds;

		// Note: when() is async — must be awaited. Filter it out here synchronously
		// (runners without when always run; runners with when are checked inside runRunner).
		const runners = runnerIds
			.map((id) => getRunner(id))
			.filter((r): r is RunnerDefinition => r !== undefined);

		const semantic = group.semantic ?? "warning";

		if (group.mode === "all") {
			// Run all runners concurrently
			const results = await Promise.all(
				runners.map((runner) => runRunner(ctx, runner, semantic)),
			);

			for (const result of results) {
				runnerResults.push({
					runnerId: runners[results.indexOf(result)].id,
					status: result.status === "succeeded" ? "completed" : result.status,
					durationMs: result.durationMs,
					diagnosticCount: result.diagnostics.length,
				});
				allDiagnostics.push(...result.diagnostics);

				if (semantic === "blocking" && result.diagnostics.length > 0) {
					stopped = true;
				}
			}
		} else if (group.mode === "fallback") {
			// Run sequentially until first success
			for (const runner of runners) {
				const result = await runRunner(ctx, runner, semantic);
				runnerResults.push({
					runnerId: runner.id,
					status: result.status === "succeeded" ? "completed" : result.status,
					durationMs: result.durationMs,
					diagnosticCount: result.diagnostics.length,
				});
				allDiagnostics.push(...result.diagnostics);

				if (result.diagnostics.length === 0 || result.semantic === "fixed") {
					break;
				}
			}
		}
	}

	// Categorize results
	const blockers = allDiagnostics.filter((d) => d.semantic === "blocking");
	const warnings = allDiagnostics.filter(
		(d) => d.semantic === "warning" || d.semantic === "none",
	);
	const fixedItems = allDiagnostics.filter((d) => d.semantic === "fixed");
	const silentItems = allDiagnostics.filter((d) => d.semantic === "silent");

	// Format output
	let output = formatDiagnostics(blockers, "blocking");
	output += formatDiagnostics(fixedItems, "fixed");

	const durationMs = Date.now() - startTime;

	// Publish report ready event
	ReportReady.publish({
		filePath: ctx.filePath,
		report: {
			blockers,
			warnings,
			fixed: fixedItems,
			silent: silentItems,
		},
		durationMs,
	});

	return {
		diagnostics: allDiagnostics,
		blockers,
		warnings,
		fixed: fixedItems,
		silent: silentItems,
		output,
		hasBlockers: blockers.length > 0,
		durationMs,
		runnerResults,
	};
}

// --- Simple Integration Helper ---

export async function dispatchLintWithBus(
	filePath: string,
	cwd: string,
	pi: {
		getFlag(flag: string): string | boolean | undefined;
		log?: (msg: string) => void;
	},
): Promise<string> {
	const { createDispatchContext } = await import("./dispatcher.js");
	const { getRunnersForKind } = await import("./dispatcher.js");
	const { TOOL_PLANS } = await import("./plan.js");

	// Publish file modified event to trigger any background processing
	FileModified.publish({
		filePath,
		changeType: "external",
	});

	// blockingOnly=true: post-write dispatch only reports blocking errors (same as standard dispatchLint)
	const ctx = createDispatchContext(filePath, cwd, pi, undefined, true);

	const kind = ctx.kind;
	if (!kind) return "";

	const plan = TOOL_PLANS[kind];
	if (!plan) return "";

	const result = await dispatchConcurrent(ctx, plan.groups);
	return result.output;
}
