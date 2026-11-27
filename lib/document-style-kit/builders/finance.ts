// Finance family (STANDARD 6). Layout lifted from the three best invoice templates in the portfolio:
//   dnr-assist finance/pdf.py        : ten fixed blocks - header band, tinted reference box, From and Bill-to cards, "about this job" grid, lines table, totals box with a filled total row, how-to-pay and attached cards
//   plumbing-system pdf/documents.ts : logo and supplier lines left, title and number block right; "Tax Invoice" / "Invoice" + not registered for VAT; per-line VAT that sums to the invoice VAT; statement ageing
//   engineering-work-manager pdf-docs: the same engine, purchase order and delivery note inputs
// Gaps fixed against the standard: supplier VAT and registration numbers, recipient VAT number, gap-free serial, left-aligned text (no justification),
// "Page x of y", classification, document control stamp, verification code and QR, Source Sans 3 embedded, amounts in the one house style.
import { longDate, moneyWords } from "../format.ts";
import { C, P, priceLines, signBlock, spec, totalsPart, type Addressee, type FrozenTotals, type LineItem, type MetaInput } from "./common.ts";
import type { DocSpec, Org, Part } from "../types.ts";

const pay = (org: Org, ref: string, terms?: string) => ({ label: "How to pay", lines: org.bank ? [`Bank: ${org.bank.name}`, ...(org.bank.accountHolder ? [`Account holder: ${org.bank.accountHolder}`] : []), `Account number: ${org.bank.accountNo}`, `Branch code: ${org.bank.branchCode}${org.bank.accountType ? `   ${org.bank.accountType}` : ""}`, `Use **${ref}** as your payment reference.`, ...(terms ? [`Payment terms: ${terms}`] : [])] : ["Bank details on request."] });
const party = (label: string, a: Addressee & { vatNo?: string; regNo?: string }) => ({ label, name: a.name, lines: [...(a.designation ? [a.designation] : []), ...(a.organisation ? [a.organisation] : []), ...a.lines, ...(a.vatNo ? [`VAT number ${a.vatNo}`] : []), ...(a.regNo ? [`Registration number ${a.regNo}`] : [])] });
const lineCols = (vat: boolean) => [{ header: "Description", weight: 3 }, { header: "Qty", type: "num" as const }, { header: "Unit price", type: "money" as const }, ...(vat ? [{ header: "VAT %", type: "pct" as const }] : []), { header: vat ? "Amount excl VAT" : "Amount", type: "money" as const }];
const lineRows = (items: ReturnType<typeof priceLines>["lines"], vat: boolean) => items.map((l) => [l.description + (l.exempt ? " (exempt)" : l.rate === 0 && vat ? " (zero-rated)" : ""), l.qty, l.unitPrice, ...(vat ? [l.rate * 100] : []), C.rand(l.netC)]);
const headerParts = (title: string, meta: [string, string][], tag?: string): Part[] => [P.letterhead("supplier"), { id: "docheader", kind: "docheader", title, meta, tag }];

export interface InvoiceData { meta: MetaInput; recipient: Addressee & { vatNo?: string; regNo?: string; isVendor?: boolean }; items: LineItem[]; dueDate: string; reference?: string; referenceLabel?: string; terms?: string; notes?: string[]; abridged?: boolean; pricesIncludeVat?: boolean; about?: [string, string][]; attachments?: string[]; /** 1.1.0: stored totals, printed as they are (see FrozenTotals). */ frozenTotals?: FrozenTotals; /** 1.1.0: the payment reference to print when it is not the document number (for example one with a check digit). */ paymentReference?: string }
/** INV: Tax Invoice for a VAT vendor, Invoice with "Not registered for VAT" otherwise. */
export function buildTaxInvoice(d: InvoiceData, org: Org): DocSpec {
  const vatReg = !!org.vatNo; const t = priceLines(d.items, org, d.pricesIncludeVat);
  const title = vatReg ? "Tax Invoice" : "Invoice";
  const parts: Part[] = [...headerParts(title, [["Invoice no.", d.meta.docNo], ["Date", longDate(d.meta.date)], ["Due", longDate(d.dueDate)]], vatReg ? undefined : "Not registered for VAT"),
    ...(d.reference ? [{ id: "refbox", kind: "refbox", label: d.referenceLabel ?? "Your reference", value: d.reference } as Part] : []),
    { id: "parties", kind: "cards", cards: [party("From", { name: org.legalName, lines: [org.address.street.join(", "), ...(org.registrationNo ? [`Registration number ${org.registrationNo}`] : []), ...(org.vatNo ? [`VAT number ${org.vatNo}`] : [])] }), party("Bill to", d.recipient)] }];
  if (d.about?.length) parts.push({ id: "about", kind: "kv", rows: d.about, cols: 3, title: "About this job" });
  parts.push(P.heading("What is charged", 3, undefined, "lines-heading"), P.table("lines", { columns: lineCols(vatReg), rows: lineRows(t.lines, vatReg), caption: undefined }),
    totalsPart(t, d.frozenTotals, vatReg, org, { subtotal: "Subtotal (excl VAT)", vat: "VAT at", total: "Total due" }),
    { id: "payment", kind: "cards", cards: [pay(org, d.paymentReference ?? d.meta.docNo, d.terms), { label: "Attached", lines: d.attachments?.length ? d.attachments : ["Nothing else"] }] });
  if (d.notes?.length) d.notes.forEach((n) => parts.push(P.para(n, { size: 9.5 })));
  return spec("INV", org, d.meta, parts);
}

export interface CreditNoteData { meta: MetaInput; recipient: InvoiceData["recipient"]; originalNo: string; /** optional since 1.1.0 */ originalDate?: string; reason: string; items: LineItem[]; notes?: string[]; /** 1.1.0 */ frozenTotals?: FrozenTotals }
export function buildCreditNote(d: CreditNoteData, org: Org): DocSpec {
  const vatReg = !!org.vatNo; const t = priceLines(d.items, org);
  const parts: Part[] = [...headerParts("Credit Note", [["Credit note no.", d.meta.docNo], ["Date", longDate(d.meta.date)]], vatReg ? undefined : "Not registered for VAT"),
    { id: "refbox", kind: "refbox", label: "Original tax invoice", value: d.originalDate ? `${d.originalNo}  (${longDate(d.originalDate)})` : d.originalNo },
    { id: "parties", kind: "cards", cards: [party("From", { name: org.legalName, lines: [org.address.street.join(", "), ...(org.registrationNo ? [`Registration number ${org.registrationNo}`] : []), ...(org.vatNo ? [`VAT number ${org.vatNo}`] : [])] }), party("Credited to", d.recipient)] },
    { id: "reason", kind: "notice", title: "Reason for this credit", text: d.reason },
    P.table("lines", { columns: lineCols(vatReg), rows: lineRows(t.lines, vatReg) }),
    totalsPart(t, d.frozenTotals, vatReg, org, { subtotal: "Subtotal credited (excl VAT)", vat: "VAT adjusted at", total: "Total credited" }),
    P.para(`This credit note reduces invoice **${d.originalNo}** by **${C.money(t.netC + t.vatC, org)}**. The net effect on your account is a credit of that amount.`)];
  (d.notes ?? []).forEach((n) => parts.push(P.para(n, { size: 9.5 })));
  return spec("CRN", org, d.meta, parts);
}

export interface QuoteData { meta: MetaInput; customer: InvoiceData["recipient"]; /** optional since 1.1.0: without it the quote says "Until withdrawn" */ validUntil?: string; /** optional since 1.1.0 (heading left out when empty) */ scope?: string[]; exclusions: string[]; items: LineItem[]; deposit?: string; /** optional since 1.1.0 */ leadTime?: string; /** optional since 1.1.0 */ terms?: string[]; /** 1.1.0: stored totals including a discount (see FrozenTotals). */ frozenTotals?: FrozenTotals }
export function buildQuote(d: QuoteData, org: Org): DocSpec {
  const vatReg = !!org.vatNo; const t = priceLines(d.items, org); const valid = d.validUntil ? longDate(d.validUntil) : "Until withdrawn";
  const parts: Part[] = [...headerParts("Quotation", [["Quote no.", d.meta.docNo], ["Date", longDate(d.meta.date)], ["Valid until", valid]]),
    { id: "parties", kind: "cards", cards: [party("From", { name: org.legalName, lines: [org.address.street.join(", "), ...(org.registrationNo ? [`Registration number ${org.registrationNo}`] : []), ...(org.vatNo ? [`VAT number ${org.vatNo}`] : [])] }), party("Prepared for", d.customer)] },
    ...(d.scope?.length ? [P.heading("Scope", 3, undefined, "scope"), { id: "scope-list", kind: "list", items: d.scope } as Part] : []), P.heading("Exclusions", 3, undefined, "exclusions"), { id: "exclusions-list", kind: "list", items: d.exclusions },
    P.table("lines", { columns: lineCols(vatReg), rows: lineRows(t.lines, vatReg) }),
    totalsPart(t, d.frozenTotals, vatReg, org, { subtotal: "Subtotal (excl VAT)", vat: "VAT at", total: "Total (incl VAT)" }),
    P.kv("terms", [["VAT treatment", vatReg ? "Prices are shown excluding VAT; VAT is added in the totals." : "Not registered for VAT; no VAT is charged."], ...(d.leadTime ? [["Delivery or lead time", d.leadTime] as [string, string]] : []), ["Valid until", valid], ...(d.deposit ? [["Deposit and payment", d.deposit] as [string, string]] : [])], { boxed: true, labelMm: 40 }),
    ...(d.terms?.length ? [P.heading("Terms", 3, undefined, "terms-heading"), { id: "terms-list", kind: "list", items: d.terms } as Part] : []),
    P.heading("Acceptance", 2, undefined, "acceptance"), P.kv("acceptance", [["Accepted by", ""], ["Name", ""], ["Date", ""], ["Purchase order no.", ""]], { boxed: true, labelMm: 40 }),
    { id: "acceptance-signature", kind: "signature", blocks: [{ name: "", capacity: "Customer signature" }] }];
  return spec("QTE", org, d.meta, parts);
}

export interface StatementData { meta: MetaInput; customer: InvoiceData["recipient"]; accountNo: string; periodFrom: string; opening: number; transactions: { date: string; ref: string; description: string; debit?: number; credit?: number }[]; open: { ref: string; date: string; amount: number }[]; bands?: { label: string; fromDays: number }[] }
/** STM: transactions with running balance and ageing by invoice date (current, 30, 60, 90, 120+); closing balance equals the ageing total. */
export function buildStatement(d: StatementData, org: Org): DocSpec {
  let bal = C.cents(d.opening); const rows = d.transactions.map((x) => { bal += C.cents(x.debit ?? 0) - C.cents(x.credit ?? 0); return [x.date, x.ref, x.description, x.debit ?? null, x.credit ?? null, C.rand(bal)]; });
  const bands = d.bands ?? [{ label: "Current", fromDays: 0 }, { label: "30 days", fromDays: 30 }, { label: "60 days", fromDays: 60 }, { label: "90 days", fromDays: 90 }, { label: "120+ days", fromDays: 120 }];
  const stmtDay = Date.parse(d.meta.date.slice(0, 10)); const sums = bands.map(() => 0);
  d.open.forEach((o) => { const age = Math.floor((stmtDay - Date.parse(o.date)) / 86400000); let k = 0; bands.forEach((b, i) => { if (age >= b.fromDays) k = i; }); sums[k] += C.cents(o.amount); });
  const ageTotal = sums.reduce((a, b) => a + b, 0);
  if (ageTotal !== bal) throw new Error(`STM closing balance ${bal} does not equal the ageing total ${ageTotal}: pass the open items that make up the balance`);
  const parts: Part[] = [...headerParts("Statement", [["Statement date", longDate(d.meta.date)], ["Period from", longDate(d.periodFrom)], ["Account no.", d.accountNo]]),
    { id: "parties", kind: "cards", cards: [party("From", { name: org.legalName, lines: [org.address.street.join(", "), ...(org.vatNo ? [`VAT number ${org.vatNo}`] : [])] }), party("Customer", d.customer)] },
    P.kv("account", [["Account number", d.accountNo], ["Opening balance", C.money(C.cents(d.opening), org)]], { labelMm: 40 }),
    P.table("transactions", { columns: [{ header: "Date", type: "date" }, { header: "Reference" }, { header: "Description", weight: 3 }, { header: "Debit", type: "money" }, { header: "Credit", type: "money" }, { header: "Balance", type: "money" }], rows, totals: [["", "", "Closing balance", null, null, C.rand(bal)]], caption: "Transactions" }),
    P.table("ageing", { columns: bands.map((b) => ({ header: b.label, type: "money" as const })).concat([{ header: "Total due", type: "money" as const }]), rows: [[...sums.map(C.rand), C.rand(ageTotal)]], caption: "Ageing by invoice date" }),
    { id: "totals", kind: "totals", rows: [], total: ["Amount due", C.rand(bal)] },
    { id: "remittance", kind: "cards", cards: [{ label: "Remittance advice", lines: [`Account no. ${d.accountNo}`, `Amount due ${C.money(bal, org)}`, `Reference ${d.accountNo}`] }, pay(org, d.accountNo)] },
    P.para(`Queries: ${org.contacts.email}, tel ${org.contacts.tel}`, { size: 9.5 })];
  return spec("STM", org, d.meta, parts);
}

export interface ReceiptData { meta: MetaInput; payer: Addressee; amount: number; method: string; reference: string; settles: { invoice: string; amount: number }[]; balance: number; receivedBy: string; /** "received" (default): money paid to us. "paid": money we paid out (a settlement), so the labels read "Paid to" and "Amount paid". */ direction?: "received" | "paid" }
export function buildReceipt(d: ReceiptData, org: Org): DocSpec {
  const paid = d.direction === "paid";
  const us = { name: org.legalName, lines: [d.receivedBy, ...(org.vatNo ? [`VAT number ${org.vatNo}`] : [])] };
  return spec("RCP", org, d.meta, [...headerParts("Receipt", [["Receipt no.", d.meta.docNo], ["Date", longDate(d.meta.date)]]),
    { id: "parties", kind: "cards", cards: paid ? [party("Paid by", us), party("Paid to", d.payer)] : [party("Received from", d.payer), party("Received by", us)] },
    P.kv("amount", [[paid ? "Amount paid" : "Amount received", C.money(C.cents(d.amount), org)], ["Amount in words", moneyWords(d.amount)], ["Payment method", d.method], ["Payment reference", d.reference]], { boxed: true, labelMm: 40 }),
    P.table("settles", { columns: [{ header: "Invoice settled", weight: 2 }, { header: "Amount applied", type: "money" }], rows: d.settles.map((s) => [s.invoice, s.amount]), totals: [["Total applied", d.settles.reduce((a, s) => a + s.amount, 0)]], caption: "What this receipt settles" }),
    { id: "totals", kind: "totals", rows: [], total: ["Balance outstanding", d.balance] }]);
}

export interface PoData { meta: MetaInput; supplier: InvoiceData["recipient"]; deliveryAddress: string; deliveryDate: string; items: (LineItem & { code?: string })[]; terms: string; authoriserId: string }
export function buildPurchaseOrder(d: PoData, org: Org): DocSpec {
  const t = priceLines(d.items, org); const vatReg = !!org.vatNo;
  return spec("PO", org, d.meta, [...headerParts("Purchase Order", [["PO no.", d.meta.docNo], ["Date", longDate(d.meta.date)], ["Delivery date", longDate(d.deliveryDate)]]),
    { id: "parties", kind: "cards", cards: [party("Buyer", { name: org.legalName, lines: [org.address.street.join(", "), ...(org.registrationNo ? [`Registration number ${org.registrationNo}`] : []), ...(org.vatNo ? [`VAT number ${org.vatNo}`] : [])] }), party("Supplier", d.supplier)] },
    P.kv("delivery", [["Deliver to", d.deliveryAddress], ["Delivery date", longDate(d.deliveryDate)]], { boxed: true, labelMm: 34 }),
    P.table("lines", { columns: [{ header: "Item" }, { header: "Description", weight: 3 }, { header: "Qty", type: "num" }, { header: "Unit" }, { header: "Price", type: "money" }, { header: "Total excl VAT", type: "money" }], rows: t.lines.map((l, i) => [l.code ?? String(i + 1), l.description, l.qty, l.unit ?? "each", l.unitPrice, C.rand(l.netC)]) }),
    { id: "totals", kind: "totals", rows: vatReg ? [["Subtotal (excl VAT)", C.rand(t.netC)], [`VAT at ${Math.round((org.vatRate ?? 0.15) * 100)}%`, C.rand(t.vatC)]] : [], total: ["Order total", C.rand(t.totalC)] },
    P.para(`**Payment terms:** ${d.terms}`), { id: "instruction", kind: "notice", title: "Please note", text: `Quote **${d.meta.docNo}** on your invoice and delivery note.` },
    { id: "authorisation", kind: "signature", blocks: [signBlock(org, d.authoriserId, "PO", { closing: "Authorised by", date: d.meta.date })] }]);
}

export interface DeliveryNoteData { meta: MetaInput; to: InvoiceData["recipient"]; orderRef: string; items: { description: string; qty: number; unit?: string; condition?: string }[]; receiver?: { name?: string; date?: string; time?: string } }
export function buildDeliveryNote(d: DeliveryNoteData, org: Org): DocSpec {
  return spec("DNT", org, d.meta, [...headerParts("Delivery Note", [["Delivery note no.", d.meta.docNo], ["Date", longDate(d.meta.date)], ["Order / PO", d.orderRef]]),
    { id: "parties", kind: "cards", cards: [party("From", { name: org.legalName, lines: [org.address.street.join(", ")] }), party("Deliver to", d.to)] },
    P.table("lines", { columns: [{ header: "Description", weight: 3 }, { header: "Qty", type: "num" }, { header: "Unit" }, { header: "Condition" }], rows: d.items.map((i) => [i.description, i.qty, i.unit ?? "each", i.condition ?? "Good"]) }),
    P.para("Received in good order unless a note is made above.", { bold: true }),
    { id: "signature", kind: "signature", blocks: [{ name: d.receiver?.name ?? "Name: ______________________", capacity: "Received by", date: d.receiver?.date, place: d.receiver?.time ? `Time ${d.receiver.time}` : "Time: ________" }] }]);
}
