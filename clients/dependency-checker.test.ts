import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DependencyChecker } from "./dependency-checker.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("DependencyChecker", () => {
  let checker: DependencyChecker;
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
    checker = new DependencyChecker();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lens-dep-test-"));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  describe("isAvailable", () => {
    it("should check madge availability", () => {
      const available = checker.isAvailable();
      expect(typeof available).toBe("boolean");
    });
  });

  describe("checkFile", () => {
    it("should return no circular deps for non-existent files", () => {
      const result = checker.checkFile("/nonexistent/file.ts");
      expect(result.hasCircular).toBe(false);
      expect(result.circular).toEqual([]);
    });

    it("should return correct structure when not available", () => {
      const mockChecker = new DependencyChecker();
      if (mockChecker.isAvailable()) return; // Skip if available

      const result = mockChecker.checkFile("/some/file.ts");
      expect(result).toHaveProperty("hasCircular");
      expect(result).toHaveProperty("circular");
      expect(result).toHaveProperty("checked");
    });
  });

  describe("scanProject", () => {
    it("should return correct structure", () => {
      const mockChecker = new DependencyChecker();
      // When not available, should still return expected structure
      const result = mockChecker.scanProject(tmpDir);
      expect(result).toHaveProperty("circular");
      expect(result).toHaveProperty("count");
      expect(Array.isArray(result.circular)).toBe(true);
    });
  });

  describe("formatWarning", () => {
    it("should format circular dependency warning", () => {
      const circularDeps = ["b.ts", "c.ts", "a.ts"];
      const formatted = checker.formatWarning("a.ts", circularDeps);

      expect(formatted).toContain("cycle");
      expect(formatted).toContain("a.ts");
    });

    it("should show the circular path", () => {
      const circularDeps = ["b.ts", "a.ts"];
      const formatted = checker.formatWarning("a.ts", circularDeps);

      expect(formatted).toContain("b.ts");
    });
  });
});
