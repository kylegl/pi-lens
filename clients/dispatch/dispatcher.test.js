/**
 * Tests for declarative dispatch system
 */
import { describe, it, expect, beforeEach } from "vitest";
import { registerRunner, getRunner, getRunnersForKind, listRunners, createDispatchContext, } from "./dispatcher.js";
// --- Test Runners ---
const testRunner1 = {
    id: "test-runner-1",
    appliesTo: ["jsts", "python"],
    priority: 10,
    async run() {
        return { status: "succeeded", output: "Test runner 1 ran" };
    },
};
const testRunner2 = {
    id: "test-runner-2",
    appliesTo: ["python"],
    priority: 20,
    async run() {
        return { status: "succeeded", output: "Test runner 2 ran" };
    },
};
const testRunnerWithCondition = {
    id: "test-runner-conditional",
    appliesTo: ["jsts"],
    priority: 5,
    when: async (ctx) => ctx.autofix,
    async run() {
        return { status: "succeeded", output: "Conditional runner ran" };
    },
};
// --- Tests ---
describe("Runner Registry", () => {
    beforeEach(() => {
        // Note: In a real test suite, we'd reset the registry between tests
        registerRunner(testRunner1);
        registerRunner(testRunner2);
        registerRunner(testRunnerWithCondition);
    });
    it("should register a runner", () => {
        const runner = getRunner("test-runner-1");
        expect(runner).toBeDefined();
        expect(runner?.id).toBe("test-runner-1");
    });
    it("should return undefined for unknown runner", () => {
        const runner = getRunner("unknown-runner");
        expect(runner).toBeUndefined();
    });
    it("should get runners for a specific kind", () => {
        const jstsRunners = getRunnersForKind("jsts");
        expect(jstsRunners.length).toBeGreaterThan(0);
        expect(jstsRunners.some((r) => r.id === "test-runner-1")).toBe(true);
    });
    it("should return runners sorted by priority", () => {
        const jstsRunners = getRunnersForKind("jsts");
        const priorities = jstsRunners.map((r) => r.priority ?? 100);
        for (let i = 1; i < priorities.length; i++) {
            expect(priorities[i - 1]).toBeLessThanOrEqual(priorities[i]);
        }
    });
    it("should list all registered runners", () => {
        const all = listRunners();
        expect(all.length).toBeGreaterThanOrEqual(3);
    });
    it("should reject duplicate registrations", () => {
        // This should log an error but not throw
        expect(() => registerRunner(testRunner1)).not.toThrow();
    });
});
describe("Dispatch Context", () => {
    it("should create a dispatch context", () => {
        const mockPi = { getFlag: (flag) => flag === "autofix" };
        const ctx = createDispatchContext("test.ts", "/project", mockPi);
        expect(ctx.filePath).toBe("test.ts");
        expect(ctx.cwd).toBe("/project");
        expect(ctx.autofix).toBe(false);
        expect(ctx.deltaMode).toBe(true);
    });
    it("should detect file kind", () => {
        const mockPi = { getFlag: () => false };
        const ctxTs = createDispatchContext("test.ts", "/project", mockPi);
        expect(ctxTs.kind).toBe("jsts");
        const ctxPy = createDispatchContext("test.py", "/project", mockPi);
        expect(ctxPy.kind).toBe("python");
        const ctxGo = createDispatchContext("test.go", "/project", mockPi);
        expect(ctxGo.kind).toBe("go");
    });
    it("should respect autofix flag", () => {
        const mockPiNoFix = { getFlag: (f) => false };
        const ctx1 = createDispatchContext("test.ts", "/project", mockPiNoFix);
        expect(ctx1.autofix).toBe(false);
        const mockPiWithFix = { getFlag: (f) => f === "autofix-biome" };
        const ctx2 = createDispatchContext("test.ts", "/project", mockPiWithFix);
        expect(ctx2.autofix).toBe(true);
    });
});
describe("Conditional Runners", () => {
    beforeEach(() => {
        registerRunner(testRunnerWithCondition);
    });
    it("should respect when condition", async () => {
        const runner = getRunner("test-runner-conditional");
        expect(runner).toBeDefined();
        const mockPiNoFix = { getFlag: () => false };
        const ctxNoFix = createDispatchContext("test.ts", "/project", mockPiNoFix);
        // When autofix is false, the condition should return false
        if (runner?.when) {
            const shouldRun = await runner.when(ctxNoFix);
            expect(shouldRun).toBe(false);
        }
    });
});
