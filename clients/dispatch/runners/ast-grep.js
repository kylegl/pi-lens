/**
 * ast-grep runner for dispatch system
 *
 * Structural code analysis for detecting patterns like:
 * - redundant state
 * - async/await issues
 * - security anti-patterns
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
const astGrepRunner = {
    id: "ast-grep",
    appliesTo: ["jsts", "python", "go", "rust", "cxx"],
    priority: 30,
    enabledByDefault: false,
    async run(ctx) {
        // Check if ast-grep is available
        const check = spawnSync("sg", ["--version"], {
            encoding: "utf-8",
            timeout: 5000,
            shell: true,
        });
        if (check.error || check.status !== 0) {
            return { status: "skipped", output: "" };
        }
        // Find ast-grep config
        const configPath = findAstGrepConfig(ctx.cwd);
        if (!configPath) {
            return { status: "skipped", output: "" };
        }
        // Run ast-grep scan on the file
        const args = [
            "scan",
            "--config", configPath,
            "--json",
            ctx.filePath,
        ];
        const result = spawnSync("sg", args, {
            encoding: "utf-8",
            timeout: 30000,
            shell: true,
        });
        const raw = result.stdout + result.stderr;
        if (result.status === 0 && !raw.trim()) {
            return { status: "succeeded", output: "" };
        }
        // Parse results
        let results = [];
        try {
            results = parseAstGrepOutput(raw);
        }
        catch {
            // Fallback to raw output
            return {
                status: result.status === 0 ? "succeeded" : "failed",
                output: raw,
            };
        }
        if (results.length === 0) {
            return { status: "succeeded", output: "" };
        }
        return {
            status: "failed",
            output: formatAstGrepOutput(results),
        };
    },
};
function findAstGrepConfig(cwd) {
    const candidates = [
        "rules/ast-grep-rules/.sgconfig.yml",
        ".sgconfig.yml",
        "sgconfig.yml",
    ];
    for (const candidate of candidates) {
        const fullPath = `${cwd}/${candidate}`;
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
    }
    return undefined;
}
function parseAstGrepOutput(raw) {
    const results = [];
    // Try to parse as JSON
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            for (const item of parsed) {
                results.push({
                    rule: item.rule || "unknown",
                    message: item.message || item.lines || "",
                    severity: item.severity === "error" ? "error" : "warning",
                    line: item.range?.start?.line || 1,
                    fix: item.replacement,
                });
            }
        }
    }
    catch {
        // Not JSON, try line-by-line parsing
        const lines = raw.split("\n");
        for (const line of lines) {
            if (line.includes(":") && line.includes("L")) {
                const match = line.match(/L(\d+):?\s*(.+)/);
                if (match) {
                    results.push({
                        rule: "ast-grep",
                        message: match[2].trim(),
                        severity: "warning",
                        line: parseInt(match[1], 10),
                    });
                }
            }
        }
    }
    return results;
}
function formatAstGrepOutput(results) {
    const errors = results.filter((r) => r.severity === "error");
    const warnings = results.filter((r) => r.severity !== "error");
    let output = "";
    if (errors.length > 0) {
        output += `\n🔴 STOP — ${errors.length} structural violation(s):\n`;
        for (const r of errors.slice(0, 10)) {
            output += `  L${r.line}: ${r.message}\n`;
        }
        if (errors.length > 10) {
            output += `  ... and ${errors.length - 10} more errors\n`;
        }
    }
    if (warnings.length > 0) {
        output += `\n🟡 ${warnings.length} structural warning(s):\n`;
        for (const r of warnings.slice(0, 10)) {
            output += `  L${r.line}: ${r.message}\n`;
        }
        if (warnings.length > 10) {
            output += `  ... and ${warnings.length - 10} more warnings\n`;
        }
    }
    const fixable = results.filter((r) => r.fix);
    if (fixable.length > 0) {
        output += `\n  → ${fixable.length} auto-fixable with \`sg fix\`\n`;
    }
    return output;
}
export default astGrepRunner;
