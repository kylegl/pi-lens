/**
 * Generic interviewer tool — browser-based multiple-choice + confirmation with diff.
 * Used by lens-booboo-refactor for interactive architectural decisions.
 *
 * Two modes:
 * 1. Option selection: question + options with impact metrics
 * 2. Confirmation: plan + diff with confirm/cancel/redo
 */
import * as path from "node:path";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export type InterviewOption = {
	value: string;
	label: string;
	context?: string;
	recommended?: boolean;
	impact?: {
		linesReduced?: number;
		miProjection?: string;
		cognitiveProjection?: string;
	};
};

export function buildInterviewer(
	pi: ExtensionAPI,
	dbg: (msg: string) => void,
): (question: string, options: InterviewOption[], timeoutSeconds: number, plan?: string, diff?: string, confirmationMode?: boolean) => Promise<string | null> {
	let interviewHandler: ((question: string, options: InterviewOption[], timeoutSeconds: number, plan?: string, diff?: string, confirmationMode?: boolean) => Promise<string | null>) | null = null;

	const confirmationHTML = (question: string, plan: string, diff: string): string => {
		const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
		const mdToHtml = (md: string) =>
			md.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>")
				.replace(/^### (.+)/gm, "<h4>$1</h4>").replace(/^## (.+)/gm, "<h3>$1</h3>")
				.replace(/^# (.+)/gm, "<h2>$1</h2>").replace(/^- (.+)/gm, "<li>$1</li>")
				.replace(/\n\n/g, "</p><p>");
		const diffLines = diff.split("\n");
		const diffHtml = diffLines.map((line) => {
			if (line.startsWith("+++") || line.startsWith("---")) return `<span class="df">${esc(line)}</span>`;
			if (line.startsWith("@@")) return `<span class="dh">${esc(line)}</span>`;
			if (line.startsWith("+")) return `<span class="da">${esc(line)}</span>`;
			if (line.startsWith("-")) return `<span class="dd">${esc(line)}</span>`;
			return `<span class="dc">${esc(line)}</span>`;
		}).join("\n");
		const addCount = (diff.match(/^\+/gm) || []).length;
		const delCount = (diff.match(/^-/gm) || []).length - (diff.match(/^---/gm) || []).length;
		return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>✅ Confirm</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;padding:28px 32px;max-width:960px;margin:0 auto;line-height:1.5}
h2{font-size:16px;color:#58a6ff;margin-bottom:14px}
.plan{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:14px 18px;margin-bottom:18px;font-size:13px;line-height:1.6}
.plan h3{color:#f0f6fc;font-size:14px;margin:10px 0 4px}.plan h4{color:#c9d1d9;font-size:13px;margin:8px 0 3px}
.plan li{margin:2px 0 2px 16px;list-style:disc}.plan code{background:#21262d;padding:1px 5px;border-radius:3px;font-size:12px}
.diff-wrap{background:#161b22;border:1px solid #30363d;border-radius:8px;margin-bottom:18px;overflow:hidden}
.diff-hdr{padding:7px 14px;font-size:11px;color:#8b949e;border-bottom:1px solid #30363d;font-family:monospace;display:flex;justify-content:space-between}
.diff-stats{display:flex;gap:10px}.stat-add{color:#3fb950}.stat-del{color:#ff7b72}
.diff-pre{padding:12px;font-family:'Fira Code',Consolas,monospace;font-size:12px;line-height:1.55;overflow-x:auto;white-space:pre;margin:0}
.da{color:#3fb950;display:block}.dd{color:#ff7b72;display:block}.dh{color:#79c0ff;display:block}.df{color:#8b949e;display:block}.dc{color:#e6edf3;display:block}
.actions{display:flex;gap:10px;flex-wrap:wrap}
.btn-c{background:#238636;color:#fff;border:1px solid #2ea043;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer}.btn-c:hover{background:#2ea043}
.btn-r{background:#1a2332;color:#79c0ff;border:1px solid #1f6feb;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer}.btn-r:hover{background:#1f3050}
.btn-x{background:#21262d;color:#e6edf3;border:1px solid #30363d;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer}.btn-x:hover{background:#30363d}
.redo-area{display:none;margin-top:12px}
textarea{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:9px;border-radius:6px;font-family:inherit;font-size:13px;resize:vertical;min-height:72px;outline:none}
textarea:focus{border-color:#58a6ff}.hint{color:#6e7681;font-size:12px;margin-top:10px}
</style></head><body>
<h2>${esc(question)}</h2>
<div class="plan"><strong>Plan:</strong><p>${mdToHtml(plan)}</p></div>
<div class="diff-wrap"><div class="diff-hdr"><span>Changes</span><div class="diff-stats"><span class="stat-add">+${addCount}</span><span class="stat-del">−${delCount}</span></div></div><pre class="diff-pre">${diffHtml}</pre></div>
<form method="POST" id="f">
<input type="hidden" name="choice" id="c" value="Confirm">
<div class="actions">
<button class="btn-c" type="submit" onclick="document.getElementById('c').value='Confirm'">✅ Confirm and apply</button>
<button class="btn-r" type="button" onclick="toggleRedo()">🔄 Describe a different approach</button>
<button class="btn-x" type="submit" onclick="document.getElementById('c').value='Cancel'">❌ Cancel</button>
</div>
<div class="redo-area" id="ra"><textarea name="freeText" placeholder="What would you do differently? The agent will re-generate the plan and diff..."></textarea>
<div style="margin-top:8px"><button class="btn-c" type="submit" onclick="document.getElementById('c').value='Redo'">Submit revised approach</button></div></div>
</form>
<p class="hint">Ctrl+Enter to confirm · Tab stays open until you decide</p>
<script>
function toggleRedo(){const r=document.getElementById('ra');r.style.display=r.style.display==='none'?'block':'none';if(r.style.display==='block')r.querySelector('textarea').focus();}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){const r=document.getElementById('ra');if(r.style.display==='block'){document.getElementById('c').value='Redo';}document.getElementById('f').submit();}});
</script>
</body></html>`;
	};

	const interviewHTML = (question: string, options: InterviewOption[], _timeoutSeconds: number, _plan?: string, _diff?: string, _confirmationMode?: boolean): string => {
		if (_confirmationMode && _plan && _diff) return confirmationHTML(question, _plan, _diff);
		const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
		const optionsHtml = options.map((opt, idx) => {
			const impactBadge = (val: number, label: string, good: boolean) => `<span class="ib ${good ? "up" : "dn"}">${val > 0 ? "+" : ""}${val} ${label}</span>`;
			let impactHtml = "";
			if (opt.impact) {
				const parts: string[] = [];
				if (opt.impact.linesReduced !== undefined) parts.push(impactBadge(opt.impact.linesReduced, "lines", true));
				if (opt.impact.miProjection) parts.push(`<span class="ib proj">MI ${opt.impact.miProjection}</span>`);
				if (opt.impact.cognitiveProjection) parts.push(`<span class="ib proj">Cognitive ${opt.impact.cognitiveProjection}</span>`);
				if (parts.length) impactHtml = `<div class="impact">${parts.join("")}</div>`;
			}
			return `<label class="card${opt.recommended ? " rec" : ""}"><input type="radio" name="choice" value="${esc(opt.value)}"${opt.recommended ? " checked" : ""}><div class="card-body"><div class="card-top"><span class="num">${idx + 1}.</span><span class="lbl">${esc(opt.label)}</span>${opt.recommended ? '<span class="badge-rec">Recommended</span>' : ""}</div>${impactHtml}${opt.context ? `<div class="ctx">${esc(opt.context)}</div>` : ""}</div></label>`;
		}).join("\n");
		const hasFreeText = options.some((o) => o.value === "__free__");
		return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>🏗️ Decision</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;padding:28px 32px;max-width:880px;margin:0 auto;line-height:1.5}
.question{font-size:15px;font-weight:600;color:#f0f6fc;margin-bottom:12px}
.opts{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
.card{border:1px solid #30363d;border-radius:8px;padding:11px 14px;cursor:pointer;transition:border-color .12s,background .12s;display:flex;align-items:flex-start;gap:10px}
.card:hover,.card.selected{border-color:#58a6ff;background:#0d1f30}.card.rec{border-color:#1f6feb}
.card input{margin-top:3px;accent-color:#58a6ff;flex-shrink:0}.card-body{flex:1}
.card-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.num{color:#6e7681;font-size:13px;min-width:18px}.lbl{font-size:13.5px;font-weight:500}
.badge-rec{background:#1f4e2e;color:#3fb950;font-size:10px;padding:1px 7px;border-radius:10px;margin-left:4px;font-weight:600}
.ctx{color:#8b949e;font-size:12px;margin-top:3px;padding-left:22px}
.impact{display:flex;gap:6px;margin-top:5px;padding-left:22px;flex-wrap:wrap}
.ib{font-size:11px;padding:2px 8px;border-radius:10px;font-family:monospace;font-weight:600}
.ib.up{background:#1a3a2a;color:#3fb950;border:1px solid #238636}
.ib.dn{background:#3a1a1a;color:#ff7b72;border:1px solid #f85149}
.ib.proj{background:#1a2a3a;color:#79c0ff;border:1px solid #1f6feb}
.free-area{display:none;margin-top:10px;padding-left:22px}
textarea{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:9px;border-radius:6px;font-family:inherit;font-size:13px;resize:vertical;min-height:72px;outline:none}
textarea:focus{border-color:#58a6ff}
.submit-row{display:flex;align-items:center;gap:12px;margin-top:4px}
button{background:#238636;color:#fff;border:1px solid #2ea043;padding:9px 22px;border-radius:6px;font-size:13.5px;font-weight:600;cursor:pointer;transition:background .12s}
button:hover{background:#2ea043}.hint{color:#6e7681;font-size:12px}
</style></head><body>
<div class="question">${esc(question)}</div>
<form method="POST" id="f">
<div class="opts">${optionsHtml}</div>
${hasFreeText ? '<div class="free-area" id="fa"><textarea name="freeText" placeholder="Describe your preferred approach..."></textarea></div>' : ""}
<div class="submit-row"><button type="submit">Submit</button><span class="hint">Ctrl+Enter</span></div>
</form>
<script>
const cards=document.querySelectorAll('.card');function sel(c){cards.forEach(x=>{x.classList.remove('selected');x.querySelector('input').checked=false});c.classList.add('selected');c.querySelector('input').checked=true;const fa=document.getElementById('fa');if(fa)fa.style.display=c.querySelector('input').value==='__free__'?'block':'none';}
cards.forEach(c=>c.addEventListener('click',()=>sel(c)));const rec=document.querySelector('.card.rec');if(rec)sel(rec);else if(cards.length)sel(cards[0]);
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')document.getElementById('f').submit();});
</script></body></html>`;
	};

	const openBrowserInterview = (html: string, timeoutSeconds: number): Promise<string | null> => {
		const http = require("node:http") as typeof import("node:http");
		const net = require("node:net");
		return new Promise((resolve) => {
			const getPort = (cb: (port: number) => void) => {
				const s = net.createServer();
				s.listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => cb(p)); });
				s.on("error", () => cb(-1));
			};
			getPort((port) => {
				if (port < 0) { resolve(null); return; }
				const server = http.createServer((req, res) => {
					if (req.method === "GET") {
						res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
						res.end(html);
					} else if (req.method === "POST") {
						let body = "";
						req.on("data", (c: Buffer) => { body += c.toString(); });
						req.on("end", () => {
							const p = new URLSearchParams(body);
							const choice = p.get("choice") ?? "";
							const freeText = p.get("freeText") ?? "";
							const final = choice === "__free__" || choice === "Redo" ? freeText.trim() : choice;
							res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
							res.end("<!DOCTYPE html><html><head><meta charset='UTF-8'><style>body{font-family:system-ui;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}</style></head><body><div><h2>✅ Response received</h2><p style='color:#8b949e;margin-top:8px'>You can close this tab.</p></div></body></html>");
							clearTimeout(timer);
							server.close();
							resolve(final || null);
						});
					}
				});
				server.listen(port);
				const { spawnSync } = require("node:child_process");
				const url = `http://localhost:${port}`;
				if (process.platform === "win32") spawnSync("cmd", ["/c", "start", "", url], { shell: false });
				else if (process.platform === "darwin") spawnSync("open", [url]);
				else spawnSync("xdg-open", [url]);
				const timer = setTimeout(() => { server.close(); resolve(null); }, timeoutSeconds * 1000);
			});
		});
	};

	interviewHandler = (question, options, timeoutSeconds, plan, diff, confirmationMode) =>
		openBrowserInterview(interviewHTML(question, options, timeoutSeconds, plan, diff, confirmationMode), timeoutSeconds);

	pi.registerTool({
		name: "interviewer",
		label: "Interview",
		description: "Present a multiple-choice interview to the user via browser form. Use this when you need the user to make a decision with options. Returns their choice or null on timeout. Supports confirmation mode with plan+diff display.",
		parameters: Type.Object({
			question: Type.String({ description: "The question to present to the user" }),
			options: Type.Optional(
				Type.Array(
					Type.Object({
						value: Type.String(),
						label: Type.String(),
						context: Type.Optional(Type.String()),
						recommended: Type.Optional(Type.Boolean()),
						impact: Type.Optional(
							Type.Object({
								linesReduced: Type.Optional(Type.Number()),
								miProjection: Type.Optional(Type.String()),
								cognitiveProjection: Type.Optional(Type.String()),
							}),
						),
					}),
				),
			),
			plan: Type.Optional(Type.String({ description: "Refactoring plan (markdown) — shows in confirmation mode" })),
			diff: Type.Optional(Type.String({ description: "Unified diff text — shows in confirmation mode" })),
			confirmationMode: Type.Optional(Type.Boolean({ description: "Show plan+diff confirmation screen" })),
			timeoutSeconds: Type.Optional(Type.Number({ description: "Auto-close after this many seconds (default 600)" })),
		}),
		async execute(_toolCallId, input, _signal, _onUpdate, _ctx) {
			if (!interviewHandler)
				return { content: [{ type: "text" as const, text: "Interview tool not initialized" }], details: null };
			const result = await interviewHandler(
				input.question,
				input.options ?? [],
				input.timeoutSeconds ?? 600,
				input.plan,
				input.diff,
				input.confirmationMode,
			);
			return { content: [{ type: "text" as const, text: result ?? "No response (timed out or dismissed)" }], details: result ?? null };
		},
	});

	return interviewHandler;
}
