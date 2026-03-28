/**
 * Tool execution plan for pi-lens
 *
 * Defines which tools run for each file kind and in what order.
 * This is the declarative alternative to the if/else chains in index.ts.
 *
 * Modes:
 * - "all": Run all runners in the group
 * - "fallback": Run first available runner
 * - "first-success": Run until one succeeds
 */
/**
 * Tool plans organized by purpose
 */
export const TOOL_PLANS = {
    /**
     * Linting tools for JS/TS files
     */
    jsts: {
        name: "JavaScript/TypeScript Linting",
        groups: [
            // TypeScript LSP always runs first
            { mode: "all", runnerIds: ["ts-lsp"], filterKinds: ["jsts"] },
            // Then biome for fast linting
            { mode: "fallback", runnerIds: ["biome-lint"] },
            // Then type safety checks
            { mode: "fallback", runnerIds: ["type-safety"] },
            // Finally structural analysis
            { mode: "fallback", runnerIds: ["ast-grep"] },
        ],
    },
    /**
     * Python linting tools
     */
    python: {
        name: "Python Linting",
        groups: [
            // Ruff handles both formatting and linting
            { mode: "fallback", runnerIds: ["ruff-lint", "ruff-format"] },
            // Type safety for Python (if type-checking enabled)
            { mode: "fallback", runnerIds: ["pyright"] },
        ],
    },
    /**
     * Go linting tools
     */
    go: {
        name: "Go Linting",
        groups: [
            // Go fmt + lint
            { mode: "fallback", runnerIds: ["gofmt", "golangci-lint"] },
        ],
    },
    /**
     * Rust linting tools
     */
    rust: {
        name: "Rust Linting",
        groups: [
            // Rustfmt + clippy
            { mode: "fallback", runnerIds: ["rustfmt", "clippy"] },
        ],
    },
    /**
     * C/C++ linting tools
     */
    cxx: {
        name: "C/C++ Linting",
        groups: [
            // clang-format for formatting
            { mode: "fallback", runnerIds: ["clang-format"] },
            // clang-tidy for linting
            { mode: "fallback", runnerIds: ["clang-tidy"] },
        ],
    },
    /**
     * JSON/JSONC files
     */
    json: {
        name: "JSON Processing",
        groups: [
            // Biome handles JSON well
            { mode: "fallback", runnerIds: ["biome-json"] },
        ],
    },
    /**
     * Markdown files
     */
    markdown: {
        name: "Markdown Processing",
        groups: [
            // Prettier or other markdown formatters
            { mode: "fallback", runnerIds: ["prettier-markdown", "markdownlint"] },
        ],
    },
    /**
     * Shell scripts
     */
    shell: {
        name: "Shell Script Linting",
        groups: [
            // shellcheck for shell scripts
            { mode: "fallback", runnerIds: ["shellcheck", "shfmt"] },
        ],
    },
    /**
     * CMake files
     */
    cmake: {
        name: "CMake Processing",
        groups: [
            // cmake-format for formatting
            { mode: "fallback", runnerIds: ["cmake-format"] },
        ],
    },
};
/**
 * Get the tool plan for a specific file kind
 */
export function getToolPlan(kind) {
    return TOOL_PLANS[kind];
}
/**
 * Get all registered tool plans
 */
export function getAllToolPlans() {
    return TOOL_PLANS;
}
