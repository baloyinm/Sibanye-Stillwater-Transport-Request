// Checkers: one per channel, same output as ui/ux-audit-script: `PROBLEM <code> <channel> <where> <why>` (fails) and `WARN ...` (advice).
// They look at the rendered output only, so they also audit emails an app builds by hand. Pass the Message for the meaning (purpose, type).
import { isSet, legalLines } from "./email.js";
import { contrast, findSensitive, hostOf, linkProblems, palette, smsLength, stripTags, urlsIn } from "./util.js";
const mk = (list, channel) => (severity, code, where, why) => { list.push({ severity, code, channel, where, why }); };
const PLACEHOLDER = /\{\{|\}\}|\bundefined\b|\bnull\b|\[object |NaN|%s\b|\$\{/;
const EXEC = /\.(exe|bat|cmd|scr|js|jar|vbs|msi|com|zip|html?|svg)$/i;
function sensitive(add, code, where, text, allowCode = false) {
    for (const f of findSensitive(text))
        add("PROBLEM", code, where, `contains ${f.what}; move it into the secure portal or a protected PDF`);
    void allowCode;
}
export function checkEmail(org, m, r, replyOrFrom) {
    const out = [];
    const add = mk(out, "email");
    const html = r.html, text = r.text;
    const external = m.external !== false;
    const lg = legalLines(org);
    // EML-01 subject
    if (!r.subject.trim())
        add("PROBLEM", "EML-01", "subject", "subject is empty");
    else {
        if (PLACEHOLDER.test(r.subject))
            add("PROBLEM", "EML-01", "subject", "subject has an unfilled placeholder");
        if (r.subject.length > 78)
            add("PROBLEM", "EML-01", "subject", `subject is ${r.subject.length} characters; mail apps cut it at about 60 to 78`);
        else if (r.subject.length > 60)
            add("WARN", "EML-01", "subject", `subject is ${r.subject.length} characters; aim for 60 or fewer`);
        if (r.subject.length > 8 && r.subject === r.subject.toUpperCase() && /[A-Z]{6}/.test(r.subject))
            add("WARN", "EML-01", "subject", "subject is all capitals (looks like spam)");
        if (m.purpose === "security" && /\b\d{4,8}\b/.test(r.subject))
            add("PROBLEM", "EML-01", "subject", "a code must never be in the subject line");
    }
    // EML-02 preheader
    const pre = /<div style="display:none[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    const preText = pre ? stripTags(pre[1].replace(/&#847;|&zwnj;|&nbsp;/g, " ")).replace(/\s+/g, " ").trim() : "";
    if (!preText)
        add("PROBLEM", "EML-02", "preheader", "no hidden preheader text; the inbox would show the first words of the email");
    else if (preText.length < 30 || preText.length > 110)
        add("WARN", "EML-02", "preheader", `preheader is ${preText.length} characters; aim for 30 to 110`);
    // EML-03 plain text
    if (!text.trim())
        add("PROBLEM", "EML-03", "text part", "no plain-text version");
    else {
        if (/<\/?(p|div|table|a|td|br)\b/i.test(text))
            add("PROBLEM", "EML-03", "text part", "the plain-text version contains HTML tags");
        for (const u of new Set([...html.matchAll(/href="(https?:[^"]+)"/gi)].map((x) => x[1].replace(/&amp;/g, "&"))))
            if (!text.includes(u))
                add("PROBLEM", "EML-03", "text part", `link ${u} is missing from the plain-text version`);
        if (!text.includes(m.title))
            add("WARN", "EML-03", "text part", "the plain-text version does not carry the title");
    }
    // EML-04 legal footer (external)
    const both = `${html}\n${text}`.replace(/&amp;/g, "&");
    if (external) {
        if (!both.includes(org.legalName))
            add("PROBLEM", "EML-04", "footer", "registered name missing");
        if (isSet(org.registrationNo) && !(html.includes(org.registrationNo) && text.includes(org.registrationNo)))
            add("PROBLEM", "EML-04", "footer", "registration number missing from HTML or plain text");
        if (isSet(org.vatNo) && !(html.includes(org.vatNo) && text.includes(org.vatNo)))
            add("PROBLEM", "EML-04", "footer", "VAT number missing from HTML or plain text");
        if (org.directorsLine && !text.includes(org.directorsLine))
            add("WARN", "EML-04", "footer", "directors line is set in Org settings but missing (Companies Act s32(4) requires the name and registration number, not directors' names)");
        const street0 = (org.address.street ?? []).find(isSet);
        if (!street0 || !(html.includes(street0) && text.includes(street0)))
            add("PROBLEM", "EML-04", "footer", "business address missing (or still a placeholder in Org settings)");
        if (!isSet(org.contacts.tel) || !isSet(org.contacts.email) || !text.includes(org.contacts.tel) || !text.includes(org.contacts.email))
            add("PROBLEM", "EML-04", "footer", "telephone or email missing (or still a placeholder in Org settings)");
        if (!/confidential/i.test(text))
            add("PROBLEM", "EML-13", "footer", "no confidentiality line on an external message");
    }
    void lg;
    if (m.personalInfo && !/personal information/i.test(text))
        add("PROBLEM", "EML-13", "footer", "message carries personal information but has no POPIA line");
    // EML-05 images
    const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((x) => x[0]);
    for (const t of imgs) {
        if (!/\balt="/i.test(t))
            add("PROBLEM", "EML-05", "img", "image without an alt attribute");
        else if (/\balt=""/i.test(t) && /logo/i.test(t))
            add("PROBLEM", "EML-05", "img", "logo with empty alt text");
        if (!/\bwidth="/i.test(t))
            add("WARN", "EML-05", "img", "image without a width (layout jumps when images are blocked)");
        if (/src="data:/i.test(t))
            add("WARN", "EML-05", "img", "embedded data: image; Gmail does not show it, host the image");
        if (/width="1"|height="1"/i.test(t))
            add("WARN", "EML-05", "img", "tracking pixel; avoid it for service mail (POPIA purpose limitation)");
        const src = /src="([^"]+)"/i.exec(t)?.[1];
        if (src && !src.startsWith("https://") && !src.startsWith("data:") && !src.startsWith("cid:"))
            add("PROBLEM", "EML-05", "img", "image is not an https URL or cid:");
    }
    // EML-06 marketing
    if (m.purpose === "marketing") {
        if (!/unsubscribe/i.test(html) || !/unsubscribe/i.test(text))
            add("PROBLEM", "EML-06", "unsubscribe", "marketing mail has no unsubscribe link in both HTML and plain text (POPIA s69(3)(c) and s69(4)(b), CPA s11)");
        if (!r.headers["List-Unsubscribe"])
            add("PROBLEM", "EML-06", "headers", "missing List-Unsubscribe header");
        if (!/One-Click/i.test(r.headers["List-Unsubscribe-Post"] ?? ""))
            add("PROBLEM", "EML-06", "headers", "missing List-Unsubscribe-Post: List-Unsubscribe=One-Click (Gmail and Yahoo bulk sender rule)");
        if (!m.unsubscribe)
            add("PROBLEM", "EML-06", "message", "marketing message has no unsubscribe settings");
        if (!/because|you (signed|subscribed|asked|agreed)/i.test(m.reason))
            add("WARN", "EML-06", "reason", "say why the person is receiving it (the consent source)");
    }
    // EML-07 sensitive
    sensitive(add, "EML-07", "body", stripTags(html) + "\n" + text);
    if (m.purpose !== "security" && /\b(one[- ]time|verification|otp)\b[^.]{0,40}\b\d{4,8}\b/i.test(text))
        add("PROBLEM", "EML-07", "body", "a one-time code outside a security message");
    // EML-08 reply-to
    if (!(replyOrFrom ?? r.replyTo))
        add("PROBLEM", "EML-08", "reply-to", "no Reply-To address; replies would vanish");
    else if (/no-?reply|donotreply/i.test(replyOrFrom ?? r.replyTo))
        add("PROBLEM", "EML-08", "reply-to", "Reply-To is a no-reply address");
    // EML-09 structure
    if (!/<html[^>]*\blang="[a-z-]+"/i.test(html))
        add("PROBLEM", "EML-09", "html", "no lang attribute on <html>");
    if (!/<title>[^<]+<\/title>/i.test(html))
        add("PROBLEM", "EML-09", "html", "no <title>");
    if (!/name="viewport"/i.test(html))
        add("PROBLEM", "EML-09", "html", "no viewport meta");
    if (!/name="color-scheme"/i.test(html))
        add("WARN", "EML-09", "html", "no color-scheme meta (dark mode)");
    if (!/prefers-color-scheme: dark/.test(html))
        add("WARN", "EML-09", "html", "no dark-mode rules");
    if (/<(script|form|iframe|object|embed|video)\b/i.test(html))
        add("PROBLEM", "EML-09", "html", "script, form, iframe or media tag; mail apps remove them");
    if (/<link[^>]+stylesheet/i.test(html) || /@import/i.test(html))
        add("PROBLEM", "EML-09", "html", "external stylesheet; mail apps ignore it");
    if (/display:\s*(flex|grid)|position:\s*(absolute|fixed)|float:/i.test(html.replace(/<style[\s\S]*?<\/style>/i, "")))
        add("PROBLEM", "EML-09", "html", "flex, grid, position or float in inline styles; Outlook ignores them (use tables)");
    if (!/role="presentation"/.test(html))
        add("PROBLEM", "EML-09", "html", "layout tables without role=presentation");
    if (!/max-width:\s*600px/.test(html))
        add("PROBLEM", "EML-09", "html", "no 600px maximum width");
    const bytes = Buffer.byteLength(html, "utf8");
    if (bytes > 102400)
        add("PROBLEM", "EML-09", "size", `HTML is ${Math.round(bytes / 1024)} KB; Gmail clips mail over 102 KB`);
    else if (bytes > 90000)
        add("WARN", "EML-09", "size", `HTML is ${Math.round(bytes / 1024)} KB; close to the 102 KB Gmail clip`);
    if (!/style="/.test(html))
        add("PROBLEM", "EML-09", "html", "no inline styles");
    // EML-10 call to action
    const buttons = m.blocks.filter((b) => b.kind === "button");
    const needsAction = ["task_assigned", "reminder", "approval_request"].includes(m.type);
    if (needsAction && !buttons.length)
        add("PROBLEM", "EML-10", "button", `a ${m.type} email needs a button with one clear action`);
    if (buttons.filter((b) => b.style !== "secondary").length > 1)
        add("WARN", "EML-10", "button", "more than one primary button; keep one main action");
    for (const b of buttons) {
        if (b.label.trim().split(/\s+/).length < 2 && !/^(approve|decline|accept|pay)$/i.test(b.label.trim()))
            add("WARN", "EML-10", b.label, "button label is one vague word; say what happens");
        if (/click here|here$|^submit$|^go$/i.test(b.label.trim()))
            add("PROBLEM", "EML-10", b.label, "vague button label");
        if (!text.includes(b.url) || !html.includes(`>${b.url.replace(/&/g, "&amp;")}</a>`))
            add("PROBLEM", "EML-10", b.label, "button has no copy-this-link fallback in both HTML and text");
    }
    for (const a of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const label = stripTags(a[2]).trim();
        if (!label)
            add("PROBLEM", "EML-14", a[1], "link with no text");
        if (/^(click here|here|link)$/i.test(label))
            add("WARN", "EML-14", a[1], "link text 'click here' says nothing to a screen reader");
        if (/^https?:\/\//i.test(label) && hostOf(label) && hostOf(label) !== hostOf(a[1].replace(/&amp;/g, "&")))
            add("PROBLEM", "EML-11", a[1], `link text shows ${hostOf(label)} but goes to ${hostOf(a[1])} (phishing pattern)`);
    }
    // EML-11 links
    for (const u of new Set([...html.matchAll(/href="(https?:[^"]+)"/gi)].map((x) => x[1].replace(/&amp;/g, "&"))))
        for (const p of linkProblems(u, org))
            add("PROBLEM", "EML-11", "link", p);
    // EML-12 contrast, EML-14 headings, EML-12 signature
    const P = palette(org);
    for (const [nm, a, b] of [["button text", P.light.buttonText, P.light.button], ["link", P.light.link, P.light.card], ["muted text", P.light.muted, P.light.card], ["dark link", P.dark.link, P.dark.card], ["dark muted", P.dark.muted, P.dark.card], ["dark button", P.dark.buttonText, P.dark.button]])
        if (contrast(a, b) < 4.5)
            add("PROBLEM", "EML-12", nm, `contrast ${contrast(a, b).toFixed(1)}:1 is below 4.5:1`);
    if ((html.match(/<h1\b/gi) ?? []).length !== 1)
        add("PROBLEM", "EML-14", "headings", "exactly one <h1> is required");
    if (!text.includes(m.sender.name))
        add("PROBLEM", "EML-12", "signature", "no sender signature (name, designation, contacts)");
    // EML-15 attachments
    for (const b of m.blocks)
        if (b.kind === "attachments")
            for (const it of b.items) {
                if (EXEC.test(it.name))
                    add("PROBLEM", "EML-15", it.name, "attachment type is blocked by mail systems or unsafe");
                if (findSensitive(it.name).length)
                    add("PROBLEM", "EML-15", it.name, "attachment name carries an ID number or card number");
                if (!text.includes(it.name))
                    add("PROBLEM", "EML-15", it.name, "attachment is not listed in the plain-text version");
                if (!it.description.trim())
                    add("PROBLEM", "EML-15", it.name, "attachment has no description of what it is");
            }
    return out;
}
export function checkSms(org, m, s) {
    const out = [];
    const add = mk(out, "sms");
    if (!/^[A-Za-z0-9 ]{3,11}$/.test(s.senderId) || !/[A-Za-z]/.test(s.senderId))
        add("PROBLEM", "SMS-01", "sender id", "sender ID must be 3 to 11 letters or digits with at least one letter (register it with the SMS provider)");
    else if (/ /.test(s.senderId))
        add("WARN", "SMS-01", "sender id", "spaces in a sender ID are not accepted by every network");
    if (!s.text.toLowerCase().includes((org.shortName ?? org.tradingName ?? org.legalName).toLowerCase()))
        add("PROBLEM", "SMS-01", "text", "the message does not say who it is from");
    const { segments, unicode } = smsLength(s.text);
    if (segments > 3)
        add("PROBLEM", "SMS-02", "length", `${segments} segments; keep an SMS to 3 or fewer`);
    else if (segments > 1)
        add("WARN", "SMS-02", "length", `${segments} segments (${s.text.length} characters); one segment is 160 characters`);
    if (unicode)
        add("WARN", "SMS-02", "characters", "contains characters outside the GSM alphabet (smart quotes, emoji, accents); each segment drops to 70 characters");
    if (m.purpose === "marketing" && !/reply stop|send stop|text stop/i.test(s.text))
        add("PROBLEM", "SMS-03", "opt-out", "marketing SMS must say how to opt out, for example 'Reply STOP to opt out' (POPIA s69(3)(c) and s69(4)(b), CPA s11)");
    sensitive(add, "SMS-04", "text", s.text);
    if (m.purpose !== "security" && /\b(code|otp|pin)\b[^.]{0,30}\b\d{4,8}\b/i.test(s.text))
        add("PROBLEM", "SMS-04", "text", "a code in an SMS that is not a security message");
    const urls = urlsIn(s.text);
    if (urls.length > 1)
        add("WARN", "SMS-05", "links", "more than one link");
    for (const u of urls)
        for (const p of linkProblems(u, org))
            add("PROBLEM", "SMS-05", "link", p);
    if (m.purpose === "security" && urls.length)
        add("PROBLEM", "SMS-05", "link", "no link in a one-time code SMS");
    if (PLACEHOLDER.test(s.text))
        add("PROBLEM", "SMS-06", "text", "unfilled placeholder");
    if (/\p{Extended_Pictographic}/u.test(s.text))
        add("WARN", "SMS-06", "text", "emoji");
    if (/[A-Z]/.test(s.text) && s.text.replace(/[^A-Za-z]/g, "").length > 12 && s.text.replace(/[^A-Z]/g, "").length / s.text.replace(/[^A-Za-z]/g, "").length > 0.6)
        add("WARN", "SMS-06", "text", "mostly capitals");
    if (m.purpose === "security" && !(/do not share/i.test(s.text) && /expires? in/i.test(s.text)))
        add("PROBLEM", "SMS-07", "text", "a code SMS must say it expires and must not be shared");
    return out;
}
export function checkWhatsApp(org, m, w) {
    const out = [];
    const add = mk(out, "whatsapp");
    if (!/^[a-z0-9_]{1,512}$/.test(w.name))
        add("PROBLEM", "WA-01", "name", "template name must be lower-case letters, digits and underscores");
    const want = m.purpose === "security" ? "AUTHENTICATION" : m.purpose === "marketing" ? "MARKETING" : "UTILITY";
    if (w.category !== want)
        add("PROBLEM", "WA-01", "category", `category must be ${want} for a ${m.purpose} message`);
    if (w.body.length > 1024)
        add("PROBLEM", "WA-02", "body", `body is ${w.body.length} characters; the limit is 1024`);
    const vars = [...w.body.matchAll(/\{\{(\d+)\}\}/g)].map((x) => +x[1]);
    vars.forEach((v, i) => { if (v !== i + 1)
        add("PROBLEM", "WA-03", "body", "variables must be numbered {{1}}, {{2}} in order"); });
    if (vars.length !== w.params.length)
        add("PROBLEM", "WA-03", "params", `${vars.length} variables in the body but ${w.params.length} example values`);
    if (/^\s*\{\{/.test(w.body) && m.purpose !== "security")
        add("PROBLEM", "WA-03", "body", "a template cannot start with a variable");
    if (/\{\{\d+\}\}\s*[.!?]?\s*$/.test(w.body) && m.purpose !== "security")
        add("PROBLEM", "WA-03", "body", "a template cannot end with a variable");
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(w.body))
        add("PROBLEM", "WA-03", "body", "two variables side by side");
    const fixedWords = w.body.replace(/\{\{\d+\}\}/g, "").trim().split(/\s+/).length;
    if (m.purpose !== "security" && fixedWords < vars.length * 3)
        add("WARN", "WA-03", "body", "too many variables for the amount of fixed text; Meta may reject it");
    for (const p of w.params) {
        if (/[\n\t]| {4,}/.test(p))
            add("PROBLEM", "WA-04", "params", "a value has a new line, tab or four spaces");
        if (!p.trim())
            add("PROBLEM", "WA-04", "params", "an example value is empty");
    }
    if ((w.header ?? "").length > 60)
        add("PROBLEM", "WA-02", "header", "header over 60 characters");
    if ((w.footer ?? "").length > 60)
        add("PROBLEM", "WA-02", "footer", "footer over 60 characters");
    if (/\{\{/.test(w.footer ?? ""))
        add("PROBLEM", "WA-02", "footer", "no variables in a footer");
    if (w.buttons.length > 3)
        add("PROBLEM", "WA-05", "buttons", "more than 3 buttons");
    for (const b of w.buttons) {
        if (b.text.length > 25)
            add("PROBLEM", "WA-05", b.text, "button text over 25 characters");
        if (b.url)
            for (const p of linkProblems(b.url, org))
                add("PROBLEM", "WA-06", "button url", p);
    }
    if (m.purpose === "marketing" && !w.buttons.some((b) => b.type === "QUICK_REPLY" && /stop|unsubscribe|opt/i.test(b.text)))
        add("PROBLEM", "WA-07", "buttons", "marketing template needs a 'Stop promotions' quick-reply button (POPIA s69)");
    if (m.purpose === "security" && !w.buttons.some((b) => b.type === "COPY_CODE"))
        add("PROBLEM", "WA-07", "buttons", "authentication template needs a copy-code button");
    sensitive(add, "WA-08", "body", `${w.body}\n${w.params.join("\n")}`);
    if (m.purpose !== "security" && /\b(otp|verification code)\b/i.test(w.body))
        add("PROBLEM", "WA-08", "body", "codes belong in an AUTHENTICATION template only");
    if (PLACEHOLDER.test(w.body.replace(/\{\{\d+\}\}/g, "")))
        add("PROBLEM", "WA-02", "body", "unfilled placeholder text");
    return out;
}
export function checkPush(org, m, p) {
    const out = [];
    const add = mk(out, "push");
    if (!p.title.trim() || !p.body.trim())
        add("PROBLEM", "PUSH-01", "text", "title and body are both required");
    if (p.title.length > 65)
        add("PROBLEM", "PUSH-01", "title", `title is ${p.title.length} characters; phones cut it near 40 to 65`);
    else if (p.title.length > 40)
        add("WARN", "PUSH-01", "title", `title is ${p.title.length} characters; aim for 40 or fewer`);
    if (p.body.length > 178)
        add("PROBLEM", "PUSH-01", "body", `body is ${p.body.length} characters; the lock screen shows about 120 to 178`);
    else if (p.body.length > 120)
        add("WARN", "PUSH-01", "body", `body is ${p.body.length} characters; aim for 120 or fewer`);
    sensitive(add, "PUSH-02", "text", `${p.title}\n${p.body}\n${JSON.stringify(p.data)}`);
    if (m.purpose === "security" && /\b\d{4,8}\b/.test(p.body))
        add("PROBLEM", "PUSH-02", "body", "no code on a lock screen");
    if (/R\s?\d[\d\s,.]*\d/.test(p.body) && m.type !== "receipt")
        add("WARN", "PUSH-02", "body", "an amount on a lock screen; leave money out of push text");
    if (p.url && !p.url.startsWith("/"))
        for (const x of linkProblems(p.url, org))
            add("PROBLEM", "PUSH-03", "url", x);
    if (!p.tag)
        add("WARN", "PUSH-04", "tag", "no collapse tag; repeated pushes will stack");
    if (Buffer.byteLength(JSON.stringify(p), "utf8") > 3800)
        add("PROBLEM", "PUSH-04", "payload", "payload over about 4 KB");
    if (PLACEHOLDER.test(`${p.title} ${p.body}`))
        add("PROBLEM", "PUSH-01", "text", "unfilled placeholder");
    if (m.purpose === "marketing")
        add("WARN", "PUSH-05", "purpose", "marketing push needs the person's opt-in for push and a setting to turn it off");
    return out;
}
export function checkInApp(org, m, n) {
    const out = [];
    const add = mk(out, "inapp");
    if (!n.id || !n.createdAt)
        add("PROBLEM", "APP-01", "record", "needs an id and created time");
    if (!n.title.trim() || !n.body.trim())
        add("PROBLEM", "APP-01", "text", "title and body are required");
    if (n.title.length > 80)
        add("PROBLEM", "APP-01", "title", "title over 80 characters");
    if (n.body.length > 280)
        add("PROBLEM", "APP-01", "body", "body over 280 characters; link to the full record instead");
    if (!["info", "warn", "urgent", "success"].includes(n.severity))
        add("PROBLEM", "APP-01", "severity", "severity must be info, warn, urgent or success");
    if (/<[a-z][^>]*>/i.test(n.title + n.body))
        add("PROBLEM", "APP-02", "text", "HTML in notification text; send plain text");
    sensitive(add, "APP-03", "text", `${n.title}\n${n.body}`);
    if (n.action) {
        if (n.action.label.length > 25)
            add("PROBLEM", "APP-04", "action", "action label over 25 characters");
        if (!n.action.url.startsWith("/"))
            for (const x of linkProblems(n.action.url, org))
                add("PROBLEM", "APP-04", "action", x);
    }
    if (PLACEHOLDER.test(`${n.title} ${n.body}`))
        add("PROBLEM", "APP-01", "text", "unfilled placeholder");
    return out;
}
export function checkPortal(org, m, p) {
    const out = [];
    const add = mk(out, "portal");
    if (!p.subject.trim() || !p.thread.trim())
        add("PROBLEM", "PTL-01", "message", "needs a subject and a thread reference");
    if (/<\/?(script|style|iframe|object|embed|form|input|img)\b|\son\w+=|javascript:/i.test(p.bodyHtml))
        add("PROBLEM", "PTL-02", "html", "unsafe tag or event handler in a portal message");
    const tags = [...p.bodyHtml.matchAll(/<\/?([a-z0-9]+)/gi)].map((x) => x[1].toLowerCase());
    for (const t of new Set(tags))
        if (!["p", "h3", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "a", "strong", "em", "br"].includes(t))
            add("PROBLEM", "PTL-02", t, "tag is not in the portal's allowed list");
    for (const u of new Set([...p.bodyHtml.matchAll(/href="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, "&"))))
        if (!u.startsWith("/"))
            for (const x of linkProblems(u, org))
                add("PROBLEM", "PTL-03", "link", x);
    const s = findSensitive(p.bodyText).filter((f) => ["password", "secret", "secret-in-url", "card-number"].includes(f.code));
    for (const f of s)
        add("PROBLEM", "PTL-04", "body", `contains ${f.what}`);
    if (findSensitive(p.bodyText).some((f) => f.code === "id-number"))
        add("WARN", "PTL-04", "body", "ID number in a portal message; show the last 4 digits only");
    if (!p.bodyText.includes(m.sender.name))
        add("PROBLEM", "PTL-05", "sender", "no sender name");
    if (PLACEHOLDER.test(p.bodyText))
        add("PROBLEM", "PTL-01", "body", "unfilled placeholder");
    return out;
}
export function checkLetter(org, m, l) {
    const out = [];
    const add = mk(out, "letter");
    const lg = legalLines(org);
    if (!/@page\s*\{[^}]*size:\s*A4/i.test(l.html))
        add("PROBLEM", "LTR-01", "page", "not set to A4");
    const pt = [...l.html.matchAll(/font:\s*(\d+(?:\.\d+)?)pt/g)].map((x) => +x[1]);
    const body = /body\{font:\s*(\d+(?:\.\d+)?)pt/.exec(l.html);
    if (!body || +body[1] < 11)
        add("PROBLEM", "LTR-01", "type", "body text must be at least 11 pt");
    void pt;
    if (!l.html.includes(org.legalName) || (org.registrationNo && !l.html.includes(org.registrationNo)))
        add("PROBLEM", "LTR-02", "letterhead/footer", "legal name or registration number missing");
    if (org.vatNo && !l.html.includes(org.vatNo))
        add("PROBLEM", "LTR-02", "footer", "VAT number missing");
    if (!l.html.includes(org.address.street[0]) || !l.text.includes(org.contacts.tel))
        add("PROBLEM", "LTR-02", "letterhead", "address or telephone missing");
    if (!/<img[^>]*alt="[^"]+"/i.test(l.html) && !l.html.includes(`<strong>${org.tradingName ?? org.legalName}`))
        add("WARN", "LTR-02", "logo", "no logo with alt text");
    for (const k of ["Our ref", "Date", "Enquiries", "Tel", "Email"])
        if (!l.html.includes(`<th>${k}</th>`))
            add("PROBLEM", "LTR-03", "reference block", `missing '${k}'`);
    if (!m.reference)
        add("PROBLEM", "LTR-03", "reference", "a posted letter must carry our reference");
    const a = m.recipient.address ?? [];
    if (!m.recipient.name || a.length < 3 || !a.some((x) => /\b\d{4}\b/.test(x)))
        add("PROBLEM", "LTR-04", "addressee", "name, street, town and a 4-digit postal code are needed to post a letter");
    if (!/<h1>Re: /.test(l.html))
        add("PROBLEM", "LTR-05", "subject", "no 'Re:' subject line");
    if (!/Dear /.test(l.html) || !/Yours (faithfully|sincerely)/.test(l.html))
        add("PROBLEM", "LTR-05", "salutation", "salutation or closing missing");
    if (/Dear Sir or Madam/.test(l.html) && /Yours sincerely/.test(l.html))
        add("PROBLEM", "LTR-05", "salutation", "'Dear Sir or Madam' takes 'Yours faithfully'");
    if (/Dear [A-Z]/.test(l.html) && !/Dear Sir or Madam/.test(l.html) && /Yours faithfully/.test(l.html))
        add("PROBLEM", "LTR-05", "salutation", "a named person takes 'Yours sincerely'");
    if (!l.text.includes(m.sender.name))
        add("PROBLEM", "LTR-06", "signature", "no signatory name");
    if (!/confidential/i.test(l.text))
        add("PROBLEM", "LTR-07", "footer", "no confidentiality line");
    if (m.personalInfo && !/personal information/i.test(l.text))
        add("PROBLEM", "LTR-07", "footer", "personal information but no POPIA line");
    void lg;
    if (/<script|<form|\son\w+=/i.test(l.html))
        add("PROBLEM", "LTR-08", "html", "script or form in a printed letter");
    sensitive(add, "LTR-09", "text", l.text);
    if (/color:\s*#(?!000)[0-9a-f]{3,6}/i.test(l.html))
        add("WARN", "LTR-01", "colour", "colour used; a letter must stay legible in black and white");
    if (l.text.length > 3500)
        add("WARN", "LTR-01", "length", "more than one page; add the continuation header with reference and page number");
    if (PLACEHOLDER.test(l.text))
        add("PROBLEM", "LTR-01", "text", "unfilled placeholder");
    return out;
}
/** `ics` is the text of the .ics file (built with email/calendar-ics-builder). */
export function checkIcs(org, m, ics, method) {
    const out = [];
    const add = mk(out, "ics");
    if (!ics.includes("\r\n"))
        add("PROBLEM", "ICS-01", "file", "lines must end with CRLF");
    for (const line of ics.split("\r\n"))
        if (Buffer.byteLength(line, "utf8") > 75 && !line.startsWith(" "))
            add("PROBLEM", "ICS-01", "line", "a line is longer than 75 octets and not folded");
    for (const k of ["BEGIN:VCALENDAR", "END:VCALENDAR", "VERSION:2.0", "PRODID:", `METHOD:${method}`, "BEGIN:VEVENT", "UID:", "DTSTAMP:", "DTSTART", "SUMMARY:", "ORGANIZER"])
        if (!ics.includes(k))
            add("PROBLEM", "ICS-02", k, "required line missing");
    if (!/ATTENDEE/.test(ics))
        add("PROBLEM", "ICS-02", "ATTENDEE", "no attendee, so the invite cannot be answered");
    if (!/DTSTART(;TZID=[^:]+|;VALUE=DATE)?:[0-9T]+Z?/.test(ics) || /DTSTART:\d{8}T\d{6}\r\n/.test(ics))
        add("PROBLEM", "ICS-03", "DTSTART", "floating time: use UTC (Z) or a TZID so every calendar shows the same hour");
    if (method === "CANCEL" && !/STATUS:CANCELLED/.test(ics))
        add("PROBLEM", "ICS-04", "STATUS", "a cancellation must say STATUS:CANCELLED with a higher SEQUENCE");
    if (method === "REQUEST" && !/LOCATION:/.test(ics) && !/URL/.test(ics))
        add("WARN", "ICS-04", "LOCATION", "no location or link");
    if (!/SEQUENCE:/.test(ics))
        add("WARN", "ICS-04", "SEQUENCE", "no SEQUENCE; updates may not replace the old invite");
    for (const u of urlsIn(ics.replace(/\r\n /g, "")))
        for (const p of linkProblems(u, org))
            add("PROBLEM", "ICS-05", "link", p);
    sensitive(add, "ICS-06", "description", ics.replace(/\r\n /g, ""));
    return out;
}
export function summarise(name, issues) {
    const problems = issues.filter((i) => i.severity === "PROBLEM").length;
    return { issues, problems, warnings: issues.length - problems, lines: issues.map((i) => `${i.severity} ${i.code} ${name}/${i.channel} ${i.where}: ${i.why}`) };
}
