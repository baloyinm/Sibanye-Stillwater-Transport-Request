import { legalLines } from "./email.js";
import { esc, longDate, orgName, orgShort, smsLength, stripTags, truncate } from "./util.js";
const firstName = (m) => (m.recipient.name ?? "there").split(/\s+/)[0];
// ---------------- SMS ----------------
export function renderSms(org, m) {
    const id = org.messaging?.sms?.senderId ?? "";
    const optOut = org.messaging?.sms?.optOutText ?? "Reply STOP to opt out";
    let text;
    if (m.purpose === "security" && m.code)
        text = `${orgShort(org)}: Your code is ${m.code.value}. It expires in ${m.code.expiresMinutes} minutes. Do not share it with anyone.`;
    else
        text = `${orgShort(org)}: ${m.short}${m.action ? " " + m.action.url : ""}${m.purpose === "marketing" ? ". " + optOut : ""}`;
    const { segments, unicode } = smsLength(text);
    return { senderId: id, text, segments, unicode };
}
// ---------------- WhatsApp (template message; the template must be approved by Meta before use) ----------------
const WA = {
    notification: { fixed: "Hello {{1}}, you have a new update from {ORG}: {{2}}. Open it with the button below.", params: (m) => [firstName(m), m.short] },
    task_assigned: { fixed: "Hello {{1}}, a task has been assigned to you at {ORG}: {{2}}. It is due on {{3}}. Open it with the button below.", params: (m) => [firstName(m), m.title, m.due ? longDate(m.due) : "the date shown in the task"] },
    reminder: { fixed: "Hello {{1}}, this is a reminder from {ORG}: {{2}}. The due date is {{3}}. Open it with the button below.", params: (m) => [firstName(m), m.title, m.due ? longDate(m.due) : "shown in the link"] },
    approval_request: { fixed: "Hello {{1}}, your approval is needed at {ORG} for {{2}}. Please review it with the button below.", params: (m) => [firstName(m), m.title] },
    document_attached: { fixed: "Hello {{1}}, your {{2}} from {ORG} is ready. View it with the button below.", params: (m) => [firstName(m), m.title] },
    receipt: { fixed: "Hello {{1}}, {ORG} has received your payment for {{2}}. Thank you.", params: (m) => [firstName(m), m.reference ?? m.title] },
    security_code: { fixed: "{{1}} is your verification code. For your security, do not share this code.", params: (m) => [m.code?.value ?? ""] },
    welcome: { fixed: "Hello {{1}}, welcome to {ORG}. Your account is ready. Open it with the button below.", params: (m) => [firstName(m)] },
    appointment: { fixed: "Hello {{1}}, your appointment {{2}} with {ORG} is on {{3}}. To change it, call us on {TEL}.", params: (m) => [firstName(m), m.title, m.event ? longDate(m.event.start) + " at " + m.event.start.slice(11, 16) : ""] },
    status_update: { fixed: "Hello {{1}}, there is an update from {ORG} on {{2}}: {{3}}. Open it with the button below.", params: (m) => [firstName(m), m.reference ?? m.title, m.short] },
    newsletter: { fixed: "Hello {{1}}, here is the latest news from {ORG}: {{2}}. Tap below to read more.", params: (m) => [firstName(m), m.title] },
};
export function renderWhatsApp(org, m) {
    const spec = WA[m.type];
    const params = spec.params(m, org).map((p) => p.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, " ").trim());
    const body = spec.fixed.replace("{ORG}", orgShort(org)).replace("{TEL}", org.contacts.tel);
    const category = m.purpose === "security" ? "AUTHENTICATION" : m.purpose === "marketing" ? "MARKETING" : "UTILITY";
    const buttons = [];
    if (m.purpose === "security")
        buttons.push({ type: "COPY_CODE", text: "Copy code" });
    else if (m.action)
        buttons.push({ type: "URL", text: truncate(m.action.label, 25), url: m.action.url });
    if (m.purpose === "marketing")
        buttons.push({ type: "QUICK_REPLY", text: "Stop promotions" });
    return {
        name: `${m.type}_v1`, category, language: org.messaging?.whatsapp?.language ?? "en", body, params,
        examples: params, header: undefined, footer: m.purpose === "security" && m.code ? `This code expires in ${m.code.expiresMinutes} minutes.` : orgName(org), buttons,
    };
}
// ---------------- push ----------------
export function renderPush(org, m) {
    return { title: truncate(m.title, 40), body: truncate(m.short, 120), url: m.action?.url ?? "", tag: m.reference ?? m.type, data: { type: m.type, ref: m.reference ?? "", app: org.messaging?.push?.appName ?? orgShort(org) } };
}
// ---------------- in-app and portal ----------------
export function renderInApp(org, m, id, createdAt) {
    const urgent = m.type === "reminder" && /overdue/i.test(m.title);
    const severity = urgent ? "urgent" : m.type === "receipt" || m.type === "welcome" ? "success" : m.type === "approval_request" || m.type === "task_assigned" ? "warn" : "info";
    return { id, title: truncate(m.title, 80), body: truncate(m.short, 280), severity, action: m.action, createdAt };
}
export function renderPortal(org, m) {
    const bl = (b) => {
        switch (b.kind) {
            case "paragraph": return `<p>${esc(b.text)}</p>`;
            case "heading": return `<h3>${esc(b.text)}</h3>`;
            case "list": return `<${b.ordered ? "ol" : "ul"}>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</${b.ordered ? "ol" : "ul"}>`;
            case "kv": return `<table><tbody>${b.rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>`;
            case "table": return `<table><thead><tr>${b.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
            case "callout": return `<p><strong>${esc(b.title ?? "Note")}.</strong> ${esc(b.text)}</p>`;
            case "button": return `<p><a href="${esc(b.url)}">${esc(b.label)}</a></p>`;
            case "attachments": return `<ul>${b.items.map((i) => `<li>${esc(i.name)}: ${esc(i.description)}</li>`).join("")}</ul>`;
            case "code": return "";
        }
    };
    const bodyHtml = [m.greeting && `<p>${esc(m.greeting)}</p>`, ...m.blocks.map(bl), `<p>${esc(m.sender.name)}${m.sender.designation ? `, ${esc(m.sender.designation)}` : ""}</p>`].filter(Boolean).join("\n");
    const att = m.blocks.flatMap((b) => (b.kind === "attachments" ? b.items.map((i) => i.name) : []));
    return { subject: m.subject, bodyHtml, bodyText: stripTags(bodyHtml), thread: m.reference ?? m.type, attachments: att };
}
// ---------------- printed / posted letter (A4, black and white safe; follows the document standard letter layout) ----------------
export function renderLetter(org, m) {
    const lg = legalLines(org);
    const addr = m.recipient.address ?? [];
    const sirMadam = !m.recipient.name;
    const salutation = sirMadam ? "Dear Sir or Madam" : `Dear ${m.recipient.name}`;
    const closing = sirMadam ? "Yours faithfully" : "Yours sincerely";
    const body = m.blocks.map((b) => {
        switch (b.kind) {
            case "paragraph": return `<p>${esc(b.text)}</p>`;
            case "heading": return `<h2>${esc(b.text)}</h2>`;
            case "list": return `<${b.ordered ? "ol" : "ul"}>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</${b.ordered ? "ol" : "ul"}>`;
            case "kv": return `<table class="kv">${b.rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
            case "table": return `<table class="grid"><thead><tr>${b.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
            case "callout": return `<p class="note"><strong>${esc(b.title ?? "Note")}.</strong> ${esc(b.text)}</p>`;
            case "button": return `<p>${esc(b.label)}: ${esc(b.url.replace(/^https:\/\//, ""))}</p>`;
            case "attachments": return `<p><strong>Enclosures: ${b.items.length}</strong></p><ol>${b.items.map((i) => `<li>${esc(i.name)}: ${esc(i.description)}</li>`).join("")}</ol>`;
            case "code": return "";
        }
    }).join("\n");
    const html = `<!doctype html>
<html lang="${esc(org.locale.language)}"><head><meta charset="utf-8"><title>${esc(m.subject)}</title>
<style>@page{size:A4;margin:20mm 20mm 22mm 25mm}
body{font:11pt/15pt Arial,Helvetica,sans-serif;color:#000;margin:0}
.head{display:flex;justify-content:space-between;border-bottom:0.5pt solid #000;padding-bottom:6pt;margin-bottom:12pt}.head img{height:16mm}
.org{font-size:8pt;text-align:right}.ref td{padding:0 12pt 0 0;font-size:10pt}.ref th{font-weight:700;text-align:left;padding:0 8pt 0 0;font-size:10pt}
h1{font-size:12pt;margin:12pt 0}h2{font-size:12pt;margin:10pt 0 4pt}table.grid{border-collapse:collapse;width:100%;font-size:10pt}table.grid th,table.grid td{border-bottom:0.5pt solid #000;padding:3pt;text-align:left}
table.kv th{text-align:left;padding-right:12pt;font-weight:400}table.kv td{font-weight:700}.note{border-left:2pt solid #000;padding-left:8pt}
.foot{margin-top:24pt;border-top:0.5pt solid #000;padding-top:6pt;font-size:8pt}</style></head><body>
<div class="head"><div>${org.messaging?.logoUrl || org.logo.primary.startsWith("https://") ? `<img src="${esc(org.messaging?.logoUrl ?? org.logo.primary)}" alt="${esc(org.logo.alt ?? orgName(org))}">` : `<strong>${esc(orgName(org))}</strong>`}</div>
<div class="org"><strong>${esc(org.legalName)}</strong><br>${org.address.street.map(esc).join("<br>")}<br>Tel ${esc(org.contacts.tel)}<br>${esc(org.contacts.email)}${org.contacts.web ? `<br>${esc(org.contacts.web)}` : ""}</div></div>
<table class="ref"><tr><th>Our ref</th><td>${esc(m.reference ?? "n/a")}</td></tr><tr><th>Date</th><td>${esc(longDate(m.date))}</td></tr><tr><th>Enquiries</th><td>${esc(m.sender.name)}</td></tr><tr><th>Tel</th><td>${esc(m.sender.tel ?? org.contacts.tel)}</td></tr><tr><th>Email</th><td>${esc(m.sender.email ?? org.contacts.email)}</td></tr></table>
<p><strong>By post</strong></p>
<p>${(addr[0] && m.recipient.name && addr[0].includes(m.recipient.name) ? addr : [m.recipient.name, ...addr]).filter(Boolean).map((l) => esc(l)).join("<br>")}</p>
<p>${esc(salutation)}</p>
<h1>Re: ${esc(m.subject)}${m.reference && !m.subject.includes(m.reference) ? ` - ${esc(m.reference)}` : ""}</h1>
${body}
<p>${esc(closing)}</p><p><br><br>${esc(m.sender.name)}${m.sender.designation ? `<br>${esc(m.sender.designation)}` : ""}${m.sender.unit ? `<br>${esc(m.sender.unit)}` : ""}<br>${esc(orgName(org))}</p>
<div class="foot">${esc(lg.identity)}${lg.directors ? `<br>${esc(lg.directors)}` : ""}<br>${esc(org.confidentialityText ?? "This letter is confidential and meant only for the person it is addressed to. If you received it in error, please tell us and return or destroy it.")}${m.personalInfo ? `<br>${esc(org.personalInfoText ?? "This letter contains personal information protected by the Protection of Personal Information Act 4 of 2013.")}` : ""}</div>
</body></html>`;
    return { html, text: stripTags(html.replace(/<style[\s\S]*?<\/style>/, "")) };
}
// ---------------- calendar invite input (build the file with email/calendar-ics-builder: buildCalendar([input], { method })) ----------------
export function icsInput(org, m) {
    const e = m.event;
    if (!e)
        return undefined;
    return {
        method: e.status === "CANCELLED" ? "CANCEL" : "REQUEST",
        input: {
            title: e.title, start: e.start, end: e.end, location: e.location, url: e.url, uid: e.uid, status: e.status ?? "CONFIRMED", sequence: e.sequence ?? 0,
            description: e.description ?? `${m.short} Contact ${m.sender.name} on ${m.sender.tel ?? org.contacts.tel}.`,
            organizer: { email: m.sender.email ?? org.contacts.email, name: orgName(org) },
            attendees: m.recipient.email ? [{ email: m.recipient.email, name: m.recipient.name, rsvp: true }] : [],
            reminderMinutesBefore: [60],
        },
    };
}
