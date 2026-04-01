import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { DispatchContext } from "../types.js";

function createMockContext(
	filePath: string,
	kind: any = "jsts",
): DispatchContext {
	return {
		filePath,
		cwd: process.cwd(),
		kind,
		autofix: false,
		deltaMode: false,
		baselines: { get: () => [], add: () => {}, save: () => {} } as any,
		pi: {} as any,
		hasTool: async () => false,
		log: () => {},
	};
}

describe("ast-grep-napi vs CLI comparison", () => {
	it("should load the napi module", async () => {
		const napiModule = await import("./ast-grep-napi.js");
		expect(napiModule.default.id).toBe("ast-grep-napi");
		expect(napiModule.default.appliesTo).toEqual(["jsts"]);
	});

	it("should scan TypeScript file and return succeeded status", async () => {
		const tmpFile = path.join(
			process.env.TEMP || "/tmp",
			`napi_test_${Date.now()}.ts`,
		);
		fs.writeFileSync(
			tmpFile,
			`// Test file with various patterns
function test(items: string[]) {
    for (let i = 0; i < items.length; i++) {
        console.log(items[i]);
    }

    try {
        riskyOperation();
    } catch (e) {
        // empty catch
    }

    return await fetchData();
}

async function fetchData() {
    return await Promise.resolve(42);
}

function riskyOperation() {
    debugger;
}
`,
		);

		try {
			// Test NAPI version
			const napiModule = await import("./ast-grep-napi.js");
			const napiRunner = napiModule.default;

			console.time("napi");
			let napiResult;
			try {
				napiResult = await napiRunner.run(createMockContext(tmpFile));
			} catch (error) {
				console.error("NAPI runner threw error:", error);
				throw error;
			}
			console.timeEnd("napi");

			console.log("NAPI result status:", napiResult.status);
			console.log("NAPI result semantic:", napiResult.semantic);
			console.log(
				"NAPI result diagnostics count:",
				napiResult.diagnostics?.length,
			);

			// Should complete successfully (not skipped, not failed)
			expect(napiResult.status).toBe("succeeded");
			expect(napiResult.semantic).toBe("warning"); // Has findings, so marked as warning

			// Log findings
			console.log("NAPI found:", napiResult.diagnostics.length, "issues");
			console.log("\n=== NAPI FINDINGS ===");
			napiResult.diagnostics.forEach((d, i) => {
				console.log(`${i + 1}. Line ${d.line}: ${d.rule}`);
			});
		} finally {
			try {
				if (fs.existsSync(tmpFile)) {
					fs.unlinkSync(tmpFile);
				}
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	it("should skip non-TS/JS files", async () => {
		const tmpFile = path.join(
			process.env.TEMP || "/tmp",
			`napi_test_py_${Date.now()}.py`,
		);
		fs.writeFileSync(tmpFile, "# Python file\nprint('hello')");

		try {
			const napiModule = await import("./ast-grep-napi.js");
			const napiRunner = napiModule.default;

			const result = await napiRunner.run(createMockContext(tmpFile, "python"));
			expect(result.status).toBe("skipped");
		} finally {
			try {
				if (fs.existsSync(tmpFile)) {
					fs.unlinkSync(tmpFile);
				}
			} catch {
				// Ignore cleanup errors
			}
		}
	});
});
