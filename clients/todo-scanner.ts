/**
 * TODO Scanner for pi-local
 *
 * Scans codebase for TODO, FIXME, HACK, XXX, and other annotations.
 * Helps me understand what's already flagged as problematic or incomplete.
 *
 * No dependencies required — uses regex scanning.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// --- Types ---

export interface TodoItem {
  type: "TODO" | "FIXME" | "HACK" | "XXX" | "NOTE" | "DEPRECATED" | "BUG";
  message: string;
  file: string;
  line: number;
  column: number;
}

export interface TodoScanResult {
  items: TodoItem[];
  byType: Map<string, TodoItem[]>;
  byFile: Map<string, TodoItem[]>;
}

// --- Scanner ---

export class TodoScanner {
  private readonly pattern = /\b(TODO|FIXME|HACK|XXX|NOTE|DEPRECATED|BUG)\b\s*[\(:]?\s*(.+)/gi;

  /**
   * Scan a single file for TODOs
   */
  scanFile(filePath: string): TodoItem[] {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) return [];

    const content = fs.readFileSync(absolutePath, "utf-8");
    const lines = content.split("\n");
    const items: TodoItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.matchAll(this.pattern);

      for (const match of matches) {
        const type = match[1].toUpperCase() as TodoItem["type"];
        const message = (match[2] || "").trim().replace(/\s*\*\/\s*$/, ""); // Strip closing comment

        items.push({
          type,
          message: message.slice(0, 200), // Limit message length
          file: path.relative(process.cwd(), absolutePath),
          line: i + 1,
          column: match.index || 0,
        });
      }
    }

    return items;
  }

  /**
   * Scan a directory recursively
   */
  scanDirectory(dirPath: string, extensions = [".ts", ".tsx", ".js", ".jsx", ".py"]): TodoScanResult {
    const items: TodoItem[] = [];

    const scan = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip common non-source directories
          if (["node_modules", ".git", "dist", "build", ".next", "coverage"].includes(entry.name)) continue;
          scan(fullPath);
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          items.push(...this.scanFile(fullPath));
        }
      }
    };

    scan(path.resolve(dirPath));

    // Group by type
    const byType = new Map<string, TodoItem[]>();
    for (const item of items) {
      const existing = byType.get(item.type) || [];
      existing.push(item);
      byType.set(item.type, existing);
    }

    // Group by file
    const byFile = new Map<string, TodoItem[]>();
    for (const item of items) {
      const existing = byFile.get(item.file) || [];
      existing.push(item);
      byFile.set(item.file, existing);
    }

    return { items, byType, byFile };
  }

  /**
   * Format scan results for LLM consumption
   */
  formatResult(result: TodoScanResult, maxItems = 30): string {
    if (result.items.length === 0) return "";

    let output = `[TODOs] ${result.items.length} annotation(s) found`;

    // Summary by type
    const typeCounts: string[] = [];
    for (const [type, items] of result.byType) {
      typeCounts.push(`${items.length} ${type}`);
    }
    if (typeCounts.length > 0) {
      output += ` (${typeCounts.join(", ")})`;
    }
    output += ":\n";

    // Show by priority: FIXME/HACK first, then TODO
    const priorityOrder: TodoItem["type"][] = ["FIXME", "HACK", "BUG", "DEPRECATED", "TODO", "XXX", "NOTE"];
    const sorted = [...result.items].sort((a, b) => {
      const aIdx = priorityOrder.indexOf(a.type);
      const bIdx = priorityOrder.indexOf(b.type);
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });

    for (const item of sorted.slice(0, maxItems)) {
      const icon = this.getIcon(item.type);
      output += `  ${icon} ${item.file}:${item.line} — ${item.type}: ${item.message}\n`;
    }

    if (result.items.length > maxItems) {
      output += `  ... and ${result.items.length - maxItems} more\n`;
    }

    return output;
  }

  private getIcon(type: TodoItem["type"]): string {
    switch (type) {
      case "FIXME": return "🔴";
      case "HACK": return "🟠";
      case "BUG": return "🐛";
      case "DEPRECATED": return "⚠️";
      case "TODO": return "📝";
      case "XXX": return "❌";
      case "NOTE": return "ℹ️";
      default: return "•";
    }
  }
}
