import * as fs from "node:fs";
import * as path from "node:path";
import { RUNTIME_CONFIG } from "./runtime-config.js";
import { resolveRunnerPath, toRunnerDisplayPath } from "./dispatch/runner-context.js";
import type { CacheManager } from "./cache-manager.js";
import type { DependencyChecker } from "./dependency-checker.js";
import type { JscpdClient } from "./jscpd-client.js";
import type { RuntimeCoordinator } from "./runtime-coordinator.js";

interface TurnEndDeps {
	ctxCwd?: string;
	getFlag: (name: string) => boolean | string | undefined;
	dbg: (msg: string) => void;
	runtime: RuntimeCoordinator;
	cacheManager: CacheManager;
	jscpdClient: JscpdClient;
	depChecker: DependencyChecker;
	resetLSPService: () => void;
	resetFormatService: () => void;
}

function capTurnEndMessage(content: string): string {
	const maxLines = RUNTIME_CONFIG.turnEnd.maxLines;
	const maxChars = RUNTIME_CONFIG.turnEnd.maxChars;

	let out = content;
	const lines = out.split("\n");
	if (lines.length > maxLines) {
		out = `${lines.slice(0, maxLines).join("\n")}\n... (truncated)`;
	}
	if (out.length > maxChars) {
		out = `${out.slice(0, maxChars)}\n... (truncated)`;
	}

	return out;
}

export async function handleTurnEnd(deps: TurnEndDeps): Promise<void> {
	const {
		ctxCwd,
		getFlag,
		dbg,
		runtime,
		cacheManager,
		jscpdClient,
		depChecker,
		resetLSPService,
		resetFormatService,
	} = deps;

	const cwd = ctxCwd ?? process.cwd();
	const turnState = cacheManager.readTurnState(cwd);
	const files = Object.keys(turnState.files);

	if (files.length === 0) {
		if (getFlag("lens-lsp")) {
			resetLSPService();
		}
		resetFormatService();
		return;
	}

	dbg(
		`turn_end: ${files.length} file(s) modified, cycles: ${turnState.turnCycles}/${turnState.maxCycles}`,
	);

	if (cacheManager.isMaxCyclesExceeded(cwd)) {
		dbg("turn_end: max cycles exceeded, clearing state and forcing through");
		cacheManager.clearTurnState(cwd);
		runtime.fixedThisTurn.clear();
		resetFormatService();
		return;
	}

	const blockerParts: string[] = [];

	if (runtime.lastCascadeOutput) {
		blockerParts.push(runtime.consumeLastCascadeOutput());
	}

	if (await jscpdClient.ensureAvailable()) {
		const jscpdFiles = cacheManager.getFilesForJscpd(cwd);
		if (jscpdFiles.length > 0) {
			dbg(`turn_end: jscpd scanning ${jscpdFiles.length} file(s)`);
			const result = jscpdClient.scan(cwd);
			const jscpdFileSet = new Set(
				jscpdFiles.map((f) => resolveRunnerPath(cwd, f)),
			);
			const filtered = result.clones.filter((clone) => {
				const resolvedA = resolveRunnerPath(cwd, clone.fileA);
				const resolvedB = resolveRunnerPath(cwd, clone.fileB);
				if (!fs.existsSync(resolvedA) || !fs.existsSync(resolvedB)) {
					return false;
				}

				const stateA = cacheManager.getTurnFileState(resolvedA, cwd);
				const stateB = cacheManager.getTurnFileState(resolvedB, cwd);

				const matchA =
					jscpdFileSet.has(resolvedA) &&
					!!stateA &&
					cacheManager.isLineInModifiedRange(clone.startA, stateA.modifiedRanges);

				const matchB =
					jscpdFileSet.has(resolvedB) &&
					!!stateB &&
					cacheManager.isLineInModifiedRange(clone.startB, stateB.modifiedRanges);

				return matchA || matchB;
			});
			if (filtered.length > 0) {
				let report = `🔴 New duplicates in modified code:\n`;
				for (const clone of filtered.slice(0, 5)) {
					const displayA = toRunnerDisplayPath(cwd, clone.fileA);
					const displayB = toRunnerDisplayPath(cwd, clone.fileB);
					report += `  ${displayA}:${clone.startA} ↔ ${displayB}:${clone.startB} (${clone.lines} lines)\n`;
				}
				blockerParts.push(report);
			}
			cacheManager.writeCache("jscpd", result, cwd);
		}
	}

	if (await depChecker.ensureAvailable()) {
		const madgeFiles = cacheManager.getFilesForMadge(cwd);
		if (madgeFiles.length > 0) {
			dbg(
				`turn_end: madge checking ${madgeFiles.length} file(s) for circular deps`,
			);
			for (const file of madgeFiles) {
				const absPath = path.resolve(cwd, file);
				const depResult = depChecker.checkFile(absPath);
				if (depResult.hasCircular && depResult.circular.length > 0) {
					const circularDeps = depResult.circular
						.flatMap((d) => d.path)
						.filter((p: string) => !absPath.endsWith(path.basename(p)));
					const uniqueDeps = [...new Set(circularDeps)];
					if (uniqueDeps.length > 0) {
						dbg(
							`turn_end: circular dependency note for ${file} (suppressed in blockers-only mode)`,
						);
					}
				}
			}
		}
	}

	if (runtime.errorDebtBaseline && files.length > 0) {
		dbg("turn_end: marking error debt check for next session");
		cacheManager.writeCache(
			"errorDebt",
			{
				pendingCheck: true,
				baselineTestsPassed: runtime.errorDebtBaseline.testsPassed,
			},
			cwd,
		);
	}

	// Session summaries are intentionally suppressed at turn_end to avoid
	// distracting the agent with non-blocking telemetry.

	cacheManager.incrementTurnCycle(cwd);

	if (blockerParts.length > 0) {
		dbg(
			`turn_end: ${blockerParts.length} blocker section(s) found, persisting for next context`,
		);
		const content = capTurnEndMessage(blockerParts.join("\n\n"));
		cacheManager.writeCache("turn-end-findings", { content }, cwd);
	} else {
		cacheManager.clearTurnState(cwd);
	}

	runtime.fixedThisTurn.clear();
	resetFormatService();
}
