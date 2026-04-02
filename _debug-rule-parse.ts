import { parseSimpleYaml, isStructuredRule, hasUnsupportedConditions, isOverlyBroadPattern } from "./clients/dispatch/runners/yaml-rule-parser.js";
import * as fs from "node:fs";

const content = fs.readFileSync("rules/ast-grep-rules/rules/no-javascript-url.yml", "utf-8");
const rule = parseSimpleYaml(content);
console.log("Parsed rule:", JSON.stringify(rule, null, 2));
console.log("isStructuredRule:", isStructuredRule(rule!));
console.log("hasUnsupportedConditions:", hasUnsupportedConditions(rule!));
console.log("isOverlyBroadPattern:", isOverlyBroadPattern(rule?.rule?.pattern));
