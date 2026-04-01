/**
 * Safe async cross-platform spawn utilities
 *
 * Replaces blocking spawnSync with async spawn + proper timeout handling.
 * Ensures processes are killed on timeout to prevent zombie processes.
 */

import { spawn } from "node:child_process";

export interface SpawnResult {
	stdout: string;
	stderr: string;
	status: number | null;
	error?: Error;
}

export interface SafeSpawnOptions {
	timeout?: number;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	signal?: AbortSignal;
}

/**
 * Async spawn with timeout and proper process cleanup.
 *
 * Unlike spawnSync, this:
 * - Doesn't block the event loop
 * - Kills the process on timeout (preventing zombies)
 * - Supports cancellation via AbortSignal
 */
export async function safeSpawnAsync(
	command: string,
	args: string[],
	options?: SafeSpawnOptions,
): Promise<SpawnResult> {
	const timeout = options?.timeout ?? 30000;
	const abortSignal = options?.signal;

	return new Promise((resolve) => {
		// Check for early abort
		if (abortSignal?.aborted) {
			resolve({
				stdout: "",
				stderr: "",
				status: null,
				error: new Error("Spawn aborted before start"),
			});
			return;
		}

		let stdout = "";
		let stderr = "";
		let timedOut = false;

		// Spawn the process (non-blocking)
		const child = spawn(command, args, {
			cwd: options?.cwd,
			env: options?.env,
			windowsHide: true,
			shell: false, // Always use args array (safer, no shell injection)
		});

		// Handle abort signal
		const onAbort = () => {
			if (!child.killed) {
				child.kill("SIGTERM");
				// Force kill after 1s if still running
				setTimeout(() => {
					if (!child.killed) {
						child.kill("SIGKILL");
					}
				}, 1000);
			}
		};
		abortSignal?.addEventListener("abort", onAbort, { once: true });

		// Collect output
		child.stdout?.setEncoding("utf-8");
		child.stderr?.setEncoding("utf-8");
		child.stdout?.on("data", (data) => (stdout += data));
		child.stderr?.on("data", (data) => (stderr += data));

		// Timeout handling - KILL the process, don't just abandon it
		const timeoutId = setTimeout(() => {
			timedOut = true;
			if (!child.killed) {
				child.kill("SIGTERM");
				// Force kill after 1s grace period
				setTimeout(() => {
					if (!child.killed) {
						child.kill("SIGKILL");
					}
				}, 1000);
			}
		}, timeout);

		// Process completion
		child.on("close", (code, signal) => {
			clearTimeout(timeoutId);
			abortSignal?.removeEventListener("abort", onAbort);

			if (timedOut) {
				resolve({
					stdout,
					stderr,
					status: null,
					error: new Error(
						`Process timed out after ${timeout}ms (signal: ${signal || "none"})`,
					),
				});
			} else if (signal) {
				resolve({
					stdout,
					stderr,
					status: null,
					error: new Error(`Process killed by signal: ${signal}`),
				});
			} else {
				resolve({ stdout, stderr, status: code });
			}
		});

		child.on("error", (err) => {
			clearTimeout(timeoutId);
			abortSignal?.removeEventListener("abort", onAbort);
			resolve({ stdout, stderr, status: null, error: err });
		});
	});
}

/**
 * Backward-compatible wrapper - for gradual migration.
 *
 * ⚠️ Deprecated: Use safeSpawnAsync instead to avoid blocking.
 * This maintains the old signature but internally uses async spawn.
 */
export function safeSpawn(
	command: string,
	args: string[],
	options?: SafeSpawnOptions,
): SpawnResult {
	// For now, keep the old behavior during migration
	// We'll replace callers gradually to avoid breaking changes
	const { spawnSync } = require("node:child_process");

	const result = spawnSync(command, args, {
		cwd: options?.cwd,
		env: options?.env,
		timeout: options?.timeout,
		encoding: "utf-8",
		shell: false,
		windowsHide: true,
		// Windows-specific: kill tree on timeout
		killSignal: process.platform === "win32" ? "SIGTERM" : undefined,
	});

	return {
		stdout: result.stdout?.toString() || "",
		stderr: result.stderr?.toString() || "",
		status: result.status,
		error: result.error,
	};
}

/**
 * Check if a command is available in PATH (async version)
 */
export async function isCommandAvailableAsync(
	command: string,
): Promise<boolean> {
	const finder = process.platform === "win32" ? "where" : "which";
	const result = await safeSpawnAsync(finder, [command], { timeout: 5000 });
	return result.status === 0 && !result.error;
}

/**
 * Find the full path to a command (async version)
 */
export async function findCommandAsync(
	command: string,
): Promise<string | null> {
	const finder = process.platform === "win32" ? "where" : "which";
	const result = await safeSpawnAsync(finder, [command], { timeout: 5000 });

	if (result.status !== 0 || result.error) return null;

	// Take first line (first match)
	return result.stdout.trim().split("\n")[0] || null;
}

/**
 * Run multiple commands concurrently with limited concurrency.
 *
 * This is the key function for preventing resource contention.
 * Uses async spawn with concurrency limiting built-in.
 */
export async function safeSpawnBatch(
	commands: Array<{
		command: string;
		args: string[];
		options?: SafeSpawnOptions;
	}>,
	concurrency = 3,
): Promise<SpawnResult[]> {
	const results: SpawnResult[] = [];

	// Process in batches to limit concurrent processes
	for (let i = 0; i < commands.length; i += concurrency) {
		const batch = commands.slice(i, i + concurrency);
		const batchResults = await Promise.all(
			batch.map(({ command, args, options }) =>
				safeSpawnAsync(command, args, options),
			),
		);
		results.push(...batchResults);
	}

	return results;
}
