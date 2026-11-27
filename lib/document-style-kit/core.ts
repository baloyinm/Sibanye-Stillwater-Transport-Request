// Shared helpers: document types, org loading and checks, numbering, cell formatting, small text utilities.
/** 1.3.0: Node modules are reached through process.getBuiltinModule, never imported, so this file (and the PDF builders) can be bundled for a browser. */
export const nodeModule = <T = any>(name: string): T | undefined => (globalThis as any).process?.getBuiltinModule?.(name);
import typesJson from "./types.json" with { type: "json" };
import { formatMoney, formatNumber, formatPct, isoDate, longDate } from "./format.ts";
import type { Cell, Column, DocMeta, DocTypeInfo, Org, ResolvedOrg } from "./types.ts";

/** The kit folder, used only to find the bundled fonts. 1.1.0: never throws (a bundler such as Next.js rewrites import.meta.url); when it cannot be worked out it is "" and the caller passes `fontDir` to renderPdf. */
function kitDir(): string { try { const p = nodeModule("node:path"), u = nodeModule("node:url"); return p && u ? p.resolve(p.dirname(u.fileURLToPath(import.meta.url)), "..") : ""; } catch { return ""; } }
export const KIT_DIR = kitDir();
/** 1.1.0: types.json is imported, not read from disk, so a bundled server build still knows the document types. */
export const DOC_TYPES: Record<string, DocTypeInfo> = Object.fromEntries(
  Object.entries(typesJson as unknown as Record<string, Omit<DocTypeInfo, "code">>).map(([code, v]) => [code, { code, ...v }]),
);

/** 1.12.0: the contact line of a letterhead or cover: "Tel 011 000 0000   hello@example.org   example.org", leaving out whatever is not set (never "Tel " alone). */
export const contactLine = (org: { contacts?: { tel?: string; email?: string; web?: string } }): string => [org.contacts?.tel ? `Tel ${org.contacts.tel}` : "", org.contacts?.email ?? "", org.contacts?.web ?? ""].filter(Boolean).join("   ");
/** 1.12.0: ORG-01 problems about the address, telephone number and email. A render option `allowMissingContact` lets a document print without them (the letterhead then leaves those lines out instead of inventing them). */
export const isContactProblem = (p: string): boolean => /^ORG-01 (address\.street|contacts\.tel|contacts\.email)/.test(p);

/** ORG-01 / ORG-02 (STANDARD 2). Returns plain-words problems; empty = fine. */
export function orgProblems(org: Partial<Org>, docType?: string): string[] {
  const out: string[] = [];
  if (!org.legalName) out.push("ORG-01 legalName is empty");
  if (!org.logo?.primary) out.push("ORG-01 logo.primary is empty");
  if (!org.address?.street?.length) out.push("ORG-01 address.street is empty");
  if (!org.contacts?.tel) out.push("ORG-01 contacts.tel is empty");
  if (!org.contacts?.email) out.push("ORG-01 contacts.email is empty");
  if (docType && ["INV", "CRN", "QTE", "PO", "AGR", "LSE", "RES", "APT", "OFR", "STM", "RCP"].includes(docType) && !org.registrationNo) out.push("ORG-02 registrationNo is required for commercial and legal documents");
  if (docType && ["INV", "CRN"].includes(docType) && org.vatNo === undefined) out.push("ORG-02 vatNo is not set (use an empty string only when the organisation is not VAT registered)");
  return out;
}

/** Read an org JSON file and load its logo and signature images (paths are relative to the file). */
export function loadOrg(path: string): ResolvedOrg {
  const fs = nodeModule("node:fs"), pa = nodeModule("node:path");
  if (!fs || !pa) throw new Error("loadOrg needs Node. In a browser pass the Org object with logoData bytes instead.");
  const { readFileSync, existsSync } = fs, { dirname, resolve } = pa;
  const org = JSON.parse(readFileSync(path, "utf8")) as ResolvedOrg;
  const base = dirname(resolve(path));
  const rd = (p?: string) => (p && existsSync(resolve(base, p)) ? new Uint8Array(readFileSync(resolve(base, p))) : undefined);
  org.logoData = { primary: rd(org.logo?.primary), mono: rd(org.logo?.mono), dark: rd(org.logo?.dark) };
  org.signatureData = {};
  for (const s of org.signatories ?? []) { const b = rd(s.signatureImage); if (b) org.signatureData[s.id] = b; }
  return org;
}

export const typeInfo = (code: string): DocTypeInfo => { const t = DOC_TYPES[code]; if (!t) throw new Error(`Unknown document type "${code}"`); return t; };

/** {ORG}-{TYPE}-{YYYY}-{SEQ6}; finance series that law wants gap-free use TYPE-SEQ6 (INV-000123). Pass the sequence from data/frozen-numbered-record. */
export function docNumber(org: Org, type: string, year: number, seq: number): string {
  const t = typeInfo(type);
  const s = String(seq).padStart(6, "0");
  if (t.series) return `${t.series}-${s}`;
  const pattern = org.numbering?.pattern ?? "{ORG}-{TYPE}-{YYYY}-{SEQ6}";
  return pattern.replace("{ORG}", org.numbering?.orgCode ?? "ORG").replace("{TYPE}", type).replace("{YYYY}", String(year)).replace("{SEQ6}", s);
}

export interface MetaInput { docNo: string; title: string; date: string; author: string; generatedAt: string; generatedBy?: string; version?: string; status?: DocMeta["status"]; classification?: string; ourRef?: string; yourRef?: string; enquiries?: DocMeta["enquiries"]; subtitle?: string; delivery?: string; /** 1.13.0: a short line added to the generated stamp in the footer of every page (for example "Prepared for inspection"). */ footerNote?: string; personalInfo?: boolean; external?: boolean; bodyPt?: number; /** 1.8.0: a document of a portrait type may be set landscape (design books, wide drawings); a landscape type stays landscape. */ orientation?: "portrait" | "landscape" }
/** Builds DocMeta for a type from the type table and the org defaults. */
export function makeMeta(type: string, org: Org, i: MetaInput): DocMeta {
  const t = typeInfo(type);
  const classification = i.classification ?? t.defaultClassification ?? org.classification.default;
  if (!org.classification.levels.includes(classification)) throw new Error(`Classification "${classification}" is not in org.classification.levels`);
  return {
    docType: type, docNo: i.docNo, version: i.version ?? "1.0", status: i.status ?? "DRAFT", classification,
    personalInfo: i.personalInfo ?? t.personalInfo ?? false, external: i.external ?? t.external ?? false,
    title: i.title, subtitle: i.subtitle, date: i.date, ourRef: i.ourRef, yourRef: i.yourRef, enquiries: i.enquiries,
    author: i.author, generatedAt: i.generatedAt, generatedBy: i.generatedBy ?? i.author, verification: { enabled: org.verification?.enabled ?? false },
    orientation: t.orientation ?? i.orientation ?? "portrait", bodyPt: i.bodyPt ?? t.bodyPt ?? 11, initials: t.initials, language: org.locale.language, delivery: i.delivery, footerNote: i.footerNote,
  };
}

/** Display text for one table cell. XLSX keeps the raw number; every other format shows this. */
export function cellText(col: Column, v: Cell, l: Org["locale"]): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "string") return col.type === "date" ? isoDate(v) : v;
  switch (col.type) {
    case "money": return formatMoney(v, l);
    case "int": return formatNumber(v, 0, l);
    case "num": return formatNumber(v, col.decimals ?? (v % 1 ? 2 : 0), l);
    case "pct": return col.decimals === undefined ? formatPct(v, l) : formatNumber(v, col.decimals, l) + "\u00a0%";
    default: return String(v);
  }
}
export const isNumericCol = (c: Column) => c.type === "money" || c.type === "int" || c.type === "num" || c.type === "pct";
export const colAlign = (c: Column) => c.align ?? (isNumericCol(c) ? "right" : "left");

/** Inline **bold** markers -> runs. */
export function parseRuns(text: string, base: "r" | "b" | "i" = "r"): { t: string; f: "r" | "b" | "i" | "m" }[] {
  const out: { t: string; f: "r" | "b" | "i" | "m" }[] = [];
  const parts = text.split("**");
  parts.forEach((p, i) => { if (p) out.push({ t: p, f: i % 2 ? "b" : base }); });
  return out.length ? out : [{ t: "", f: base }];
}
export const plain = (text: string) => text.replace(/\*\*/g, "");

export const levelIndex = (org: Org, classification: string) => org.classification.levels.indexOf(classification);
export const hex = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) throw new Error(`Bad colour ${h}`); const n = parseInt(m[1], 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as [number, number, number]; };
export { longDate };
