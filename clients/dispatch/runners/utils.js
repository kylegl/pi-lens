/**
 * Shared utilities for runners
 */
import * as fs from "node:fs";
/**
 * Read file content, returning undefined if it can't be read
 */
export function readFileContent(filePath) {
    try {
        return fs.readFileSync(filePath, "utf-8");
    }
    catch {
        return undefined;
    }
}
/**
 * Check if a command is available
 */
export function isCommandAvailable(command) {
    try {
        const { spawnSync } = require("node:child_process");
        const result = spawnSync(command, ["--version"], {
            encoding: "utf-8",
            timeout: 5000,
            shell: true,
        });
        return result.status === 0;
    }
    catch {
        return false;
    }
}
