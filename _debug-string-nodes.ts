import * as fs from "node:fs";
const sg = await import("@ast-grep/napi");
const content = fs.readFileSync("clients/latency-logger.ts", "utf-8");
const root = sg.ts.parse(content);
const rootNode = root.root();

// Find all "string" kind nodes
function findByKind(node: any, kind: string, depth: number): any[] {
  if (depth > 50) return [];
  const results: any[] = [];
  if (node.kind() === kind) results.push(node);
  for (const child of node.children()) {
    results.push(...findByKind(child, kind, depth + 1));
  }
  return results;
}

const stringNodes = findByKind(rootNode, "string", 0);
console.log(`Found ${stringNodes.length} 'string' kind nodes`);
for (const n of stringNodes.slice(0, 10)) {
  const r = n.range();
  console.log(`  L${r.start.line + 1}: kind=${n.kind()}, text=${JSON.stringify(n.text().slice(0, 80))}`);
}

// Check regex
const regex = /^javascript:/;
const matching = stringNodes.filter((n: any) => regex.test(n.text()));
console.log(`\nMatching ^javascript: regex: ${matching.length}`);
for (const n of matching.slice(0, 5)) {
  const r = n.range();
  console.log(`  L${r.start.line + 1}: ${JSON.stringify(n.text().slice(0, 80))}`);
}
