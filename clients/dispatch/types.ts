/**
 * Types for declarative tool dispatch system
 *
 * Inspired by pi-formatter's dispatch.ts but adapted for pi-lens's
 * lint-focused workflow (vs formatting workflow).
 */

import type { FileKind } from "../file-kinds.js";

// --- API Interface ---

/** Minimal interface for pi agent API features we use */
export interface PiAgentAPI {
	getFlag(flag: string): boolean;
}

// --- Output Types ---

export interface LintOutput {
	/** Primary output message (formatted for display) */
	output: string;
	/** Whether this output represents an error (hard stop) */
	isError: boolean;
	/** Whether this output represents a warning (soft stop) */
	isWarning: boolean;
	/** Whether auto-fix was applied */
	autofixed?: boolean;
	/** Optional hint to show user */
	hint?: string;
}

export interface RunnerResult {
	/** Whether the runner ran successfully */
	status: "succeeded" | "failed" | "skipped";
	/** Output to display */
	output: string;
	/** Tool-specific metrics (optional) */
	metrics?: Record<string, number>;
}

// --- Runner Context ---

export interface DispatchContext {
	/** Current file being processed */
	readonly filePath: string;
	/** Project root */
	readonly cwd: string;
	/** Detected file kind */
	readonly kind: FileKind | undefined;
	/** Pi agent API */
	readonly pi: PiAgentAPI;
	/** Whether autofix is enabled */
	readonly autofix: boolean;
	/** Whether delta mode is enabled (only show new issues) */
	readonly deltaMode: boolean;

	/** Check if a tool is available */
	hasTool(command: string): Promise<boolean>;
	/** Get available tools */
	getAvailableTools(): string[];
	/** Log a message */
	log(message: string): void;
}

// --- Runner Definition ---

export type RunnerMode = "all" | "fallback" | "first-success";

export interface RunnerDefinition {
	/** Unique identifier for this runner */
	id: string;
	/** File kinds this runner applies to */
	appliesTo: FileKind[];
	/** Priority (lower = runs first) */
	priority?: number;
	/** Whether this runner should be enabled by default */
	enabledByDefault?: boolean;
	/** Optional condition for when to run */
	when?: (ctx: DispatchContext) => Promise<boolean> | boolean;
	/** Execute the runner */
	run(ctx: DispatchContext): Promise<RunnerResult>;
}

export interface RunnerGroup {
	mode: RunnerMode;
	/** Runners in this group */
	runnerIds: string[];
	/** Optional filter for file kinds */
	filterKinds?: FileKind[];
}

// --- Plan Configuration ---

export interface ToolPlan {
	/** Tool name for display */
	name: string;
	/** Groups of runners to execute */
	groups: RunnerGroup[];
}

// --- Dispatch Options ---

export interface DispatchOptions {
	/** Maximum output length */
	maxOutputLength?: number;
	/** Include fixed issues in output */
	showFixed?: boolean;
	/** Stop on first error */
	stopOnError?: boolean;
}

// --- Registry ---

export interface RunnerRegistry {
	register(runner: RunnerDefinition): void;
	get(id: string): RunnerDefinition | undefined;
	getForKind(kind: FileKind): RunnerDefinition[];
	list(): RunnerDefinition[];
}
