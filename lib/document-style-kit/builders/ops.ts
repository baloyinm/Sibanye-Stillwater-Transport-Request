// Operations family (STANDARD 7.2): job card and inspection report. Job card layout based on the plumbing-system job-card template and the dnr-assist job block; inspection report on the rental-agency inspection flow.
import { longDate } from "../format.ts";
import { C, P, signBlock, spec, type LineItem, type MetaInput, priceLines } from "./common.ts";
import type { Bytes, DocSpec, Org, Part } from "../types.ts";

export interface JobCardData {
  meta: MetaInput; site: string; technician: string; items: LineItem[]; approverId?: string;
  /** Required before 1.1.0; now optional: a row is printed only when it has a value. */
  customer?: string; contact?: string; jobType?: string; priority?: string; start?: string; end?: string; hours?: number;
  /** Work still to be done (a list). For a finished job give `workDone` instead or as well. */
  work?: string[]; asset?: string;
  /** 1.1.0: what was done, one paragraph per entry, under the heading "Work done". */
  workDone?: string[];
  /** 1.1.0: the heading word in the header band (default "Job Card"; "Job Report" for a finished job sent to the client). */
  title?: string;
  /** 1.1.0: false = the items are materials with quantities only (no prices, no totals), as in a report to a client. Default true. */
  showPrices?: boolean;
  photos?: { caption: string; data?: Bytes; alt: string }[];
  /** 1.1.0: `image` (PNG or JPEG bytes) draws the customer's captured signature; give it only when a sign-off event exists (SIG-02). */
  signedOff?: { name: string; date: string; comments?: string; image?: Bytes };
  /** 1.11.0: extra rows in "About this job" (for example Machine, Fleet no., Raised by). Empty values are left out. */
  facts?: [string, string][];
  /** 1.11.0: a "Times and turnaround" block (raised, started, finished, signed off, turnaround). Empty values are left out. */
  timeline?: [string, string][];
  /** 1.11.0: extra headed sections (units worked on, checks and readings, parts used, documents). A table needs at least one row; an empty section prints `empty` instead (default "None recorded."). */
  sections?: { heading: string; paragraphs?: string[]; table?: { columns: string[]; rows: string[][] }; empty?: string }[];
  /** 1.11.0: a row of signature blocks (who raised, did, checked). `image` draws a captured signature; `signedAt` marks a digital sign-off that is recorded in the system. Printed under `signaturesTitle` (default "Sign-off"). */
  signatures?: { name: string; capacity: string; date?: string; signedAt?: string; image?: Bytes }[];
  signaturesTitle?: string;
  /** 1.11.1: true puts the signature blocks two to a row (a three-person job card fits on one page). Default false (one under the other). */
  signaturesSide?: boolean;
  /** 1.11.0: false hides the customer sign-off box (a card signed by staff only). Default true. */
  customerSignoff?: boolean;
  /** 1.11.0: a link back to the record, printed as a row under About this job (a link, never a code or a secret). */
  recordUrl?: string;
  /** 1.11.0: a line printed in a notice above the body (for example "DRAFT: not signed off yet"). */
  banner?: string;
}
export function buildJobCard(d: JobCardData, org: Org): DocSpec {
  const t = priceLines(d.items, org); const priced = d.showPrices !== false;
  const meta: [string, string][] = [["Job no.", d.meta.docNo], ["Date", longDate(d.meta.date)], ...(d.priority ? [["Priority", d.priority] as [string, string]] : [])];
  const rows = ([["Customer", d.customer], ["Site", d.site], ["Contact", d.contact], ["Job type", d.jobType], ["Technician", d.technician], ["Time", d.start && d.end ? `${d.start} to ${d.end}${d.hours !== undefined ? ` (${d.hours} h)` : ""}` : undefined], ...(d.facts ?? []), ["Record", d.recordUrl]] as [string, string | undefined][]).filter((r): r is [string, string] => !!r[1]);
  const parts: Part[] = [P.letterhead("supplier"), { id: "docheader", kind: "docheader", title: d.title ?? "Job Card", meta }, P.kv("job", rows, { cols: 3, title: "About this job" }),
    ...(d.asset ? [P.para(`**Asset or vehicle:** ${d.asset}`)] : [])];
  if (d.banner) parts.splice(2, 0, { id: "banner", kind: "notice", text: d.banner, tone: "warn" });
  if (d.timeline?.some((r) => r[1])) parts.push(P.kv("timeline", d.timeline.filter((r) => r[1]), { cols: 3, title: "Times and turnaround" }));
  if (d.work?.length) parts.push(P.heading("Work to be done", 3, undefined, "work"), { id: "work-list", kind: "list", items: d.work });
  if (d.workDone?.length) { parts.push(P.heading("Work done", 3, undefined, "work-done")); d.workDone.forEach((x) => parts.push(P.para(x))); }
  if (d.items.length) parts.push(priced
    ? P.table("parts", { columns: [{ header: "Parts and labour", weight: 3 }, { header: "Qty", type: "num" }, { header: "Unit price", type: "money" }, { header: "Amount", type: "money" }], rows: t.lines.map((l) => [l.description, l.qty, l.unitPrice, C.rand(l.netC)]), totals: [["Total excl VAT", null, null, C.rand(t.netC)]], caption: "Parts and labour" })
    : P.table("parts", { columns: [{ header: "Materials used", weight: 3 }, { header: "Qty", type: "num" }], rows: d.items.map((l) => [l.description + (l.unit ? ` (${l.unit})` : ""), l.qty]), caption: "Materials used" }));
  (d.sections ?? []).forEach((s, i) => {
    parts.push(P.heading(s.heading, 3, undefined, `section-${i + 1}`));
    (s.paragraphs ?? []).forEach((x) => parts.push(P.para(x)));
    if (s.table?.rows.length) parts.push(P.table(`section-table-${i + 1}`, { columns: s.table.columns.map((h, c) => ({ header: h, weight: c === 0 ? 3 : 2 })), rows: s.table.rows, caption: s.heading }));
    else if (!s.paragraphs?.length) parts.push(P.para(s.empty ?? "None recorded."));
  });
  (d.photos ?? []).forEach((p) => parts.push({ id: "photo", kind: "figure", alt: p.alt, caption: p.caption, data: p.data, widthMm: 70 }));
  if (d.signatures?.length) parts.push(P.heading(d.signaturesTitle ?? "Sign-off", 3, undefined, "signatures-heading"),
    { id: "signatures", kind: "signature", side: d.signaturesSide, blocks: d.signatures.map((s) => ({ name: s.name, capacity: s.capacity, date: s.date, ...(s.signedAt ? { signed: { by: s.name, at: s.signedAt, method: "Digital sign-off in the system", ...(s.image ? { image: s.image } : {}) } } : {}) })) });
  if (d.customerSignoff !== false || !d.signatures?.length) parts.push(P.kv("signoff", [["Customer name", d.signedOff?.name ?? ""], ["Date", d.signedOff?.date ? longDate(d.signedOff.date) : ""], ["Comments", d.signedOff?.comments ?? ""]], { boxed: true, labelMm: 40, title: "Customer sign-off" }),
    { id: "signoff-signature", kind: "signature", blocks: [{ name: d.signedOff?.name ?? "", capacity: "Customer signature", date: d.signedOff?.date, ...(d.signedOff?.image ? { signed: { by: d.signedOff.name, at: d.signedOff.date, image: d.signedOff.image } } : {}) }] });
  else parts.push(P.kv("signoff", [["Signed off by", d.signatures.at(-1)!.name], ["Recorded", d.signatures.at(-1)!.signedAt ? "Digitally, in the system" : "Not signed off yet"]], { boxed: true, labelMm: 40, title: "Sign-off record" }));
  if (d.approverId) parts.push({ id: "approver", kind: "signature", blocks: [signBlock(org, d.approverId, "JOB", { closing: "Approved by", date: d.meta.date })] });
  return spec("JOB", org, d.meta, parts);
}

export interface InspectionData { meta: MetaInput; site: string; inspector: { name: string; registrationNo: string; verified: boolean }; scope: string; method: string; findings: { item: string; result: "Pass" | "Fail" | "N/A"; note: string; photo?: string }[]; outcome: string; recommendations: { action: string; priority: string; due: string }[]; limitations: string; signerId?: string; photos?: { caption: string; alt: string; data?: Bytes }[] }
export function buildInspectionReport(d: InspectionData, org: Org): DocSpec {
  const parts: Part[] = [P.letterhead(), { id: "title", kind: "paragraph", text: d.meta.title, bold: true, size: 16 } as Part,
    P.kv("site", [["Site", d.site], ["Date", longDate(d.meta.date)], ["Inspector", d.inspector.name], ["Registration no.", `${d.inspector.registrationNo} (${d.inspector.verified ? "VERIFIED" : "NOT VERIFIED"})`], ["Scope", d.scope], ["Method", d.method]], { boxed: true, labelMm: 34 }),
    P.table("findings", { columns: [{ header: "Item", weight: 2 }, { header: "Result" }, { header: "Note", weight: 3 }, { header: "Photo" }], rows: d.findings.map((f) => [f.item, f.result, f.note, f.photo ?? ""]), caption: "Findings" }),
    ...(d.photos ?? []).map((p) => ({ id: "photo", kind: "figure", alt: p.alt, caption: p.caption, data: p.data, widthMm: 70 } as Part)),
    { id: "outcome", kind: "notice", title: "Overall outcome", text: d.outcome }, P.table("recommendations", { columns: [{ header: "Recommendation", weight: 3 }, { header: "Priority" }, { header: "Due", type: "date" }], rows: d.recommendations.map((r) => [r.action, r.priority, r.due]), caption: "Recommendations" }),
    P.heading("Limitations", 3, undefined, "limitations"), P.para(d.limitations),
    { id: "signature", kind: "signature", blocks: [{ name: d.inspector.name, capacity: "Inspector", registrationNo: d.inspector.registrationNo, registrationStatus: d.inspector.verified ? "VERIFIED" : "NOT VERIFIED", date: d.meta.date }] }];
  return spec("INS", org, d.meta, parts);
}
