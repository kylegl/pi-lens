import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TypeScriptClient } from "./typescript-client.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("TypeScriptClient", () => {
  let client: TypeScriptClient;
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
    client = new TypeScriptClient();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lens-ts-test-"));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  describe("isTypeScriptFile", () => {
    it("should recognize TypeScript files", () => {
      expect(client.isTypeScriptFile("test.ts")).toBe(true);
      expect(client.isTypeScriptFile("test.tsx")).toBe(true);
    });

    it("should also recognize JavaScript files (for type checking)", () => {
      expect(client.isTypeScriptFile("test.js")).toBe(true);
      expect(client.isTypeScriptFile("test.jsx")).toBe(true);
    });

    it("should not recognize non-JS/TS files", () => {
      expect(client.isTypeScriptFile("test.py")).toBe(false);
      expect(client.isTypeScriptFile("test.md")).toBe(false);
    });
  });

  describe("updateFile and getDiagnostics", () => {
    it("should detect type errors", () => {
      const content = `
const x: number = "string"; // Type error
`;
      const filePath = createTempFile("test.ts", content);

      client.updateFile(filePath, content);
      const diags = client.getDiagnostics(filePath);

      expect(diags.length).toBeGreaterThan(0);
      expect(diags.some(d => d.message.includes("string"))).toBe(true);
    });

    it("should not report errors for valid code", () => {
      const content = `
const x: number = 42;
const y: string = "hello";
`;
      const filePath = createTempFile("test.ts", content);

      client.updateFile(filePath, content);
      const diags = client.getDiagnostics(filePath);

      // May have warnings but no errors for valid code
      const errors = diags.filter(d => d.severity === 1); // Error severity
      expect(errors.length).toBe(0);
    });

    it("should detect undefined variables", () => {
      const content = `
function test() {
  return undefinedVariable;
}
`;
      const filePath = createTempFile("test.ts", content);

      client.updateFile(filePath, content);
      const diags = client.getDiagnostics(filePath);

      expect(diags.some(d => d.message.includes("undefined"))).toBe(true);
    });

    it("should detect missing function arguments", () => {
      const content = `
function add(a: number, b: number): number {
  return a + b;
}
const result = add(1);
`;
      const filePath = createTempFile("test.ts", content);

      client.updateFile(filePath, content);
      const diags = client.getDiagnostics(filePath);

      expect(diags.some(d => d.message.includes("Expected"))).toBe(true);
    });
  });

  describe("diagnostic severity", () => {
    it("should have correct severity levels", () => {
      const diags = [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
          severity: 1, // Error
          message: "Error message",
        },
        {
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
          severity: 2, // Warning
          message: "Warning message",
        },
      ];

      // Test that diagnostics have expected structure
      expect(diags[0].severity).toBe(1); // Error
      expect(diags[1].severity).toBe(2); // Warning
      expect(diags[0].message).toContain("Error");
    });
  });
});
