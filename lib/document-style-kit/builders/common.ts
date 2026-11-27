// Helpers every builder uses. A builder is (data, org) => DocSpec. It holds the document's structure; the renderers hold the look.
import { cents, formatMoney, formatPhone, longDate, rand } from "../format.ts";
import { makeMeta, typeInfo, type MetaInput } from "../core.ts";
import type { DocMeta, DocSpec, Org, Part, SignBlock } from "../types.ts";

export type { MetaInput };
export interface Addressee { name: string; designation?: string; organisation?: string; lines: string[] }
export interface Enquiries { name: string; tel: string; email: string }

/** SIG-01 and SIG-04: the signer comes from org.signatories and must be allowed to sign this type. */
export function signer(org: Org, id: string, type: string) {
  const s = org.signatories.find((x) => x.id === id);
  if (!s) throw new Error(`SIG-01 signatory "${id}" is not in org.signatories`);
  if (s.canSign?.length && !s.canSign.includes(type)) throw new Error(`SIG-01 ${s.name} may not sign ${type} (org.signatories[${id}].canSign)`);
  return s;
}
export function signBlock(org: Org, id: string, type: string, o: Partial<SignBlock> = {}): SignBlock {
  const s = signer(org, id, type);
  return { signer: s.id, name: s.name, designation: s.designation, unit: s.unit, delegationRef: s.delegationRef, ...o };
}
export const P = {
  letterhead: (variant: "letter" | "supplier" = "letter"): Part => ({ id: "letterhead", kind: "letterhead", variant }),
  para: (text: string, extra: Partial<Extract<Part, { kind: "paragraph" }>> = {}): Part => ({ id: "body", kind: "paragraph", text, ...extra }),
  heading: (text: string, level: 1 | 2 | 3 = 1, num?: string, id = "heading"): Part => ({ id, kind: "heading", level, text, num }),
  kv: (id: string, rows: [string, string][], extra: Partial<Extract<Part, { kind: "kv" }>> = {}): Part => ({ id, kind: "kv", rows, ...extra }),
  table: (id: string, t: Omit<Extract<Part, { kind: "table" }>, "id" | "kind">): Part => ({ id, kind: "table", ...t }),
};
/** Reference block rows in the order of STANDARD 5.1: Our ref, Your ref, Enquiries, Tel, Email, Date. */
export function refRows(meta: DocMeta, enq?: Enquiries): [string, string][] {
  const e = enq ?? meta.enquiries;
  const rows: [string, string][] = [["Our ref", meta.ourRef ?? meta.docNo]];
  if (meta.yourRef) rows.push(["Your ref", meta.yourRef]);
  if (e) rows.push(["Enquiries", e.name], ["Tel", formatPhone(e.tel)], ["Email", e.email]);
  rows.push(["Date", longDate(meta.date)]);
  if (meta.delivery) rows.push(["Delivery", meta.delivery]);
  return rows;
}
export function spec(type: string, org: Org, input: MetaInput, parts: Part[]): DocSpec {
  typeInfo(type);
  return { meta: makeMeta(type, org, input), parts };
}
/** Money in whole cents so totals reconcile to the cent. */
export const C = { cents, rand, money: (c: number, org: Org) => formatMoney(rand(c), org.locale) };
export const addrLines = (a: Addressee) => [a.name, ...(a.designation ? [a.designation] : []), ...(a.organisation ? [a.organisation] : []), ...a.lines];
export const orgLines = (org: Org) => [...org.address.street, `Tel ${formatPhone(org.contacts.tel)}`, org.contacts.email];

export interface LineItem {
  description: string; qty: number; unit?: string; unitPrice: number; vatRate?: number /* fraction, default org.vatRate; 0 = zero-rated */; exempt?: boolean;
  /** 1.1.0: amounts already frozen in the project's database (issued invoices and accepted quotes never change). Used as they are, in whole cents; `vatRate` is then only shown. Leave unset to have the kit work them out. */
  frozen?: { netCents: number; vatCents: number };
}
/** 1.1.0: totals that are frozen in the project's database. `netCents` is after the discount; the lines must add up to `netCents + discountCents` (checked, TOT-01). */
export interface FrozenTotals { netCents: number; vatCents: number; discountCents?: number }
/** Line and total maths in cents: VAT per line, rounded half away from zero; totals are the sum of the lines (invoice VAT = sum of line VAT). */
export function priceLines<T extends LineItem>(items: T[], org: Org, pricesIncludeVat = false) {
  const def = org.vatRate ?? 0.15; let net = 0, vat = 0;
  const lines = items.map((l) => {
    const rate = l.exempt ? 0 : (l.vatRate ?? def);
    const gross = Math.round(l.qty * cents(l.unitPrice));
    let n = gross, v = 0;
    if (l.frozen) { n = l.frozen.netCents; v = l.frozen.vatCents; }
    else if (pricesIncludeVat && rate) { n = Math.round(gross / (1 + rate)); v = gross - n; } else { v = Math.sign(n) * Math.round(Math.abs(n) * rate); }
    net += n; vat += v; return { ...l, rate, netC: n, vatC: v };
  });
  return { lines, netC: net, vatC: vat, totalC: net + vat };
}

/** 1.1.0: the totals block. With `frozen` the stored totals are printed (and the lines are checked against them); without it the sums of the lines are printed, as before. A discount adds a Discount row. */
export function totalsPart(t: ReturnType<typeof priceLines>, frozen: FrozenTotals | undefined, vatReg: boolean, org: Org, labels: { subtotal: string; vat: string; total: string }): Part {
  const disc = frozen?.discountCents ?? 0;
  if (frozen && t.netC !== frozen.netCents + disc) throw new Error(`TOT-01 the lines add up to ${t.netC} cents but the frozen totals say ${frozen.netCents + disc} (net ${frozen.netCents} + discount ${disc})`);
  const net = frozen ? frozen.netCents : t.netC; const vat = frozen ? frozen.vatCents : t.vatC;
  const rows: [string, number][] = [];
  if (vatReg || disc > 0) rows.push([labels.subtotal, rand(net + disc)]);
  if (disc > 0) rows.push(["Discount", -rand(disc)]);
  if (vatReg) rows.push([`${labels.vat} ${Math.round((org.vatRate ?? 0.15) * 100)}%`, rand(vat)]);
  return { id: "totals", kind: "totals", rows, total: [labels.total, rand(net + vat)] };
}
