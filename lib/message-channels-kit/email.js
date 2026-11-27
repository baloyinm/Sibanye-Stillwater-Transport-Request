import { esc, orgName, palette, urlsIn } from "./util.js";
/** A contact that is empty or the "not yet set" placeholder is left out of the signature (1.1.0). */
export const isSet = (v) => !!v && !/not yet set|to fill/i.test(v);
const DEFAULT_CONF = "This message and any attachments are confidential and meant only for the person it is addressed to. If you received it in error, please tell the sender and delete it.";
const DEFAULT_PERSONAL = "This message may contain personal information protected by the Protection of Personal Information Act 4 of 2013. Use it only for the purpose it was sent for.";
const FONT = (o) => [o.typography?.family, ...(o.typography?.fallback ?? []), "Arial", "Helvetica", "sans-serif"].filter(Boolean).map((f) => (/\s/.test(f) ? `'${f}'` : f)).join(",");
export const logoUrl = (o) => o.messaging?.logoUrl ?? (o.logo.primary.startsWith("https://") ? o.logo.primary : undefined);
/** The footer lines every external message carries (Companies Act s32 particulars, address, contacts). Shared by HTML, text, letter. */
export function legalLines(o) {
    const bits = [o.legalName + (o.tradingName && o.tradingName !== o.legalName ? ` (trading as ${o.tradingName})` : "")];
    if (isSet(o.registrationNo))
        bits.push(`Registration No. ${o.registrationNo}`);
    if (isSet(o.vatNo))
        bits.push(`VAT No. ${o.vatNo}`);
    // 1.2.0: a particular that is empty or the "not yet set" / "to fill" placeholder is left out, never printed.
    const street = (o.address.street ?? []).filter(isSet).join(", ");
    const contact = [street, isSet(o.contacts.tel) ? `Tel ${o.contacts.tel}` : "", isSet(o.contacts.email) ? o.contacts.email : "", isSet(o.contacts.web) ? o.contacts.web : ""].filter(Boolean).join(" | ");
    return { identity: bits.join(" | "), directors: o.directorsLine, contact };
}
function blockHtml(b, o, P) {
    const f = FONT(o);
    switch (b.kind) {
        case "paragraph": return `<p class="ink" style="margin:0 0 16px;font:16px/1.5 ${f};color:${P.light.ink}">${esc(b.text)}</p>`;
        case "heading": return `<h2 class="ink" style="margin:20px 0 8px;font:700 18px/1.3 ${f};color:${P.light.ink}">${esc(b.text)}</h2>`;
        case "list": {
            const t = b.ordered ? "ol" : "ul";
            return `<${t} class="ink" style="margin:0 0 16px;padding-left:22px;font:16px/1.5 ${f};color:${P.light.ink}">${b.items.map((i) => `<li style="margin:0 0 4px">${esc(i)}</li>`).join("")}</${t}>`;
        }
        case "kv": return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="tint rule" style="margin:0 0 16px;background:${P.light.tint};border:1px solid ${P.light.rule};border-radius:6px">${b.rows.map(([k, v], i) => `<tr><td class="muted" valign="top" style="padding:${i === 0 ? 12 : 4}px 8px ${i === b.rows.length - 1 ? 12 : 4}px 14px;font:14px/1.4 ${f};color:${P.light.muted};width:38%">${esc(k)}</td><td class="ink" valign="top" style="padding:${i === 0 ? 12 : 4}px 14px ${i === b.rows.length - 1 ? 12 : 4}px 0;font:700 15px/1.4 ${f};color:${P.light.ink};word-break:break-word">${esc(v)}</td></tr>`).join("")}</table>`;
        case "table": return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse"><tr>${b.columns.map((c, i) => `<th class="rule ink" align="${b.align?.[i] ?? "left"}" style="padding:8px;border-bottom:2px solid ${P.light.rule};font:700 13px/1.3 ${f};color:${P.light.ink}">${esc(c)}</th>`).join("")}</tr>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td class="rule ink" align="${b.align?.[i] ?? "left"}" style="padding:8px;border-bottom:1px solid ${P.light.rule};font:14px/1.4 ${f};color:${P.light.ink};word-break:break-word">${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`;
        case "callout": {
            const col = { info: o.colours.primary, warn: "#b45309", danger: o.colours.danger, ok: o.colours.ok }[b.tone];
            return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td class="tint ink" style="padding:12px 14px;background:${P.light.tint};border-left:4px solid ${col};font:15px/1.5 ${f};color:${P.light.ink}">${b.title ? `<strong>${esc(b.title)}.</strong> ` : ""}${esc(b.text)}</td></tr></table>`;
        }
        case "button": {
            const sec = b.style === "secondary";
            const bg = sec ? P.light.card : P.light.button;
            const fg = sec ? P.light.link : P.light.buttonText;
            return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr><td class="${sec ? "btn2" : "btn"}" bgcolor="${bg}" style="background:${bg};border-radius:6px;border:2px solid ${sec ? P.light.link : P.light.button}"><a href="${esc(b.url)}" class="${sec ? "btn2a" : "btna"}" style="display:inline-block;padding:13px 24px;font:700 16px/1.2 ${f};color:${fg};text-decoration:none;mso-padding-alt:0">${esc(b.label)}</a></td></tr></table>` +
                `<p class="muted" style="margin:0 0 16px;font:13px/1.5 ${f};color:${P.light.muted}">${b.note ? esc(b.note) + " " : ""}If the button does not work, copy this link into your browser: <a href="${esc(b.url)}" class="lnk" style="color:${P.light.link};word-break:break-all">${esc(b.url)}</a></p>`;
        }
        case "attachments": return `<p class="ink" style="margin:0 0 6px;font:700 15px/1.4 ${f};color:${P.light.ink}">Attached to this email</p><ul class="ink" style="margin:0 0 16px;padding-left:22px;font:15px/1.5 ${f};color:${P.light.ink}">${b.items.map((i) => `<li style="margin:0 0 4px"><strong>${esc(i.name)}</strong>: ${esc(i.description)}${i.sizeKb ? ` (${i.sizeKb} KB)` : ""}</li>`).join("")}</ul>`;
        case "code": return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr><td class="tint rule" style="padding:14px 28px;background:${P.light.tint};border:1px solid ${P.light.rule};border-radius:6px;font:700 32px/1 'Courier New',monospace;letter-spacing:6px;color:${P.light.ink}" ><span class="ink">${esc(b.value)}</span></td></tr></table><p class="muted" style="margin:0 0 16px;font:14px/1.5 ${f};color:${P.light.muted}">This code expires in ${b.expiresMinutes} minutes. Do not share it with anyone. We will never ask you for it.</p>`;
    }
}
export function renderEmail(org, m) {
    const P = palette(org);
    const f = FONT(org);
    const L = P.light, D = P.dark;
    const external = m.external !== false;
    const lg = legalLines(org);
    const logo = logoUrl(org);
    const dk = org.messaging?.logoDarkUrl;
    const lw = org.messaging?.logoWidth ?? 140, lh = org.messaging?.logoHeight;
    const alt = org.logo.alt ?? orgName(org);
    const logoHtml = logo
        ? `<img src="${esc(logo)}" alt="${esc(alt)}" width="${lw}"${lh ? ` height="${lh}"` : ""} class="logo-l" style="display:block;border:0;height:auto;max-width:100%">` + (dk ? `<img src="${esc(dk)}" alt="${esc(alt)}" width="${lw}"${lh ? ` height="${lh}"` : ""} class="logo-d" style="display:none;border:0;height:auto;max-width:100%;max-height:0;overflow:hidden;mso-hide:all">` : "")
        : `<span class="ink" style="font:700 20px/1.2 ${f};color:${L.ink}">${esc(orgName(org))}</span>`;
    const body = m.blocks.map((b) => blockHtml(b, org, P)).join("\n");
    const fill = "&#847;&zwnj;&nbsp;".repeat(30);
    const sig = [`<strong class="ink" style="font:700 16px/1.4 ${f};color:${L.ink}">${esc(m.sender.name)}</strong>`, m.sender.designation && esc(m.sender.designation), m.sender.unit && esc(m.sender.unit), esc(orgName(org)),
        isSet(m.sender.tel ?? org.contacts.tel) && `Tel ${esc(m.sender.tel ?? org.contacts.tel)}`, isSet(m.sender.email ?? org.contacts.email) && `<a href="mailto:${esc(m.sender.email ?? org.contacts.email)}" class="lnk" style="color:${L.link}">${esc(m.sender.email ?? org.contacts.email)}</a>`, isSet(org.contacts.web) && esc(org.contacts.web.replace(/^https?:\/\//, ""))].filter(Boolean);
    const confidentiality = external ? esc(org.confidentialityText ?? DEFAULT_CONF) : "";
    const personal = m.personalInfo ? esc(org.personalInfoText ?? DEFAULT_PERSONAL) : "";
    const unsub = m.purpose === "marketing" && m.unsubscribe
        ? `<p class="muted" style="margin:10px 0 0;font:13px/1.5 ${f};color:${L.muted}"><a href="${esc(m.unsubscribe.url)}" class="lnk" style="color:${L.link}">Unsubscribe</a>${m.unsubscribe.preferencesUrl ?? org.messaging?.preferencesUrl ? ` | <a href="${esc(m.unsubscribe.preferencesUrl ?? org.messaging.preferencesUrl)}" class="lnk" style="color:${L.link}">Manage your preferences</a>` : ""}. You can opt out at any time and we will stop.</p>` : "";
    const social = (org.messaging?.social ?? []).length ? `<p class="muted" style="margin:10px 0 0;font:13px/1.5 ${f};color:${L.muted}">${org.messaging.social.map((s) => `<a href="${esc(s.url)}" class="lnk" style="color:${L.link}">${esc(s.label)}</a>`).join(" | ")}</p>` : "";
    const css = `
@media (prefers-color-scheme: dark){
 .page{background:${D.page} !important} .card{background:${D.card} !important} .ink{color:${D.ink} !important} .muted{color:${D.muted} !important}
 .lnk{color:${D.link} !important} .rule{border-color:${D.rule} !important} .tint{background:${D.tint} !important}
 .btn{background:${D.button} !important} .btna{color:${D.buttonText} !important} .btn2{background:${D.card} !important;border-color:${D.link} !important} .btn2a{color:${D.link} !important}
 .logo-l{display:none !important} .logo-d{display:block !important;max-height:none !important}
}
@media only screen and (max-width:620px){ .wrap{padding:0 !important} .pad{padding-left:16px !important;padding-right:16px !important} }`;
    const html = `<!doctype html>
<html lang="${esc(org.locale.language)}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><meta name="x-apple-disable-message-reformatting">
<title>${esc(m.subject)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>${css}</style></head>
<body class="page" style="margin:0;padding:0;background:${L.page};-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(m.preheader)}${fill}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="page" style="background:${L.page}"><tr><td align="center" class="wrap" style="padding:16px 8px">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:600px;width:100%;background:${L.card};border-radius:8px">
<tr><td class="pad" style="padding:24px 32px 16px">${logoHtml}</td></tr>
<tr><td style="height:4px;background:${L.accent};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td class="pad" style="padding:24px 32px 8px">
<h1 class="ink" style="margin:0 0 16px;font:700 24px/1.25 ${f};color:${L.ink}">${esc(m.title)}</h1>
${m.greeting ? `<p class="ink" style="margin:0 0 16px;font:16px/1.5 ${f};color:${L.ink}">${esc(m.greeting)}</p>` : ""}
${body}
</td></tr>
<tr><td class="pad" style="padding:8px 32px 24px"><p class="ink" style="margin:0 0 8px;font:16px/1.5 ${f};color:${L.ink}">${m.purpose === "security" ? "Regards," : "Kind regards,"}</p>
<p class="muted" style="margin:0;font:14px/1.5 ${f};color:${L.muted}">${sig.join("<br>")}</p></td></tr>
<tr><td class="pad rule" style="padding:16px 32px 24px;border-top:1px solid ${L.rule}">
<p class="muted" style="margin:0 0 8px;font:12px/1.5 ${f};color:${L.muted}">${esc(m.reason)}</p>
<p class="muted" style="margin:0 0 8px;font:12px/1.5 ${f};color:${L.muted}">${esc(lg.identity)}${lg.directors ? `<br>${esc(lg.directors)}` : ""}<br>${esc(lg.contact)}</p>
${confidentiality ? `<p class="muted" style="margin:0 0 8px;font:12px/1.5 ${f};color:${L.muted}">${confidentiality}</p>` : ""}
${personal ? `<p class="muted" style="margin:0 0 8px;font:12px/1.5 ${f};color:${L.muted}">${personal}</p>` : ""}
${unsub}${social}
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
    // ---- plain text from the same content ----
    const T = [m.title.toUpperCase() === m.title ? m.title : m.title, "=".repeat(Math.min(60, m.title.length)), ""];
    if (m.greeting)
        T.push(m.greeting, "");
    for (const b of m.blocks) {
        switch (b.kind) {
            case "paragraph":
                T.push(b.text, "");
                break;
            case "heading":
                T.push(b.text, "-".repeat(Math.min(40, b.text.length)));
                break;
            case "list":
                b.items.forEach((i, n) => T.push(`${b.ordered ? n + 1 + "." : "-"} ${i}`));
                T.push("");
                break;
            case "kv":
                b.rows.forEach(([k, v]) => T.push(`${k}: ${v}`));
                T.push("");
                break;
            case "table":
                T.push(b.columns.join(" | "));
                b.rows.forEach((r) => T.push(r.join(" | ")));
                T.push("");
                break;
            case "callout":
                T.push(`${b.title ? b.title + ". " : ""}${b.text}`, "");
                break;
            case "button":
                T.push(`${b.label}: ${b.url}`);
                if (b.note)
                    T.push(b.note);
                T.push("");
                break;
            case "attachments":
                T.push("Attached to this email:");
                b.items.forEach((i) => T.push(`- ${i.name}: ${i.description}${i.sizeKb ? ` (${i.sizeKb} KB)` : ""}`));
                T.push("");
                break;
            case "code":
                T.push(`Your code: ${b.value}`, `This code expires in ${b.expiresMinutes} minutes. Do not share it with anyone. We will never ask you for it.`, "");
                break;
        }
    }
    T.push(m.purpose === "security" ? "Regards," : "Kind regards,", m.sender.name, ...[m.sender.designation, m.sender.unit, orgName(org), isSet(m.sender.tel ?? org.contacts.tel) && `Tel ${m.sender.tel ?? org.contacts.tel}`, isSet(m.sender.email ?? org.contacts.email) && (m.sender.email ?? org.contacts.email), isSet(org.contacts.web) && org.contacts.web].filter(Boolean), "", "--", m.reason, lg.identity);
    if (lg.directors)
        T.push(lg.directors);
    T.push(lg.contact);
    if (external)
        T.push(org.confidentialityText ?? DEFAULT_CONF);
    if (m.personalInfo)
        T.push(org.personalInfoText ?? DEFAULT_PERSONAL);
    if (m.purpose === "marketing" && m.unsubscribe) {
        T.push(`Unsubscribe: ${m.unsubscribe.url}`);
        const pu = m.unsubscribe.preferencesUrl ?? org.messaging?.preferencesUrl;
        if (pu)
            T.push(`Manage your preferences: ${pu}`);
    }
    const headers = {};
    if (m.purpose === "marketing" && m.unsubscribe) {
        headers["List-Unsubscribe"] = [m.unsubscribe.mailto && `<mailto:${m.unsubscribe.mailto}?subject=unsubscribe>`, `<${m.unsubscribe.url}>`].filter(Boolean).join(", ");
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
        headers["Precedence"] = "bulk";
    }
    else
        headers["Auto-Submitted"] = "auto-generated";
    return { subject: m.subject, html, text: T.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n", headers, replyTo: org.messaging?.replyTo ?? org.contacts.enquiriesEmail ?? org.contacts.email, fromName: org.messaging?.fromName ?? orgName(org) };
}
export { urlsIn };
