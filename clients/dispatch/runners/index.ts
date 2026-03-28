/**
 * Runner definitions for pi-lens dispatch system
 */

import { registerRunner } from "../dispatcher.js";
import biomeRunner from "./biome.js";

// Register all runners
registerRunner(biomeRunner);

// Add more runners here as they're implemented:
// import ruffRunner from "./ruff.js";
// import astGrepRunner from "./ast-grep.js";
// import typeSafetyRunner from "./type-safety.js";
// etc.
