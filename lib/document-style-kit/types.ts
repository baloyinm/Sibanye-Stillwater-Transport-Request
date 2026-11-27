// document-style-kit: the shapes. An Org (who is speaking) and a DocSpec (what the document says) are plain JSON.
// The renderers never see business data: a builder turns data into a DocSpec, the renderers turn a DocSpec into files.

import type { ChartData } from "./chart.ts";
export type { ChartData } from "./chart.ts";
export type Bytes = Uint8Array;
export type Cell = string | number | null;

export interface Signatory {
  id: string; name: string; designation: string; unit?: string;
  delegationRef?: string;
  /** Path (loadOrg resolves it) or bytes of a PNG signature image. Drawn only when a sign-off event exists (SIG-02). */
  signatureImage?: string;
  /** Type codes this person may sign (LTR, INV ...). Empty or missing = any. */
  canSign?: string[];
}

export interface Org {
  legalName: string; tradingName?: string; shortName?: string;
  registrationNo?: string; vatNo?: string; taxNo?: string;
  /** Companies that must name their directors on letters (Companies Act practice). Printed in the footer of external documents. */
  directorsLine?: string;
  popiaInformationOfficer?: { name: string; email: string };
  logo: { primary: string; mono?: string; dark?: string; alt?: string };
  address: { street: string[]; postal?: string[]; country?: string };
  contacts: { tel: string; email: string; web?: string; enquiriesEmail?: string };
  bank?: { name: string; branchCode: string; accountNo: string; accountType?: string; /** 1.1.0: printed as "Account holder" in How to pay when it differs from the legal name. */ accountHolder?: string; referenceRule?: string };
  colours: { ink: string; primary: string; accent: string; muted: string; rule: string; danger: string; ok: string };
  typography?: { family?: string; fallback?: string[]; mono?: string };
  classification: { levels: string[]; default: string };
  numbering?: { pattern?: string; orgCode: string };
  /** 1.15.0: `hash` (hex, at least 16 characters) replaces the content hash in the QR link and the Verify code, for a document whose fingerprint is made and stored by a database. Leave it out and the content hash is used as before. */
  verification?: { baseUrl: string; enabled: boolean; hash?: string };
  confidentialityText?: string; personalInfoText?: string; footerText?: string;
  locale: { language: string; numberStyle: "space-comma" | "space-point" | "en-GB" | "en-US"; currency: string; tz: string };
  /** VAT rate as a fraction (0.15). Never hard-coded in a builder. */
  vatRate?: number;
  allowAbridged?: boolean;
  signatories: Signatory[];
  /** Email, SMS, WhatsApp and push settings: the same block email/message-channels-kit reads, so one Org object serves documents and messages. Field names are identical on purpose. */
  messaging?: OrgMessaging;
}

export interface OrgMessaging {
  logoUrl?: string; logoDarkUrl?: string; logoWidth?: number; logoHeight?: number;
  fromName?: string; replyTo?: string;
  linkDomains?: string[];
  preferencesUrl?: string;
  social?: { label: string; url: string }[];
  sms?: { senderId: string; optOutText?: string };
  whatsapp?: { language?: string };
  push?: { appName?: string };
}

/** An Org whose images are loaded. Made by loadOrg (Node) or by the caller (browser/edge: pass bytes). */
export interface ResolvedOrg extends Org {
  logoData?: { primary?: Bytes; mono?: Bytes; dark?: Bytes };
  signatureData?: Record<string, Bytes>;
}

export type Status = "DRAFT" | "ISSUED" | "SUPERSEDED";

export interface DocMeta {
  docType: string;               // LTR, INV ... (see types.json)
  docNo: string;
  version: string;               // 1.0
  status: Status;
  classification: string;
  personalInfo?: boolean;
  external?: boolean;            // issued outside the organisation: adds the confidentiality / legal name line
  title: string; subtitle?: string;
  date: string;                  // ISO date of the document
  ourRef?: string; yourRef?: string;
  enquiries?: { name: string; tel: string; email: string };
  author: string;
  generatedAt: string;           // ISO instant; the only clock the renderers use, so output is repeatable
  generatedBy?: string;
  verification?: { enabled: boolean };
  orientation?: "portrait" | "landscape";
  bodyPt?: number;               // 11 default, 12 for public-facing notices and forms
  initials?: boolean;            // agreements: "Initials: ____ ____" in every footer
  language?: string;
  /** Delivery marking: By email, By hand, Registered mail. */
  delivery?: string;
  /** 1.13.0: added to the generated stamp in every footer. */
  footerNote?: string;
}

export interface Column { header: string; type?: "text" | "money" | "int" | "date" | "pct" | "num"; align?: "left" | "right" | "center"; weight?: number; minMm?: number;
  /** 1.18.0: fixed number of decimals (0 to 3) for a `num` or `pct` column, in PDF, DOCX, HTML and Excel. Left out: as before (2 for a fractional `num`, 1 for a fractional `pct`, none for a whole number). */
  decimals?: number }

export interface SignBlock {
  closing?: string;                     // "Yours faithfully"
  name: string; designation?: string; unit?: string;
  forLine?: string;                     // "for the Head of Department" (only from a delegation record)
  date?: string; place?: string;
  delegationRef?: string;
  signer?: string;                      // org.signatories id
  signed?: { by: string; at: string; method?: string; certificateNo?: string; image?: Bytes };
  capacity?: string;                    // party, witness ...
  registrationNo?: string; registrationStatus?: "VERIFIED" | "NOT VERIFIED";
}

/** One picture in a gallery. `label` is printed bold before the caption. `file` is for the command line (see Part figure). */
export interface GalleryItem { alt: string; caption: string; label?: string; data?: Bytes; file?: string }

type Base = { id: string };
export type Part =
  | (Base & { kind: "letterhead"; variant?: "letter" | "supplier" })
  /** Finance header (lifted from the dnr-assist and plumbing invoice layouts): document title word, number and date block on the right of the letterhead. */
  | (Base & { kind: "docheader"; title: string; meta: [string, string][]; tag?: string })
  | (Base & { kind: "refbox"; label: string; value: string; note?: string })
  | (Base & { kind: "cards"; cards: { label: string; name?: string; lines: string[] }[] })
  | (Base & { kind: "totals"; rows: [string, number][]; total?: [string, number]; extra?: [string, number][] })
  | (Base & { kind: "cover"; title: string; subtitle?: string; rows: [string, string][] })
  | (Base & { kind: "doccontrol"; rows: [string, string][]; history?: { version: string; date: string; author: string; summary: string }[] })
  | (Base & { kind: "contents"; maxLevel?: number })
  | (Base & { kind: "heading"; level: 1 | 2 | 3; text: string; num?: string })
  | (Base & { kind: "paragraph"; text: string; num?: string; bold?: boolean; italic?: boolean; size?: number; indentMm?: number; keepNext?: boolean; align?: "left" | "center" })
  | (Base & { kind: "list"; items: string[]; ordered?: boolean })
  | (Base & { kind: "kv"; rows: [string, string][]; title?: string; labelMm?: number; boxed?: boolean; cols?: 1 | 3 })
  | (Base & { kind: "lines"; lines: string[]; title?: string })
  | (Base & { kind: "subject"; text: string })
  | (Base & { kind: "table"; columns: Column[]; rows: Cell[][]; totals?: Cell[][]; caption?: string; source?: string; boldFirstCol?: boolean; note?: string })
  | (Base & { kind: "signature"; blocks: SignBlock[]; side?: boolean })
  | (Base & { kind: "approval"; title: string; options: string[]; by?: { name: string; designation: string; forLine?: string; delegationRef?: string }; comment?: boolean; chosen?: number; date?: string; signed?: { by: string; at: string } })
  | (Base & { kind: "checklist"; items: { text: string; result: string }[] })
  | (Base & { kind: "notice"; title?: string; text: string; tone?: "info" | "warn" })
  | (Base & { kind: "fields"; fields: { label: string; help?: string; required?: boolean; type?: "text" | "multiline" | "tick" | "date" }[] })
  | (Base & { kind: "figure"; alt: string; caption: string; data?: Bytes; widthMm?: number; /** Command line only (1.7.0): image file path relative to the spec file; cli.ts loads it into `data`. */ file?: string })
  /** 1.7.0: a grid of pictures with captions (plans, mood boards, site photos, renders). 1 to 3 columns, every picture fitted inside its cell without cropping, every picture has alt text and a caption. */
  | (Base & { kind: "gallery"; columns?: 1 | 2 | 3; imageHeightMm?: number; items: GalleryItem[] })
  /** 1.13.0: a chart drawn from data (line, bar or timeline): vector in PDF, inline SVG in HTML, a described figure in Word. Needs `alt` text and a caption; print the numbers in a table beside it. */
  | (Base & { kind: "chart"; chart: ChartData })
  | (Base & { kind: "attachments"; items: string[] })
  | (Base & { kind: "pagebreak" });

export interface DocSpec { meta: DocMeta; parts: Part[] }

export interface DocTypeInfo { code: string; name: string; family: string; titleWord: string; orientation?: "portrait" | "landscape"; defaultClassification?: string; series?: string; external?: boolean; personalInfo?: boolean; initials?: boolean; bodyPt?: number }
