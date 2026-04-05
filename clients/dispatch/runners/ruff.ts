/**
 * Ruff runner for dispatch system
 *
 * Ruff handles both formatting and linting for Python files.
 * Supports venv-local installations.
 */

import { ensureTool } from "../../installer/index.js";
import { safeSpawnAsync } from "../../safe-spawn.js";
import { stripAnsi } from "../../sanitize.js";
import type {
	DispatchContext,
	RunnerDefinition,
	RunnerResult,
} from "../types.js";
import { parseRuffOutput } from "./utils/diagnostic-parsers.js";
import { createAvailabilityChecker } from "./utils/runner-helpers.js";

const ruff = createAvailabilityChecker("ruff", ".exe");

const ruffRunner: RunnerDefinition = {
	id: "ruff-lint",
	appliesTo: ["python"],
	priority: 10,
	enabledByDefault: true,

	async run(ctx: DispatchContext): Promise<RunnerResult> {
		const cwd = ctx.cwd || process.cwd();

		// Auto-install ruff if not available (it's one of the 4 auto-install tools)
		if (!ruff.isAvailable(cwd)) {
			const installed = await ensureTool("ruff");
			if (!installed) {
				return { status: "skipped", diagnostics: [], semantic: "none" };
			}
		}

		// No --fix here: dispatch runners report issues for agent understanding,
		// not silent correction. Auto-fix (ruff --fix) already runs in the
		// format phase before dispatch, handling all safe style transforms.
		// Silently rewriting here would leave the agent's context window stale.
		const args = ["check", ctx.filePath];

		const result = await safeSpawnAsync(ruff.getCommand()!, args, {
			timeout: 30000,
		});

		const raw = stripAnsi(result.stdout + result.stderr);

		if (result.status === 0) {
			return { status: "succeeded", diagnostics: [], semantic: "none" };
		}

		// Parse diagnostics
		const diagnostics = parseRuffOutput(raw, ctx.filePath);

		return {
			status: "failed",
			diagnostics,
			semantic: "warning",
		};
	},
};

export default ruffRunner;
