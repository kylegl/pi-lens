import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestRunnerClient } from "./test-runner-client.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("TestRunnerClient", () => {
  let client: TestRunnerClient;
  let tmpDir: string;

  function createTempFile(name: string, content: string): string {
    const filePath = path.join(tmpDir, name);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  beforeEach(() => {
    client = new TestRunnerClient();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lens-test-runner-"));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  describe("detectRunner", () => {
    it("should detect vitest from config file", () => {
      createTempFile("vitest.config.ts", "export default {}");
      createTempFile("src/app.ts", "export const app = {};");

      const result = client.detectRunner(tmpDir);
      expect(result).not.toBeNull();
      expect(result!.runner).toBe("vitest");
    });

    it("should detect jest from config file", () => {
      createTempFile("jest.config.js", "module.exports = {}");
      createTempFile("src/app.ts", "export const app = {};");

      const result = client.detectRunner(tmpDir);
      expect(result).not.toBeNull();
      expect(result!.runner).toBe("jest");
    });

    it("should detect pytest from config file", () => {
      createTempFile("pytest.ini", "[tool:pytest]");
      createTempFile("src/app.py", "x = 1");

      const result = client.detectRunner(tmpDir);
      expect(result).not.toBeNull();
      expect(result!.runner).toBe("pytest");
    });

    it("should detect runner from node_modules", () => {
      // Create a node_modules/vitest to simulate installed package
      createTempFile("node_modules/vitest/package.json", "{}");
      createTempFile("src/app.ts", "export const app = {};");

      const result = client.detectRunner(tmpDir);
      // Should detect vitest from node_modules
      expect(result).not.toBeNull();
    });

    it("should prefer vitest over jest when both exist", () => {
      createTempFile("vitest.config.ts", "export default {}");
      createTempFile("jest.config.js", "module.exports = {}");
      createTempFile("src/app.ts", "export const app = {};");

      const result = client.detectRunner(tmpDir);
      expect(result!.runner).toBe("vitest");
    });
  });

  describe("findTestFile", () => {
    it("should find test file with .test.ts suffix", () => {
      createTempFile("vitest.config.ts", "export default {}");
      createTempFile("src/app.ts", "export const app = {};");
      createTempFile("src/app.test.ts", "describe('app', () => {});");

      const result = client.findTestFile(path.join(tmpDir, "src/app.ts"), tmpDir);
      expect(result).not.toBeNull();
      expect(result!.testFile).toContain("app.test.ts");
      expect(result!.runner).toBe("vitest");
    });

    it("should find test file with .spec.ts suffix", () => {
      createTempFile("vitest.config.ts", "export default {}");
      createTempFile("src/app.ts", "export const app = {};");
      createTempFile("src/app.spec.ts", "describe('app', () => {});");

      const result = client.findTestFile(path.join(tmpDir, "src/app.ts"), tmpDir);
      expect(result).not.toBeNull();
      expect(result!.testFile).toContain("app.spec.ts");
    });

    it("should find test file in __tests__ directory", () => {
      createTempFile("vitest.config.ts", "export default {}");
      createTempFile("src/app.ts", "export const app = {};");
      createTempFile("src/__tests__/app.test.ts", "describe('app', () => {});");

      const result = client.findTestFile(path.join(tmpDir, "src/app.ts"), tmpDir);
      expect(result).not.toBeNull();
      expect(result!.testFile).toContain("__tests__");
    });

    it("should find test file in top-level tests/ directory", () => {
      createTempFile("vitest.config.ts", "export default {}");
      createTempFile("src/app.ts", "export const app = {};");
      createTempFile("tests/app.test.ts", "describe('app', () => {});");

      const result = client.findTestFile(path.join(tmpDir, "src/app.ts"), tmpDir);
      expect(result).not.toBeNull();
      expect(result!.testFile).toContain(path.join("tests", "app.test.ts"));
    });

    it("should find pytest test file with test_ prefix", () => {
      createTempFile("pytest.ini", "[tool:pytest]");
      createTempFile("src/app.py", "x = 1");
      createTempFile("tests/test_app.py", "def test_app(): pass");

      const result = client.findTestFile(path.join(tmpDir, "src/app.py"), tmpDir);
      expect(result).not.toBeNull();
      expect(result!.testFile).toContain("test_app.py");
      expect(result!.runner).toBe("pytest");
    });

    it("should return null when no test file found", () => {
      createTempFile("vitest.config.ts", "export default {}");
      createTempFile("src/app.ts", "export const app = {};");

      const result = client.findTestFile(path.join(tmpDir, "src/app.ts"), tmpDir);
      expect(result).toBeNull();
    });

    it("should find test file even without config (if runner installed)", () => {
      // Simulate vitest installed in node_modules
      createTempFile("node_modules/vitest/package.json", "{}");
      createTempFile("src/app.ts", "export const app = {};");
      createTempFile("src/app.test.ts", "describe('app', () => {});");

      const result = client.findTestFile(path.join(tmpDir, "src/app.ts"), tmpDir);
      // Should find the test file since vitest is "installed"
      expect(result).not.toBeNull();
    });
  });

  describe("formatResult", () => {
    it("should format passing tests", () => {
      const result = {
        file: "/test/app.test.ts",
        sourceFile: "/test/app.ts",
        runner: "vitest",
        passed: 5,
        failed: 0,
        skipped: 0,
        failures: [],
        duration: 420,
      };

      const formatted = client.formatResult(result);
      expect(formatted).toContain("✓");
      expect(formatted).toContain("5/5 passed");
      expect(formatted).toContain("0.42s");
    });

    it("should format failing tests", () => {
      const result = {
        file: "/test/app.test.ts",
        sourceFile: "/test/app.ts",
        runner: "vitest",
        passed: 3,
        failed: 2,
        skipped: 0,
        failures: [
          { name: "should add", message: "expected 4, got 3", location: "app.test.ts:10" },
          { name: "should subtract", message: "expected 1, got 2", location: "app.test.ts:20" },
        ],
        duration: 420,
      };

      const formatted = client.formatResult(result);
      expect(formatted).toContain("✗");
      expect(formatted).toContain("2/5 failed");
      expect(formatted).toContain("should add");
      expect(formatted).toContain("should subtract");
    });

    it("should format runner errors", () => {
      const result = {
        file: "/test/app.test.ts",
        sourceFile: "/test/app.ts",
        runner: "vitest",
        passed: 0,
        failed: 0,
        skipped: 0,
        failures: [],
        duration: 0,
        error: "Test file not found",
      };

      const formatted = client.formatResult(result);
      expect(formatted).toContain("⚠");
      expect(formatted).toContain("Could not run tests");
    });

    it("should return empty string for no tests", () => {
      const result = {
        file: "/test/app.test.ts",
        sourceFile: "/test/app.ts",
        runner: "vitest",
        passed: 0,
        failed: 0,
        skipped: 0,
        failures: [],
        duration: 0,
      };

      const formatted = client.formatResult(result);
      expect(formatted).toBe("");
    });
  });
});
