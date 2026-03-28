/**
 * Runner definitions for pi-lens dispatch system
 */

import { registerRunner } from "../dispatcher.js";

// Import all runners
import astGrepRunner from "./ast-grep.js";
import biomeRunner from "./biome.js";
import ruffRunner from "./ruff.js";
import tsLspRunner from "./ts-lsp.js";
import typeSafetyRunner from "./type-safety.js";

// Register all runners
registerRunner(tsLspRunner);
registerRunner(biomeRunner);
registerRunner(ruffRunner);
registerRunner(typeSafetyRunner);
registerRunner(astGrepRunner);
