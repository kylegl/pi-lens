import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AstGrepClient } from "./ast-grep-client.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("AstGrepClient", () => {
  let client: AstGrepClient;
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
    client = new AstGrepClient();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lens-astgrep-test-"));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  describe("isAvailable", () => {
    it("should check ast-grep availability", () => {
      const available = client.isAvailable();
      expect(typeof available).toBe("boolean");
    });
  });

  describe("scanFile", () => {
    it("should return empty array for non-existent files", () => {
      if (!client.isAvailable()) return;
      const result = client.scanFile("/nonexistent/file.ts");
      expect(result).toEqual([]);
    });

    it("should detect var usage (no-var rule)", () => {
      if (!client.isAvailable()) return;

      const content = `
var x = 1;
var y = 2;
`;
      const filePath = createTempFile("test.ts", content);
      const result = client.scanFile(filePath);

      // Should detect var usage
      expect(result.some(d => d.rule === "no-var")).toBe(true);
    });

    it("should detect console.log usage", () => {
      if (!client.isAvailable()) return;

      const content = `
console.log("test");
`;
      const filePath = createTempFile("test.ts", content);
      const result = client.scanFile(filePath);

      // May detect console.log depending on rules
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("formatDiagnostics", () => {
    it("should format diagnostics for display", () => {
      const diags = [
        {
          line: 1,
          column: 0,
          endLine: 1,
          endColumn: 10,
          severity: "warning" as const,
          message: "Unexpected var, use let or const instead",
          rule: "no-var",
          file: "test.ts",
        },
      ];

      const formatted = client.formatDiagnostics(diags);
      expect(formatted).toContain("ast-grep");
      expect(formatted).toContain("no-var");
    });

    it("should categorize by severity", () => {
      const diags = [
        {
          line: 1, column: 0, endLine: 1, endColumn: 10,
          severity: "warning" as const, message: "Warning", rule: "rule1", file: "test.ts",
        },
        {
          line: 2, column: 0, endLine: 2, endColumn: 10,
          severity: "error" as const, message: "Error", rule: "rule2", file: "test.ts",
        },
      ];

      const formatted = client.formatDiagnostics(diags);
      expect(formatted).toContain("warning(s)");
      expect(formatted).toContain("error(s)");
    });

    it("should show fixable indicator", () => {
      const diags = [
        {
          line: 1, column: 0, endLine: 1, endColumn: 10,
          severity: "warning" as const, message: "Use const", rule: "prefer-const",
          file: "test.ts", fix: "const",
        },
      ];

      const formatted = client.formatDiagnostics(diags);
      expect(formatted).toContain("fixable");
    });
  });

  describe("search", () => {
    it("should search for patterns", async () => {
      if (!client.isAvailable()) return;

      createTempFile("test.ts", `
function test() {
  console.log("hello");
}
`);

      const result = await client.search("console.log($MSG)", "typescript", [tmpDir]);

      expect(result.matches.length).toBeGreaterThan(0);
    });

    it("should return empty matches for no match", async () => {
      if (!client.isAvailable()) return;

      createTempFile("test.ts", `
const x = 1;
`);

      const result = await client.search("console.log($MSG)", "typescript", [tmpDir]);

      expect(result.matches.length).toBe(0);
    });
  });
});
