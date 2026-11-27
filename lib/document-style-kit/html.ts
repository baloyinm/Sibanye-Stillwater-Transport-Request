// Print HTML renderer: one self-contained page that prints like the PDF (@page margin boxes carry the number, classification and "Page x of y").
// Semantic markup (lang, title, h1 for the title then h2..h4, real tables with <th scope>, alt text, labelled fields) so it is also the accessible web copy.
// With Chromium or Playwright available, htmlToTaggedPdf() makes a tagged PDF from it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync as rf, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { KIT_DIR, isContactProblem, cellText, colAlign, levelIndex, orgProblems, parseRuns } from "./core.ts";
import { footerParts, formatMoney, longDate, verificationUrl } from "./format.ts";
import { qrSvg } from "./qr.ts";
import { chartSvg } from "./chart.ts";
import type { Bytes, DocSpec, Part, ResolvedOrg, SignBlock } from "./types.ts";

const e = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rich = (t: string) => parseRuns(t).map((r) => (r.f === "b" ? `<strong>${e(r.t)}</strong>` : e(r.t))).join("").replace(/\n/g, "<br>");
const dataUri = (b: Bytes) => `data:image/${b[0] === 0x89 ? "png" : "jpeg"};base64,${Buffer.from(b).toString("base64")}`;
export interface HtmlOptions { fonts?: "embed" | "link" | "none"; fontBaseUrl?: string; /** 1.1.0: folder with the Latin font files for fonts:"embed" (default: the kit folder). */ fontDir?: string; /** 1.12.0: print without an address, telephone number or email on file (those lines are left out). */ allowMissingContact?: boolean }

export function renderHtml(spec: DocSpec, org: ResolvedOrg, opts: HtmlOptions = {}): string {
  const problems = orgProblems(org, spec.meta.docType).filter((p) => p.startsWith("ORG-01") && !p.includes("logo") && !(opts.allowMissingContact && isContactProblem(p)));
  if (problems.length) throw new Error(problems.join("; "));
  const m = spec.meta; const lang = m.language ?? org.locale.language; const landscape = m.orientation === "landscape"; const bodyPt = m.bodyPt ?? 11;
  const fp = footerParts(spec, org); const url = verificationUrl(org, spec);
  const c = org.colours; const family = org.typography?.family ?? "Source Sans 3";
  const mode = opts.fonts ?? "link"; const base = opts.fontBaseUrl ?? "fonts/";
  const face = (file: string, weight: number, style: string) => { const src = mode === "embed" ? `url(data:font/ttf;base64,${readFileSync(/*turbopackIgnore: true*/ resolve(opts.fontDir ?? resolve(KIT_DIR, "fonts", "latin"), file)).toString("base64")}) format("truetype")` : `url(${base}latin/${file}) format("truetype")`; return `@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};src:${src}}`; };
  const faces = mode === "none" ? "" : [face("SourceSans3-Regular.ttf", 400, "normal"), face("SourceSans3-SemiBold.ttf", 600, "normal"), face("SourceSans3-Bold.ttf", 700, "normal"), face("SourceSans3-Italic.ttf", 400, "italic")].join("");
  const lvl = levelIndex(org, m.classification); const wm = m.status === "DRAFT" ? "DRAFT" : m.status === "SUPERSEDED" ? "SUPERSEDED" : "";
  const topMm = landscape ? 22 : 24, botMm = fp.personal || fp.legal ? 40 : 30;
  const footBox = (s: string) => `"${s.replace(/"/g, '\\"').replace(/\n/g, "\\A ")}"`;
  const leftBox = footBox([fp.left, fp.generated + (fp.initials ? "   " + fp.initials : ""), fp.personal, fp.legal].filter(Boolean).join("\n"));
  const qrCorner = url ? `@page{@bottom-right-corner{content:url("data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(url, { quiet: 1 }).replace("<svg ", `<svg width="53" height="53" `))}");vertical-align:bottom;padding-bottom:6mm}}` : "";
  const css = `${faces}
@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:${topMm}mm ${landscape ? 15 : 20}mm ${botMm}mm ${landscape ? 15 : 25}mm;
 @bottom-left{content:${leftBox};width:62%;font:400 8pt/1.25 "${family}",Arial,sans-serif;white-space:pre-line;color:${c.muted};vertical-align:top;padding-top:2mm;border-top:.5pt solid ${c.rule}}
 @bottom-center{content:${footBox(fp.centre)};width:13%;font:700 8pt "${family}",Arial,sans-serif;color:${c.ink};vertical-align:top;text-align:center;padding-top:2mm;border-top:.5pt solid ${c.rule}}
 @bottom-right{content:"Page " counter(page) " of " counter(pages)${fp.code ? ` "\\A ${fp.code}"` : ""};width:25%;font:600 8pt/1.25 "${family}",Arial,sans-serif;white-space:pre-line;text-align:right;color:${c.ink};vertical-align:top;padding-top:2mm;border-top:.5pt solid ${c.rule}}
 @top-left{content:${footBox(org.shortName ?? org.legalName)};font:600 8.5pt "${family}",Arial,sans-serif;vertical-align:bottom;padding-bottom:2mm;border-bottom:.5pt solid ${c.rule}}
 @top-right{content:${footBox(`${m.title}  |  ${m.docNo}`)};font:400 8.5pt "${family}",Arial,sans-serif;color:${c.muted};vertical-align:bottom;padding-bottom:2mm;border-bottom:.5pt solid ${c.rule}}}
@page:first{@top-left{content:none;border:0}@top-right{content:none;border:0}}
*{box-sizing:border-box}html{lang:${lang}}
body{font:400 ${bodyPt}pt/1.36 "${family}",Arial,Helvetica,sans-serif;color:${c.ink};margin:0;text-align:left}
h1{font-size:20pt;margin:0 0 6pt}h2{font-size:14pt;color:${c.primary};margin:16pt 0 6pt;border-bottom:.6pt solid ${c.rule};padding-bottom:3pt;break-after:avoid}h3{font-size:12pt;color:${c.primary};margin:11pt 0 4pt;break-after:avoid}h4{font-size:${bodyPt}pt;margin:9pt 0 3pt;break-after:avoid}
p{margin:0 0 6pt;orphans:2;widows:2}.muted{color:${c.muted}}.small{font-size:8.5pt}
.lh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.4pt solid ${c.primary};padding-bottom:7pt;margin-bottom:6mm}.lh img{height:16mm;max-width:52mm;object-fit:contain;display:block;margin-bottom:2pt}.lh .name{font-weight:700;font-size:12.5pt;color:${c.primary}}.lh .addr{text-align:right;font-size:8.5pt}.reg{font-size:8pt;color:${c.muted};margin:-4mm 0 6mm}
.dh{text-align:right}.dh .t{font-size:20pt;font-weight:700;color:${c.primary}}.dh .tag{font-weight:700;font-size:9pt;color:${c.danger}}.dh .m{font-size:10pt}.dh .m span{color:${c.muted};font-size:9pt;margin-right:8pt}.dh .m b{font-weight:700}
table{border-collapse:collapse;width:100%;margin:0 0 8pt;font-size:${bodyPt >= 12 ? 10 : landscape ? 8.5 : 9}pt}caption{text-align:left;font-weight:600;font-size:9pt;padding-bottom:3pt;caption-side:top}
th{background:${c.primary};color:#fff;font-weight:700;text-align:left;padding:3pt 5pt;vertical-align:bottom}td{padding:3pt 5pt;border-bottom:.4pt solid ${c.rule};vertical-align:top}thead{display:table-header-group}tr{break-inside:avoid}
td.r,th.r{text-align:right;white-space:nowrap}td.c,th.c{text-align:center}tfoot td{font-weight:700;border-top:.9pt solid ${c.ink}}
dl.kv{display:grid;grid-template-columns:30mm 1fr;gap:1pt 8pt;margin:0 0 8pt}dl.kv dt{font-weight:600;color:${c.muted}}dl.kv dd{margin:0}dl.boxed{border:.7pt solid ${c.rule};padding:5pt 6pt}
.kv3{display:grid;grid-template-columns:repeat(3,1fr);gap:4pt 10pt;border:.7pt solid ${c.rule};padding:5pt 8pt;margin-bottom:8pt}.kv3 span{display:block;font-size:8pt;color:${c.muted}}.kv3 b{font-weight:600}
.ref{display:flex;justify-content:space-between;align-items:center;border:1pt solid ${c.primary};background:#f4f5f7;padding:6pt 10pt;margin-bottom:8pt}.ref b{font-size:13pt}.ref span{font-weight:600;color:${c.muted}}
.cards{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4mm;margin-bottom:8pt}.card{border:.8pt solid ${c.rule};padding:6pt 8pt;break-inside:avoid}.card h4{margin:0 0 2pt;font-size:8.5pt;color:${c.muted}}.card .n{font-weight:700}
.totals{width:48%;margin-left:auto;font-size:${bodyPt - 0.5}pt}.totals td{border:0;padding:2pt 6pt}.totals td+td{text-align:right;font-weight:600}.totals tr.grand td{background:${c.primary};color:#fff;font-weight:700;font-size:13pt;padding:5pt 8pt}
.notice{background:#f4f5f7;border-left:3.5pt solid ${c.primary};padding:7pt 10pt;margin:0 0 8pt;break-inside:avoid}.notice.warn{border-color:${c.danger}}.notice b{display:block}
.sig{display:inline-block;vertical-align:top;width:48%;margin:0 2% 10pt 0;break-inside:avoid}.sig .line{border-bottom:.8pt solid ${c.ink};height:18mm;display:flex;align-items:flex-end}.sig img{max-height:17mm;max-width:48mm}.sig .ns{font-style:italic;font-size:8.5pt;color:${c.muted}}
.approval{border:.9pt solid ${c.ink};padding:8pt 10pt;margin:0 0 10pt;break-inside:avoid}.approval .opt{margin:2pt 0;font-weight:600}.approval .cm{border-bottom:.4pt solid ${c.rule};height:7mm}
.field{margin:0 0 8pt;break-inside:avoid}.field label{display:block}.field .help{font-style:italic;font-size:9pt;color:${c.muted}}.field input,.field textarea{width:100%;border:.8pt solid ${c.ink};height:9mm;font:inherit;padding:2pt}.field textarea{height:24mm}
.toc{list-style:none;padding:0;margin:0}.toc li{display:flex;gap:6pt}.toc li.l2{padding-left:7mm}.toc a{color:inherit;text-decoration:none}
.cover{min-height:230mm;display:flex;flex-direction:column;break-after:page}.cover img{height:26mm;width:auto;align-self:flex-start}.cover h1{font-size:28pt;border-top:2pt solid ${c.primary};padding-top:10pt;margin-top:34mm}.cover dl{margin-top:auto}
.wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:${wm === "DRAFT" ? 130 : 84}pt;font-weight:700;color:#000;opacity:.08;transform:rotate(-45deg);z-index:-1}.status-tag{position:fixed;top:-${topMm - 8}mm;right:0;border:.8pt solid ${wm ? c.danger : c.ink};color:${wm ? c.danger : c.ink};font-weight:700;font-size:8pt;padding:1pt 5pt}
@media screen{body{max-width:190mm;margin:10mm auto;padding:0 5mm}.status-tag{position:static}}\n${qrCorner}`;

  const lg = org.logoData?.primary; const logo = lg ? `<img src="${dataUri(lg)}" alt="${e(org.logo.alt ?? org.legalName)}">` : "";
  const addr = [...org.address.street, ...(org.address.postal?.length ? ["Postal: " + org.address.postal.join(", ")] : []), ...(org.contacts.tel ? [`Tel ${org.contacts.tel}`] : []), ...(org.contacts.email ? [org.contacts.email] : []), ...(org.contacts.web ? [org.contacts.web] : [])];
  const reg = [org.registrationNo ? `Registration number ${org.registrationNo}` : "", org.vatNo ? `VAT number ${org.vatNo}` : (org.vatNo === "" ? "Not registered for VAT" : ""), org.directorsLine ?? ""].filter(Boolean).join("   ");
  let tableNo = 0; const out: string[] = []; const parts = spec.parts;
  let lastH = 1;   // 1.9.0: heading levels never skip in the HTML (h1 title, then h2, h3 ...): a level-3 heading after a level-1 one prints as h3 only when an h2 came before it (checker COM-13)
  const sig = (b: SignBlock) => { const img = b.signed?.image ?? (b.signer ? org.signatureData?.[b.signer] : undefined); return `<div class="sig">${b.closing ? `<p>${e(b.closing)}</p>` : ""}${b.capacity ? `<p><strong>${e(b.capacity)}</strong></p>` : ""}<div class="line">${b.signed && img ? `<img src="${dataUri(img)}" alt="Signature of ${e(b.name)}">` : b.signed ? "" : `<span class="ns">Not yet signed</span>`}</div><p><strong>${e(b.name)}</strong><br>${e([b.designation, b.unit].filter(Boolean).join(", "))}${b.forLine ? `<br><em>${e(b.forLine)}</em>` : ""}${b.registrationNo ? `<br>Registration no. ${e(b.registrationNo)} (${b.registrationStatus ?? "NOT VERIFIED"})` : ""}<br>Date: ${b.date ? e(longDate(b.date)) : "____________________"}${b.place ? "   Place: " + e(b.place) : ""}${b.delegationRef ? `<br><span class="small muted">Delegation reference: ${e(b.delegationRef)}</span>` : ""}${b.signed ? `<br><span class="small muted">Signed electronically by ${e(b.signed.by)}, ${e(b.signed.at)}${b.signed.method ? ", " + e(b.signed.method) : ""}${b.signed.certificateNo ? ", certificate " + e(b.signed.certificateNo) : ""}</span>` : ""}</p></div>`; };
  const table = (p: Extract<Part, { kind: "table" }>) => {
    const cap = p.caption ? (tableNo++, `<caption>Table ${tableNo}. ${e(p.caption)}</caption>`) : "";
    const th = p.columns.map((col) => `<th scope="col" class="${colAlign(col) === "right" ? "r" : colAlign(col) === "center" ? "c" : ""}">${e(col.header)}</th>`).join("");
    const row = (r: (string | number | null)[], first: boolean) => `<tr>${p.columns.map((col, i) => `<${first && p.boldFirstCol && i === 0 ? "th scope=\"row\" style=\"background:none;color:inherit\"" : "td"} class="${colAlign(col) === "right" ? "r" : colAlign(col) === "center" ? "c" : ""}">${e(cellText(col, r[i], org.locale))}</${first && p.boldFirstCol && i === 0 ? "th" : "td"}>`).join("")}</tr>`;
    return `<table>${cap}<thead><tr>${th}</tr></thead><tbody>${p.rows.map((r) => row(r, true)).join("")}</tbody>${p.totals?.length ? `<tfoot>${p.totals.map((r) => row(r, false)).join("")}</tfoot>` : ""}</table>${p.source ? `<p class="small muted"><em>Source: ${e(p.source)}</em></p>` : ""}${p.note ? `<p class="small muted">${e(p.note)}</p>` : ""}`;
  };
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    switch (p.kind) {
      case "letterhead": {
        const nxt = parts[i + 1];
        if (p.variant === "supplier" && nxt?.kind === "docheader") { out.push(`<header class="lh"><div>${logo}<div class="name">${e(org.legalName)}</div><div class="addr" style="text-align:left">${addr.map(e).join("<br>")}${reg ? "<br>" + e(reg) : ""}</div></div><div class="dh"><h1 class="t" style="margin:0;font-size:inherit">${e(nxt.title)}</h1>${nxt.tag ? `<div class="tag">${e(nxt.tag)}</div>` : ""}${nxt.meta.map(([k, v]) => `<div class="m"><span>${e(k)}</span><b>${e(v)}</b></div>`).join("")}</div></header>`); i++; }
        else out.push(`<header class="lh"><div>${logo}<div class="name">${e(org.tradingName ?? org.legalName)}</div>${org.tradingName && org.tradingName !== org.legalName ? `<div class="small muted">${e(org.legalName)}</div>` : ""}</div><div class="addr">${addr.map(e).join("<br>")}</div></header>${reg ? `<p class="reg">${e(reg)}</p>` : ""}`);
        break;
      }
      case "docheader": break;
      case "cover": out.push(`<section class="cover">${logo}<p><strong>${e(org.legalName)}</strong></p><h1>${e(p.title)}</h1>${p.subtitle ? `<p style="font-size:15pt" class="muted">${e(p.subtitle)}</p>` : ""}<dl class="kv" style="grid-template-columns:42mm 1fr">${p.rows.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join("")}</dl><p class="small">${e(addr.slice(0, 2).join(", "))}   ${e(org.contacts.email)}<br>${e(reg)}</p></section>`); break;
      case "doccontrol": out.push(`<h2>Document control</h2><dl class="kv boxed" style="grid-template-columns:42mm 1fr">${p.rows.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join("")}</dl>`); if (p.history?.length) out.push(table({ id: "h", kind: "table", columns: [{ header: "Version" }, { header: "Date", type: "date" }, { header: "Author" }, { header: "Summary" }], rows: p.history.map((h) => [h.version, h.date, h.author, h.summary]) })); break;
      case "contents": { const max = p.maxLevel ?? 2; out.push(`<h2>Contents</h2><ul class="toc">${parts.filter((q): q is Extract<Part, { kind: "heading" }> => q.kind === "heading" && q.level <= max).map((h) => `<li class="l${h.level}"><a href="#${e(h.id)}">${e((h.num ? h.num + "  " : "") + h.text)}</a></li>`).join("")}</ul>`); break; }
      case "heading": { const hl = Math.min(p.level + 1, lastH + 1); lastH = hl; out.push(`<h${hl} id="${e(p.id)}">${e((p.num ? p.num + "  " : "") + p.text)}</h${hl}>`); break; }
      case "paragraph": if (p.id === "title" && !p.num) { out.push(`<h1 style="${p.bold ? "font-weight:700;" : ""}${p.size ? `font-size:${p.size}pt;` : ""}${p.align === "center" ? "text-align:center;" : ""}">${rich(p.text)}</h1>`); break; }   // 1.9.0: the document's title paragraph is the h1
        out.push(`<p style="${p.bold ? "font-weight:700;" : ""}${p.italic ? "font-style:italic;" : ""}${p.size ? `font-size:${p.size}pt;` : ""}${p.align === "center" ? "text-align:center;" : ""}${p.indentMm ? `margin-left:${p.indentMm}mm;` : ""}">${p.num ? `<strong>${e(p.num)}</strong>&nbsp;&nbsp;` : ""}${rich(p.text)}</p>`); break;
      case "list": out.push(`<${p.ordered ? "ol" : "ul"}>${p.items.map((t) => `<li>${rich(t)}</li>`).join("")}</${p.ordered ? "ol" : "ul"}>`); break;
      case "kv": out.push(`${p.title ? `<h${Math.min(lastH + 1, 6)}>${e(p.title)}</h${Math.min(lastH + 1, 6)}>` : ""}${p.cols === 3 ? `<div class="kv3">${p.rows.map(([k, v]) => `<div><span>${e(k)}</span><b>${e(v || "-")}</b></div>`).join("")}</div>` : `<dl class="kv${p.boxed ? " boxed" : ""}" style="grid-template-columns:${p.labelMm ?? 30}mm 1fr">${p.rows.map(([k, v]) => `<dt>${e(k)}</dt><dd>${rich(v)}</dd>`).join("")}</dl>`}`); break;
      case "lines": out.push(`<p>${p.title ? `<span class="small muted">${e(p.title)}</span><br>` : ""}${p.lines.map((l, n) => (n === 0 ? `<strong>${e(l)}</strong>` : e(l))).join("<br>")}</p>`); break;
      case "subject": out.push(`<p style="font-weight:700;font-size:${bodyPt + 1}pt">${rich(p.text)}</p>`); break;
      case "refbox": out.push(`<div class="ref"><span>${e(p.label)}</span><b>${e(p.value)}</b></div>`); break;
      case "cards": out.push(`<div class="cards">${p.cards.map((cd) => `<div class="card"><h4>${e(cd.label)}</h4>${cd.name ? `<div class="n">${e(cd.name)}</div>` : ""}${cd.lines.map((l) => `<div>${e(l)}</div>`).join("")}</div>`).join("")}</div>`); break;
      case "totals": out.push(`<table class="totals"><tbody>${p.rows.map(([k, v]) => `<tr><td>${e(k)}</td><td>${e(formatMoney(v, org.locale))}</td></tr>`).join("")}${p.total ? `<tr class="grand"><td>${e(p.total[0])}</td><td>${e(formatMoney(p.total[1], org.locale))}</td></tr>` : ""}${(p.extra ?? []).map(([k, v]) => `<tr><td>${e(k)}</td><td>${e(formatMoney(v, org.locale))}</td></tr>`).join("")}</tbody></table>`); break;
      case "table": out.push(table(p)); break;
      case "signature": out.push(`<div>${p.blocks.map(sig).join("")}</div>`); break;
      case "approval": out.push(`<div class="approval"><strong style="color:${c.primary}">${e(p.title)}</strong>${p.options.map((o, n) => `<div class="opt">${p.chosen === n ? "&#9746;" : "&#9744;"} ${e(o)}</div>`).join("")}${p.comment === false ? "" : `<p class="small muted" style="margin-top:6pt">Comments</p><div class="cm"></div><div class="cm"></div>`}<div class="line" style="border-bottom:.8pt solid ${c.ink};height:14mm;display:flex;align-items:flex-end"><span class="ns small muted"><em>${p.signed ? e(`Signed by ${p.signed.by}, ${p.signed.at}`) : "Not yet signed"}</em></span></div><p>${p.by ? `<strong>${e(p.by.name)}</strong><br>${e(p.by.designation)}${p.by.forLine ? `<br><em>${e(p.by.forLine)}</em>` : ""}` : "Name"}<br>Date: ${p.date ? e(longDate(p.date)) : "____________________"}${p.by?.delegationRef ? `<br><span class="small muted">Delegation reference: ${e(p.by.delegationRef)}</span>` : ""}</p></div>`); break;
      case "checklist": out.push(table({ id: p.id, kind: "table", columns: [{ header: "Item" }, { header: "Result" }], rows: p.items.map((q) => [q.text, q.result]) })); break;
      case "notice": out.push(`<div class="notice${p.tone === "warn" ? " warn" : ""}" role="note">${p.title ? `<b>${e(p.title)}</b>` : ""}${rich(p.text)}</div>`); break;
      case "fields": out.push(p.fields.map((f, n) => `<div class="field"><label for="${e(p.id)}-${n}">${n + 1}.&nbsp; <strong>${e(f.label)}</strong>${f.required ? " (required)" : ""}</label>${f.help ? `<div class="help">${e(f.help)}</div>` : ""}${f.type === "tick" ? `<label><input id="${e(p.id)}-${n}" type="checkbox"> Yes</label>` : f.type === "multiline" ? `<textarea id="${e(p.id)}-${n}"${f.required ? " required" : ""}></textarea>` : `<input id="${e(p.id)}-${n}" type="${f.type === "date" ? "date" : "text"}"${f.required ? " required" : ""}>`}</div>`).join("")); break;
      case "figure": out.push(`<figure style="margin:0 0 8pt">${p.data ? `<img src="${dataUri(p.data)}" alt="${e(p.alt)}" style="max-width:${p.widthMm ?? 120}mm">` : ""}<figcaption class="small muted"><em>${e(p.caption)}</em></figcaption></figure>`); break;
      case "chart": out.push(`<figure class="chart" style="margin:0 0 8pt;break-inside:avoid">${chartSvg(p.chart, org)}<figcaption class="small muted"><em>${e(p.chart.caption)}</em></figcaption></figure>`); break;
      case "gallery": out.push(`<div class="gallery" style="display:grid;grid-template-columns:repeat(${p.columns ?? 2},1fr);gap:6mm;margin:0 0 8pt">${p.items.map((it) => `<figure style="margin:0;break-inside:avoid">${it.data ? `<img src="${dataUri(it.data)}" alt="${e(it.alt)}" style="width:100%;max-height:${p.imageHeightMm ?? ((p.columns ?? 2) === 1 ? 110 : (p.columns ?? 2) === 2 ? 70 : 50)}mm;object-fit:contain">` : ""}<figcaption class="small muted">${it.label ? `<strong>${e(it.label)}</strong> ` : ""}${e(it.caption)}</figcaption></figure>`).join("")}</div>`); break;
      case "attachments": out.push(`<p><strong>Enclosures: ${p.items.length}</strong></p><ol class="small">${p.items.map((t) => `<li>${e(t)}</li>`).join("")}</ol>`); break;
      case "pagebreak": out.push(`<div style="break-after:page"></div>`); break;
    }
  }
  const tag = [lvl >= 2 ? m.classification.toUpperCase() : "", wm].filter(Boolean).join("   ");
  const footer = url ? `<p class="small muted" style="display:none">${e(fp.code ?? "")}</p>` : "";
  return `<!DOCTYPE html>\n<html lang="${e(lang)}"><head><meta charset="utf-8"><title>${e(`${m.title} (${m.docNo})`)}</title><meta name="author" content="${e(m.author)}"><meta name="generator" content="document-style-kit"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${wm ? `<div class="wm" aria-hidden="true">${wm}</div>` : ""}${tag ? `<div class="status-tag">${e(tag)}</div>` : ""}<main>${out.join("\n")}</main>${footer}</body></html>`;
}

/** Tagged, outlined PDF from the print HTML. Needs Playwright with Chromium (page.pdf with tagged and outline) or a Chrome/Chromium binary. Returns null when neither is available. */
export async function htmlToTaggedPdf(html: string): Promise<Uint8Array | null> {
  const dir = mkdtempSync(resolve(tmpdir(), "dsk-")); const file = resolve(dir, "doc.html"); writeFileSync(/*turbopackIgnore: true*/ file, html);
  try {
    try {
      // 1.9.0: the specifier is a variable and every bundler is told to leave it alone, so importing the kit's index in a Next.js, Vite or webpack build never tries to resolve Playwright (and its chromium-bidi) at build time.
      const mod = ["play", "wright"].join(""); const pw: any = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ mod);
      const browser = await pw.chromium.launch(); const page = await browser.newPage(); await page.goto("file://" + file);
      const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, tagged: true, outline: true }); await browser.close(); return new Uint8Array(pdf);
    } catch { /* fall through to a Chrome binary */ }
    for (const bin of ["google-chrome", "chromium", "chromium-browser"]) {
      const out = resolve(dir, "doc.pdf");
      const r = spawnSync(/*turbopackIgnore: true*/ bin, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--generate-pdf-document-outline", `--print-to-pdf=${out}`, "file://" + file], { timeout: 60000 });
      if (r.status === 0) { try { return new Uint8Array(rf(/*turbopackIgnore: true*/ out)); } catch { /* next */ } }
    }
    return null;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
