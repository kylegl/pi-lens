import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TodoScanner } from "./todo-scanner.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("TodoScanner", () => {
  let scanner: TodoScanner;
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
    scanner = new TodoScanner();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lens-todo-test-"));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  describe("scanFile", () => {
    it("should return empty array for non-existent files", () => {
      const result = scanner.scanFile("/nonexistent/file.ts");
      expect(result).toEqual([]);
    });

    it("should find TODO comments", () => {
      const content = `
// TODO: implement this function
function foo() {}
`;
      const filePath = createTempFile("test.ts", content);
      const result = scanner.scanFile(filePath);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe("TODO");
      expect(result[0].message).toContain("implement this function");
    });

    it("should find FIXME comments", () => {
      const content = `
// FIXME: this is broken
function foo() {}
`;
      const filePath = createTempFile("test.ts", content);
      const result = scanner.scanFile(filePath);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe("FIXME");
    });

    it("should find HACK comments", () => {
      const content = `
// HACK: temporary workaround
const x = 1;
`;
      const filePath = createTempFile("test.ts", content);
      const result = scanner.scanFile(filePath);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe("HACK");
    });

    it("should find BUG comments", () => {
      const content = `
// BUG: this causes a crash
const x = 1;
`;
      const filePath = createTempFile("test.ts", content);
      const result = scanner.scanFile(filePath);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe("BUG");
    });

    it("should find NOTE comments", () => {
      const content = `
// NOTE: important design decision
const x = 1;
`;
      const filePath = createTempFile("test.ts", content);
      const result = scanner.scanFile(filePath);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe("NOTE");
    });

    it("should find TODO in block comments", () => {
      const content = `
/*
 * TODO: refactor this later
 */
const x = 1;
`;
      const filePath = createTempFile("test.ts", content);
      const result = scanner.scanFile(filePath);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe("TODO");
    });

    it("should find TODO in JSDoc comments", () => {
      const content = `
/**
 * TODO: add proper documentation
 */
function foo() {}
`;
      const filePath = createTempFile("test.ts", content);
      const result = scanner.scanFile(filePath);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe("TODO");
    });

    it("should find TODO in Python comments", () => {
      const content = `
# TODO: implement this
def foo():
    pass
`;
      const filePath = createTempFile("test.py", content);
      const result = scanner.scanFile(filePath);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe("TODO");
    });

    it("should skip TODO in strings", () => {
      const content = `
const message = "TODO: buy milk";
`;
      const filePath = createTempFile("test.ts", content);
      const result = scanner.scanFile(filePath);

      expect(result.length).toBe(0);
    });

    it("should report correct line numbers", () => {
      const content = `
const x = 1;
const y = 2;
// TODO: fix this
const z = 3;
`;
      const filePath = createTempFile("test.ts", content);
      const result = scanner.scanFile(filePath);

      expect(result[0].line).toBe(4);
    });

    it("should find multiple annotations in one file", () => {
      const content = `
// TODO: first
// FIXME: second
// HACK: third
`;
      const filePath = createTempFile("test.ts", content);
      const result = scanner.scanFile(filePath);

      expect(result.length).toBe(3);
    });
  });

  describe("scanDirectory", () => {
    it("should scan all files in directory", () => {
      createTempFile("file1.ts", "// TODO: task 1");
      createTempFile("file2.ts", "// FIXME: bug 1");
      createTempFile("file3.py", "# HACK: workaround");

      const result = scanner.scanDirectory(tmpDir);

      expect(result.items.length).toBe(3);
    });

    it("should skip node_modules", () => {
      createTempFile("src/file.ts", "// TODO: task 1");
      createTempFile("node_modules/lib/file.ts", "// TODO: should be skipped");

      const result = scanner.scanDirectory(tmpDir);

      expect(result.items.length).toBe(1);
      expect(result.items[0].file).not.toContain("node_modules");
    });

    it("should group items by type", () => {
      createTempFile("file1.ts", "// TODO: task 1");
      createTempFile("file2.ts", "// TODO: task 2");
      createTempFile("file3.ts", "// FIXME: bug 1");

      const result = scanner.scanDirectory(tmpDir);

      expect(result.byType.get("TODO")?.length).toBe(2);
      expect(result.byType.get("FIXME")?.length).toBe(1);
    });

    it("should group items by file", () => {
      createTempFile("file1.ts", "// TODO: task 1\n// FIXME: bug 1");
      createTempFile("file2.ts", "// TODO: task 2");

      const result = scanner.scanDirectory(tmpDir);

      const file1Items = [...result.byFile.entries()].find(([k]) => k.includes("file1.ts"));
      expect(file1Items?.[1].length).toBe(2);
    });
  });

  describe("formatResult", () => {
    it("should return empty string for no results", () => {
      const result = { items: [], byType: new Map(), byFile: new Map() };
      expect(scanner.formatResult(result)).toBe("");
    });

    it("should format results with counts", () => {
      const result = {
        items: [
          { type: "TODO" as const, message: "task 1", file: "test.ts", line: 1, column: 0 },
          { type: "FIXME" as const, message: "bug 1", file: "test.ts", line: 2, column: 0 },
        ],
        byType: new Map([["TODO", [{ type: "TODO" as const, message: "task 1", file: "test.ts", line: 1, column: 0 }]]]),
        byFile: new Map([["test.ts", [{ type: "TODO" as const, message: "task 1", file: "test.ts", line: 1, column: 0 }]]]),
      };

      const formatted = scanner.formatResult(result);
      expect(formatted).toContain("2 annotation(s)");
      expect(formatted).toContain("TODO");
      expect(formatted).toContain("FIXME");
    });

    it("should prioritize FIXME/HACK before TODO", () => {
      const result = {
        items: [
          { type: "FIXME" as const, message: "bug", file: "test.ts", line: 2, column: 0 },
          { type: "TODO" as const, message: "task", file: "test.ts", line: 1, column: 0 },
        ],
        byType: new Map(),
        byFile: new Map(),
      };

      const formatted = scanner.formatResult(result);
      // Check that FIXME line comes before TODO line in the sorted output
      const fixmeLineIndex = formatted.indexOf("🔴");
      const todoLineIndex = formatted.indexOf("📝");
      expect(fixmeLineIndex).toBeLessThan(todoLineIndex);
    });

    it("should show correct icons", () => {
      const result = {
        items: [
          { type: "FIXME" as const, message: "bug", file: "test.ts", line: 1, column: 0 },
          { type: "HACK" as const, message: "hack", file: "test.ts", line: 2, column: 0 },
          { type: "BUG" as const, message: "bug", file: "test.ts", line: 3, column: 0 },
          { type: "TODO" as const, message: "todo", file: "test.ts", line: 4, column: 0 },
          { type: "NOTE" as const, message: "note", file: "test.ts", line: 5, column: 0 },
        ],
        byType: new Map(),
        byFile: new Map(),
      };

      const formatted = scanner.formatResult(result);
      expect(formatted).toContain("🔴"); // FIXME
      expect(formatted).toContain("🟠"); // HACK
      expect(formatted).toContain("🐛"); // BUG
      expect(formatted).toContain("📝"); // TODO
      expect(formatted).toContain("ℹ️"); // NOTE
    });
  });
});
