// One formatter per locale. House style (STANDARD.md 3.1, GCIS editorial style): R12 345,60 / 15 November 2026 / 012 345 6789.
import type { DocSpec, ResolvedOrg } from "./types.ts";

const NBSP = " ";
export interface NumberLocale { symbol: string; symbolSpace: boolean; thousands: string; decimal: string }
/** Add a locale here, not a new formatter. */
export const NUMBER_LOCALES: Record<string, NumberLocale> = {
  "space-comma": { symbol: "R", symbolSpace: false, thousands: NBSP, decimal: "," },   // R12 345,60 (house style)
  "space-point": { symbol: "R", symbolSpace: true, thousands: NBSP, decimal: "." },    // R 12 345.60
  "en-GB": { symbol: "£", symbolSpace: false, thousands: ",", decimal: "." },
  "en-US": { symbol: "$", symbolSpace: false, thousands: ",", decimal: "." },
};
export type Locale = ResolvedOrg["locale"];
const loc = (l?: Locale) => NUMBER_LOCALES[l?.numberStyle ?? "space-comma"] ?? NUMBER_LOCALES["space-comma"];

/** Whole units with grouping and a fixed number of decimals. Uses integer maths on the rounded value, so no float noise. */
export function formatNumber(n: number, decimals = 0, l?: Locale): string {
  const nl = loc(l);
  const neg = n < 0 && Math.round(Math.abs(n) * 10 ** decimals) > 0;
  const scaled = Math.round(Math.abs(n) * 10 ** decimals);
  const s = String(scaled).padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals), frac = decimals ? s.slice(-decimals) : "";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, nl.thousands);
  return (neg ? "-" : "") + grouped + (decimals ? nl.decimal + frac : "");
}
export function formatMoney(n: number, l?: Locale): string {
  const nl = loc(l);
  const body = formatNumber(Math.abs(n), 2, l);
  const zero = Math.round(Math.abs(n) * 100) === 0;
  return (n < 0 && !zero ? "-" : "") + nl.symbol + (nl.symbolSpace ? NBSP : "") + body;       // never "-R0,00"
}
/** 1.5.0: one money style everywhere (checker COM-12). Rewrites rand amounts typed by hand in free text ("R 12 345.60", "R12,345.60", "R1 200.5") into the locale's style ("R12 345,60"). Amounts with no decimals stay without decimals ("R 500" becomes "R500"). Only the rand sign R is touched, and only for the rand locales (space-comma, space-point); other text is returned as it is. Use it on text a person typed before it goes into a builder. */
export function normaliseMoney(text: string, l?: Locale): string {
  const nl = loc(l); if (nl.symbol !== "R") return text;
  return text.replace(/(?<![A-Za-z0-9])R[ \u00a0]?(-?)(\d{1,3}(?:[ \u00a0,]\d{3})+|\d+)(?:([.,])(\d{1,2})(?!\d))?(?![A-Za-z0-9])/g, (m, neg: string, whole: string, _sep: string, frac: string | undefined) => {
    const n = Number(whole.replace(/[ \u00a0,]/g, "")); if (!Number.isFinite(n)) return m;
    const f = frac ? frac.padEnd(2, "0") : "";
    const value = n + (f ? Number(f) / 100 : 0);
    const body = formatNumber(value, f ? 2 : 0, l);
    return (neg ? "-" : "") + nl.symbol + (nl.symbolSpace ? NBSP : "") + body;
  });
}
export const formatPct = (n: number, l?: Locale) => formatNumber(n, n % 1 ? 1 : 0, l) + NBSP + "%";
export const cents = (rand: number) => Math.round(rand * 100);
export const rand = (c: number) => c / 100;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
/** 2026-11-15 -> 15 November 2026 (parsed, never passed through a time zone). */
export function longDate(iso: string): string {
  const m = ISO.exec(iso); if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
export const isoDate = (iso: string) => (ISO.exec(iso) ? iso.slice(0, 10) : iso);

/** 012 345 6789 and +27 12 345 6789 (WCG signature guideline). Anything else is returned unchanged. */
export function formatPhone(p: string): string {
  const d = p.replace(/[\s()-]/g, "");
  if (/^\+27\d{9}$/.test(d)) return `+27 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return p;
}

/** "Generated 2026-11-15 09:41 SAST" from an instant, in the organisation's zone. */
export function stamp(instant: string, tz = "Africa/Johannesburg"): string {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return instant;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  const hh = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")} ${hh}:${g("minute")}${tz === "Africa/Johannesburg" ? " SAST" : ""}`;
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100; const out: string[] = [];
  if (h) out.push(ONES[h] + " hundred");
  if (r) { if (h) out.push("and"); out.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? "-" + ONES[r % 10] : "")); }
  return out.join(" ");
}
export function wholeWords(n: number): string {
  if (n === 0) return "zero";
  const groups: [number, string][] = [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
  const out: string[] = []; let rest = n;
  for (const [v, name] of groups) { if (rest >= v) { out.push(below1000(Math.floor(rest / v)) + " " + name); rest %= v; } }
  if (rest) out.push((out.length && rest < 100 ? "and " : "") + below1000(rest));
  return out.join(" ");
}
/** 1234.56 -> "One thousand two hundred and thirty-four rand and fifty-six cents" (receipts: amount in words). */
export function moneyWords(amount: number): string {
  const c = cents(Math.abs(amount)); const r = Math.floor(c / 100), k = c % 100;
  const s = `${wholeWords(r)} rand` + (k ? ` and ${wholeWords(k)} cent${k === 1 ? "" : "s"}` : "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (v instanceof Uint8Array) return JSON.stringify(toBase64(v));
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canonicalJson(o[k])).join(",") + "}";
}
/** 1.3.0: base64 without Buffer, so the same code runs in a browser. */
export function toBase64(b: Uint8Array): string { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }
const K256 = Uint32Array.from("428a2f98 71374491 b5c0fbcf e9b5dba5 3956c25b 59f111f1 923f82a4 ab1c5ed5 d807aa98 12835b01 243185be 550c7dc3 72be5d74 80deb1fe 9bdc06a7 c19bf174 e49b69c1 efbe4786 0fc19dc6 240ca1cc 2de92c6f 4a7484aa 5cb0a9dc 76f988da 983e5152 a831c66d b00327c8 bf597fc7 c6e00bf3 d5a79147 06ca6351 14292967 27b70a85 2e1b2138 4d2c6dfc 53380d13 650a7354 766a0abb 81c2c92e 92722c85 a2bfe8a1 a81a664b c24b8b70 c76c51a3 d192e819 d6990624 f40e3585 106aa070 19a4c116 1e376c08 2748774c 34b0bcb5 391c0cb3 4ed8aa4a 5b9cca4f 682e6ff3 748f82ee 78a5636f 84c87814 8cc70208 90befffa a4506ceb bef9a3f7 c67178f2".split(" ").map((h) => parseInt(h, 16)));
/** SHA-256 in plain JavaScript (1.3.0: node:crypto is not available in a browser). Same digest as createHash("sha256"). */
export function sha256Hex(input: string | Uint8Array): string {
  const m = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const n = m.length, padded = new Uint8Array(((n + 9 + 63) >> 6) << 6); padded.set(m); padded[n] = 0x80;
  const dv = new DataView(padded.buffer); dv.setUint32(padded.length - 8, Math.floor((n * 8) / 2 ** 32)); dv.setUint32(padded.length - 4, (n * 8) >>> 0);
  const H = Uint32Array.of(0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19), w = new Uint32Array(64);
  const rr = (x: number, k: number) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i - 15]!, b = w[i - 2]!; w[i] = (w[i - 16]! + (rr(a, 7) ^ rr(a, 18) ^ (a >>> 3)) + w[i - 7]! + (rr(b, 17) ^ rr(b, 19) ^ (b >>> 10))) >>> 0; }
    let [a, b, c, d, e, f, g, h] = H as unknown as number[];
    for (let i = 0; i < 64; i++) {
      const t1 = (h! + (rr(e!, 6) ^ rr(e!, 11) ^ rr(e!, 25)) + ((e! & f!) ^ (~e! & g!)) + K256[i]! + w[i]!) >>> 0, t2 = ((rr(a!, 2) ^ rr(a!, 13) ^ rr(a!, 22)) + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) >>> 0;
      h = g; g = f; f = e; e = (d! + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i]! + v!) >>> 0; });
  }
  return [...H].map((x) => x.toString(16).padStart(8, "0")).join("");
}

/** Hash of the document's content (parts and meta, not the clock or the verification field), so the verify page can recompute it. */
export function specHash(spec: DocSpec): string {
  const { generatedAt: _g, generatedBy: _b, verification: _v, ...meta } = spec.meta;
  return sha256Hex(canonicalJson({ meta, parts: spec.parts }));
}
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** 10-character code in the form 7QK4-M2XD-9A, taken from the hash. */
export function verificationCode(hashHex: string): string {
  const bytes = Array.from({ length: 8 }, (_, i) => parseInt(hashHex.slice(i * 2, i * 2 + 2), 16));
  let bits = 0, acc = 0, out = "";
  for (const b of bytes) { acc = (acc << 8) | b; bits += 8; while (bits >= 5 && out.length < 10) { out += B32[(acc >> (bits - 5)) & 31]; bits -= 5; } }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 10)}`;
}
export function verificationUrl(org: ResolvedOrg, spec: DocSpec): string | null {
  const v = org.verification;
  if (!v?.enabled || spec.meta.verification?.enabled === false) return null;
  return `${v.baseUrl.replace(/\/$/, "")}/${encodeURIComponent(spec.meta.docNo)}?h=${verificationHash(spec, org).slice(0, 16)}`;
}
/** The hash the QR link and the Verify code come from: the one the project supplies in org.verification.hash (1.15.0), else the content hash. */
export function verificationHash(spec: DocSpec, org: ResolvedOrg): string {
  const h = org.verification?.hash;
  return h && /^[0-9a-f]{16,64}$/.test(h) ? h : specHash(spec);
}

export const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
/** COM-17: {docNo}_{slug}.{ext}, no spaces, no personal names (pass a title, never a person). */
export const fileName = (spec: DocSpec, ext: string) => `${spec.meta.docNo}_${slug(spec.meta.title)}.${ext}`;

/** Footer lines every renderer prints in the same order (STANDARD 3.2). */
export function footerParts(spec: DocSpec, org: ResolvedOrg) {
  const m = spec.meta;
  const url = verificationUrl(org, spec);
  const code = url ? verificationCode(verificationHash(spec, org)) : null;
  const personal = m.personalInfo ? (org.personalInfoText ?? DEFAULT_PERSONAL_INFO) : null;
  const legal = m.external
    ? [org.confidentialityText ?? "", [org.legalName, org.registrationNo ? `Registration number ${org.registrationNo}` : "", org.vatNo ? `VAT number ${org.vatNo}` : ""].filter(Boolean).join(", "), org.directorsLine ?? ""].filter(Boolean).join(" ")
    : null;
  return {
    left: `${m.docNo}  v${m.version}  ${m.status}`,
    centre: m.classification,
    generated: `Generated ${stamp(m.generatedAt, org.locale.tz)}${m.generatedBy ? " by " + m.generatedBy : ""}${m.footerNote ? ". " + m.footerNote : ""}`,
    code: code ? `Verify: ${code}` : null,
    url, personal, legal,
    initials: m.initials ? "Initials: ____  ____" : null,
  };
}
export const DEFAULT_PERSONAL_INFO = "This document may contain personal information protected by the Protection of Personal Information Act 4 of 2013. Use it only for the purpose it was issued for. If you received it in error, tell the sender and delete it.";
