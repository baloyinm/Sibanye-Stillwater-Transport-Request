export const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** Rand amount in South African style: R12 345,60 (non-breaking space). */
export const rand = (n) => "R" + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** 2026-04-15 -> 15 April 2026. */
export const longDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso; };
// ---- colour ----
export const rgb = (hex) => {
    let h = hex.replace("#", "");
    if (h.length === 3)
        h = h.split("").map((c) => c + c).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const lum = (hex) => { const [r, g, b] = rgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const toHex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); };
/** The text colour that reads on a background: white or the ink colour, whichever has more contrast. */
export const textOn = (bg, ink) => (contrast(bg, "#ffffff") >= contrast(bg, ink) ? "#ffffff" : ink);
/** Light and dark palettes from the Org colours. Every text colour is moved until it has 4.5:1 on its background. */
export function palette(org) {
    const c = org.colours;
    const fix = (fg, bg, toward) => { let x = fg, t = 0; while (contrast(x, bg) < 4.5 && t < 1) {
        t += 0.05;
        x = mix(fg, toward, t);
    } return x; };
    const lc = "#ffffff", dc = "#1b1f24";
    const light = { page: "#f3f4f6", card: lc, ink: fix(c.ink, lc, "#000000"), muted: fix(c.muted, lc, "#000000"), rule: c.rule, link: fix(c.primary, lc, "#000000"), button: c.primary, buttonText: textOn(c.primary, c.ink), accent: c.accent, tint: mix(c.primary, "#ffffff", 0.9) };
    const dark = { page: "#101317", card: dc, ink: "#e8eaed", muted: fix(c.muted, dc, "#ffffff"), rule: "#3a4048", link: fix(c.primary, dc, "#ffffff"), button: c.primary, buttonText: textOn(c.primary, c.ink), accent: c.accent, tint: "#232a31" };
    return { light, dark };
}
// ---- sensitive data ----
const luhn = (d) => { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (alt) {
        n *= 2;
        if (n > 9)
            n -= 9;
    }
    s += n;
    alt = !alt;
} return s % 10 === 0; };
const validSaId = (d) => {
    if (!/^\d{13}$/.test(d))
        return false;
    const mm = +d.slice(2, 4), dd = +d.slice(4, 6);
    return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && luhn(d) && (d[10] === "0" || d[10] === "1");
};
/** Things that must never be in a message body: ID numbers, card numbers, passwords, keys, tokens in plain text. */
export function findSensitive(text) {
    const out = [];
    for (const m of text.matchAll(/(?<!\d)\d{13}(?!\d)/g))
        if (validSaId(m[0]))
            out.push({ code: "id-number", what: "a South African ID number" });
    for (const m of text.matchAll(/(?<![\d.])(?:\d[ -]?){13,19}(?![\d])/g)) {
        const d = m[0].replace(/\D/g, "");
        if (d.length >= 13 && d.length <= 19 && /^(4|5[1-5]|2[2-7]|3[0-8]|6)/.test(d) && luhn(d) && !validSaId(d) && !/[A-Za-z]-?\s?$/.test(text.slice(Math.max(0, (m.index ?? 0) - 4), m.index ?? 0)))
            out.push({ code: "card-number", what: "a card number" });
    }
    if (/\b(password|passwd|pwd|pin)\s*(is|:|=)\s*\S+/i.test(text))
        out.push({ code: "password", what: "a password or PIN" });
    if (/\b(api[_ -]?key|secret|bearer|access[_ -]?token)\s*(is|:|=)?\s*[A-Za-z0-9_\-.]{12,}/i.test(text))
        out.push({ code: "secret", what: "a key, secret or token" });
    if (/\b(sk_(live|test)_|re_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|xox[bp]-)/.test(text))
        out.push({ code: "secret", what: "a provider key" });
    if (/\b(account\s*(no|number|nr|#)|acc\.?\s*no)\s*[:#]?\s*\d{8,}/i.test(text))
        out.push({ code: "bank-account", what: "a bank account number" });
    if (/[?&](password|passwd|pwd|secret|api[_-]?key|access_token)=/i.test(text))
        out.push({ code: "secret-in-url", what: "a secret in a link" });
    return out;
}
// ---- links ----
const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "rb.gy", "cutt.ly", "buff.ly", "shorturl.at", "tiny.cc"];
export const urlsIn = (text) => [...text.matchAll(/https?:\/\/[^\s"'<>)]+/gi)].map((m) => m[0].replace(/[.,;]+$/, ""));
export const hostOf = (url) => { try {
    return new URL(url).hostname.toLowerCase();
}
catch {
    return "";
} };
export const allowedHosts = (org) => [hostOf(org.contacts.web ?? ""), ...(org.messaging?.linkDomains ?? []).map((d) => d.toLowerCase())].filter(Boolean);
/** Empty array = safe. Rules: https only, no user info, no IP address, no look-alike (punycode) host, no shortener, host on the org's list. */
export function linkProblems(url, org) {
    const p = [];
    let u;
    try {
        u = new URL(url);
    }
    catch {
        return [`not a valid URL: ${url}`];
    }
    if (u.protocol !== "https:")
        p.push(`${url} is not https`);
    if (u.username || u.password)
        p.push(`${url} has a user name or password in it`);
    const h = u.hostname.toLowerCase();
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith("["))
        p.push(`${url} points to a raw IP address`);
    if (h.includes("xn--"))
        p.push(`${url} uses an encoded (look-alike) host name`);
    const allowed = allowedHosts(org);
    if (SHORTENERS.includes(h) && !allowed.includes(h))
        p.push(`${url} is a link shortener`);
    else if (!allowed.some((a) => h === a || h.endsWith("." + a)))
        p.push(`${h} is not on the organisation's link list (contacts.web or messaging.linkDomains)`);
    return p;
}
// ---- SMS length ----
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";
export function smsLength(text) {
    let units = 0, unicode = false;
    for (const ch of text) {
        if (GSM.includes(ch))
            units += 1;
        else if (GSM_EXT.includes(ch))
            units += 2;
        else {
            unicode = true;
            break;
        }
    }
    if (unicode) {
        units = text.length;
        return { unicode, units, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
    }
    return { unicode, units, segments: units <= 160 ? 1 : Math.ceil(units / 153) };
}
export const truncate = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");
export const stripTags = (h) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|h\d|li|table)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
export const orgName = (o) => o.tradingName ?? o.legalName;
export const orgShort = (o) => o.shortName ?? o.tradingName ?? o.legalName;
export const nonEmpty = (x) => Boolean(x);
