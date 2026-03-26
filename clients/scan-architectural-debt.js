/**
 * Shared architectural debt scanning — used by booboo-fix and booboo-refactor.
 * Scans ast-grep skip rules + complexity metrics, scores files by combined signal.
 */
import * as fs from "node:fs";
import * as path from "node:path";
/**
 * Scan for skip-category ast-grep violations grouped by absolute file path.
 */
export function scanSkipViolations(astGrepClient, configPath, targetPath, isTsProject, skipRules, ruleActions) {
    const skipByFile = new Map();
    if (!astGrepClient.isAvailable())
        return skipByFile;
    const { spawnSync } = require("node:child_process");
    const sgResult = spawnSync("npx", [
        "sg", "scan", "--config", configPath, "--json",
        "--globs", "!**/*.test.ts", "--globs", "!**/*.spec.ts",
        "--globs", "!**/test-utils.ts", "--globs", "!**/.pi-lens/**",
        ...(isTsProject ? ["--globs", "!**/*.js"] : []),
        targetPath,
    ], { encoding: "utf-8", timeout: 30000, shell: true, maxBuffer: 32 * 1024 * 1024 });
    const raw = sgResult.stdout?.trim() ?? "";
    // biome-ignore lint/suspicious/noExplicitAny: ast-grep JSON output is untyped
    const items = raw.startsWith("[")
        ? (() => { try {
            return JSON.parse(raw);
        }
        catch {
            return [];
        } })()
        : raw.split("\n").flatMap((l) => { try {
            return [JSON.parse(l)];
        }
        catch {
            return [];
        } });
    for (const item of items) {
        const rule = item.ruleId || item.rule?.title || item.name || "unknown";
        if (!skipRules.has(rule))
            continue;
        const line = (item.labels?.[0]?.range?.start?.line ?? item.range?.start?.line ?? 0) + 1;
        const absFile = path.resolve(item.file ?? "");
        const list = skipByFile.get(absFile) ?? [];
        list.push({ rule, line, note: ruleActions[rule]?.note ?? "" });
        skipByFile.set(absFile, list);
    }
    return skipByFile;
}
/**
 * Scan complexity metrics for all supported files, grouped by absolute file path.
 */
export function scanComplexityMetrics(complexityClient, targetPath, isTsProject) {
    const metricsByFile = new Map();
    const scanDir = (dir) => {
        if (!fs.existsSync(dir))
            return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (["node_modules", ".git", "dist", "build", ".next", ".pi-lens"].includes(entry.name))
                    continue;
                scanDir(full);
            }
            else if (complexityClient.isSupportedFile(full) &&
                !/\.(test|spec)\.[jt]sx?$/.test(entry.name) &&
                !(isTsProject && /\.js$/.test(entry.name))) {
                const m = complexityClient.analyzeFile(full);
                if (m)
                    metricsByFile.set(full, { mi: m.maintainabilityIndex, cognitive: m.cognitiveComplexity, nesting: m.maxNestingDepth });
            }
        }
    };
    scanDir(targetPath);
    return metricsByFile;
}
/**
 * Score each file by combined debt signal. Higher = worse.
 */
export function scoreFiles(skipByFile, metricsByFile) {
    const allFiles = new Set([...skipByFile.keys(), ...metricsByFile.keys()]);
    return [...allFiles]
        .map((file) => {
        let score = 0;
        const m = metricsByFile.get(file);
        if (m) {
            if (m.mi < 20)
                score += 5;
            else if (m.mi < 40)
                score += 3;
            else if (m.mi < 60)
                score += 1;
            if (m.cognitive > 300)
                score += 4;
            else if (m.cognitive > 150)
                score += 2;
            else if (m.cognitive > 80)
                score += 1;
            if (m.nesting > 8)
                score += 2;
            else if (m.nesting > 5)
                score += 1;
        }
        for (const issue of skipByFile.get(file) ?? []) {
            if (issue.rule === "large-class")
                score += 5;
            else if (issue.rule === "no-as-any")
                score += 2;
            else
                score += 1;
        }
        return { file, score };
    })
        .filter((f) => f.score > 0)
        .sort((a, b) => b.score - a.score);
}
/**
 * Read a code snippet around the first violation line.
 * Returns { snippet, start, end } or null.
 */
export function extractCodeSnippet(filePath, firstLine, contextLines = 2, maxLines = 45) {
    try {
        const fileLines = fs.readFileSync(filePath, "utf-8").split("\n");
        const start = Math.max(0, (firstLine - 1) - contextLines);
        const end = Math.min(fileLines.length, start + maxLines);
        return { snippet: fileLines.slice(start, end).join("\n"), start: start + 1, end };
    }
    catch {
        return null;
    }
}
