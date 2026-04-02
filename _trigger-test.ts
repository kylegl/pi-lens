/**
 * _trigger-test.ts — Canary file to verify pi-lens runners fire.
 *
 * DELETE THIS FILE after testing. It intentionally contains violations for:
 *
 * Runner coverage:
 *   1. ast-grep-napi (priority 15) — YAML rule violations
 *   2. tree-sitter (priority 14) — structural query matches
 *   3. type-safety (priority 20) — switch/any/return checks
 *   4. biome (priority 10) — formatting/lint issues
 *   5. similarity (priority 35) — duplicated code detection
 *   6. spellcheck (priority 30) — typos in comments
 *   7. config-validation (priority 8) — env var access
 *
 * Run `npm run build` then trigger the dispatch pipeline on this file
 * to see which runners fire and what diagnostics they produce.
 *
 * trigger v4 — tree-sitter fix verified
 */

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1 — ast-grep-napi triggers (YAML rules in rules/ast-grep-rules/)
// ═══════════════════════════════════════════════════════════════════════════

// --- no-dupe-keys: duplicate keys in object literal ---
const config = {
	host: "localhost",
	port: 3000,
	host: "0.0.0.0", // duplicate key
};

// --- no-implied-eval: string arg to setTimeout/setInterval ---
setTimeout("console.log('boom')", 1000);
setInterval("doSomethingDangerous()", 5000);

// --- no-inner-html: XSS vector ---
function renderUnsafe(el: HTMLElement, html: string) {
	el.innerHTML = html;
	el.insertAdjacentHTML("beforeend", html);
}

// --- jwt-no-verify: bypassed verification ---
declare const jwt: {
	decode(t: string, o?: unknown): unknown;
	verify(t: string, s: string, o?: unknown): unknown;
};
const decoded = jwt.decode("token.here", { noVerify: true });
const verified = jwt.verify("tok", "secret", { ignoreExpiration: true });

// --- no-new-symbol ---
const sym = new Symbol("test");

// --- no-new-wrappers ---
const str = new String("hello");
const num = new Number(42);

// --- no-throw-string: should throw Error objects ---
function throwBad() {
	throw "something went wrong";
}

// --- no-return-await: unnecessary await in return ---
async function fetchData() {
	return await Promise.resolve(42);
}

// --- no-async-promise-executor ---
const badPromise = new Promise(async (resolve) => {
	const data = await fetch("https://example.com");
	resolve(data);
});

// --- no-as-any: unsafe type assertion ---
const unsafeVal = (someValue as any).foo;

// --- strict-equality: use === not == ---
declare const someValue: unknown;
if (someValue == null) {
	console.log("loose equality");
}

// --- no-non-null-assertion ---
declare const maybeNull: string | null;
const forced = maybeNull!;

// --- no-delete-operator ---
const obj = { a: 1, b: 2 };
delete obj.a;

// --- no-alert ---
alert("hello");

// --- no-console-log (if error severity) ---
console.log("debug leftover");

// --- no-param-reassign ---
function mutateParam(x: number) {
	x = x + 1;
	return x;
}

// --- require-await: async function without await ---
async function noAwait() {
	return 42;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2 — tree-sitter triggers (rules/tree-sitter-queries/typescript/)
// ═══════════════════════════════════════════════════════════════════════════

// --- empty-catch: catch block with no body ---
try {
	JSON.parse("bad");
} catch (e) {
	// intentionally empty — tree-sitter should flag this
}

// --- debugger statement ---
function buggyCode() {
	debugger;
	return true;
}

// --- eval usage ---
function unsafeEval(code: string) {
	return eval(code);
}

// --- nested-ternary ---
const nestedResult = true ? (false ? "a" : "b") : "c";

// --- deep-nesting (5+ levels) ---
function deeplyNested() {
	if (true) {
		if (true) {
			if (true) {
				if (true) {
					if (true) {
						return "too deep";
					}
				}
			}
		}
	}
}

// --- long-parameter-list (6+ params) ---
function tooManyParams(
	a: number,
	b: number,
	c: number,
	d: number,
	e: number,
	f: number,
	g: number,
) {
	return a + b + c + d + e + f + g;
}

// --- console-statement ---
console.warn("this is a tree-sitter console trigger");
console.error("and another one");

// --- await-in-loop ---
async function fetchAll(urls: string[]) {
	const results = [];
	for (const url of urls) {
		results.push(await fetch(url)); // await in loop
	}
	return results;
}

// --- hardcoded-secrets ---
// NOTE: Actual secret strings removed — they trigger pi-lens secret scanner
// which blocks the edit before dispatch runs. The tree-sitter hardcoded-secrets
// query would match patterns like: const API_KEY = "sk-..." or DB_PASSWORD = "..."
const SOME_VALUE = "placeholder";

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3 — type-safety runner triggers
// ═══════════════════════════════════════════════════════════════════════════

// --- any type usage ---
function processAnything(data: any): any {
	return data.value;
}

// --- switch without default (exhaustiveness) ---
type Color = "red" | "green" | "blue";
function getHex(color: Color): string {
	switch (color) {
		case "red":
			return "#ff0000";
		case "green":
			return "#00ff00";
		// missing "blue" case and no default
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4 — biome runner triggers
// ═══════════════════════════════════════════════════════════════════════════

// Biome detects: unused variables, unreachable code, suspicious comparisons
const unusedVariable = "never used";

function unreachableCode() {
	return 1;
	const afterReturn = 2; // unreachable
}

// --- suspicious double-negation ---
const doubleNeg = !"hello";

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5 — spellcheck triggers (typos in comments)
// ═══════════════════════════════════════════════════════════════════════════

// This functon has a misspeling in the coment
// The recieve function processs the incomming mesage
// Definately a speling eror

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6 — config-validation triggers (env var access)
// ═══════════════════════════════════════════════════════════════════════════

// Access a likely-undefined env var
const dbUrl = process.env.NONEXISTENT_DATABASE_URL;
const apiKey = process.env.TOTALLY_FAKE_API_KEY_XYZ;

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7 — Similarity / jscpd triggers (duplicated code)
// ═══════════════════════════════════════════════════════════════════════════

// --- Block copied from clients/safe-spawn.ts to trigger jscpd ---
import { type SpawnOptions, spawn, spawnSync } from "node:child_process";

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

export async function safeSpawnAsync(
	command: string,
	args: string[],
	options: SafeSpawnOptions = {},
): Promise<SpawnResult> {
	const { timeout = 30000, cwd, env, signal } = options;

	return new Promise<SpawnResult>((resolve) => {
		const proc = spawn(command, args, {
			cwd,
			env: env ?? process.env,
			stdio: ["ignore", "pipe", "pipe"],
			shell: process.platform === "win32",
		});

		let stdout = "";
		let stderr = "";
		let killed = false;

		const timer = setTimeout(() => {
			killed = true;
			proc.kill("SIGTERM");
			setTimeout(() => {
				if (!proc.killed) proc.kill("SIGKILL");
			}, 2000);
		}, timeout);

		if (signal) {
			signal.addEventListener("abort", () => {
				killed = true;
				proc.kill("SIGTERM");
				clearTimeout(timer);
			});
		}

		proc.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		proc.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		proc.on("close", (code: number | null) => {
			clearTimeout(timer);
			resolve({
				stdout,
				stderr,
				status: killed ? null : code,
				error: killed
					? new Error(`Process timed out after ${timeout}ms`)
					: undefined,
			});
		});

		proc.on("error", (err: Error) => {
			clearTimeout(timer);
			resolve({ stdout, stderr, status: null, error: err });
		});
	});
}

// --- Block with structural similarity to clients/sanitize.ts ---
const UNSAFE_PATTERNS = [
	/\x00/g,
	/[\x01-\x08]/g,
	/\x0B/g,
	/\x0C/g,
	/[\x0E-\x1F]/g,
];

export function sanitizeOutput(input: string): string {
	let result = input;
	for (const pattern of UNSAFE_PATTERNS) {
		result = result.replace(pattern, "");
	}
	if (result.length > 100_000) {
		result = result.slice(0, 100_000) + "\n… [truncated]";
	}
	return result;
}

export function stripAnsi(text: string): string {
	return text.replace(
		/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
		"",
	);
}
