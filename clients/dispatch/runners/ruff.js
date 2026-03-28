/**
 * Ruff runner for dispatch system
 *
 * Ruff handles both formatting and linting for Python files.
 * Much faster than flake8 + black + isort combined.
 */
import { spawnSync } from "node:child_process";
const ruffRunner = {
    id: "ruff-lint",
    appliesTo: ["python"],
    priority: 10,
    enabledByDefault: true,
    async run(ctx) {
        // Check if ruff is available
        const check = spawnSync("ruff", ["--version"], {
            encoding: "utf-8",
            timeout: 5000,
            shell: true,
        });
        if (check.error || check.status !== 0) {
            return { status: "skipped", output: "" };
        }
        // Run ruff check
        const args = ctx.autofix
            ? ["check", "--fix", ctx.filePath]
            : ["check", ctx.filePath];
        const result = spawnSync("ruff", args, {
            encoding: "utf-8",
            timeout: 30000,
            shell: true,
        });
        const output = result.stdout + result.stderr;
        if (result.status === 0) {
            return { status: "succeeded", output: "" };
        }
        return {
            status: "failed",
            output: formatRuffOutput(output, ctx.autofix),
        };
    },
};
function formatRuffOutput(raw, autofix) {
    const clean = raw.replace(/\x1b\[[0-9;]*m/g, "");
    if (!clean.trim()) {
        return "";
    }
    const lines = clean.split("\n").filter((l) => l.trim());
    if (lines.length === 0) {
        return "";
    }
    // Count issues
    const issueCount = lines.filter((l) => l.includes(":") && !l.startsWith(" ")).length;
    if (issueCount === 0) {
        return "";
    }
    const prefix = autofix ? "🟠" : "🔴";
    let output = `\n${prefix} Fix ${issueCount} Ruff issue(s):\n`;
    // Show first 15 issues
    for (const line of lines.slice(0, 15)) {
        if (line.trim()) {
            output += `  ${line}\n`;
        }
    }
    if (lines.length > 15) {
        output += `  ... and ${lines.length - 15} more\n`;
    }
    if (autofix) {
        output += `\n  → Auto-fix applied, remaining issues shown above`;
    }
    return output;
}
export default ruffRunner;
