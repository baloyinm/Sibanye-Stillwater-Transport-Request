export const COMMS_MODES = ["off", "redirect", "allowlist", "live"];
const list = (v) => (v ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
const digits = (v) => v.replace(/\D/g, "");
export function parseMode(raw) {
    const v = (raw ?? "").trim().toLowerCase();
    return COMMS_MODES.includes(v) ? v : "redirect";
}
export function isProduction(env) {
    return (env.COMMS_ENVIRONMENT ?? env.NODE_ENV ?? "").toLowerCase() === "production";
}
export function channelConfig(channel, env) {
    const raw = env[`COMMS_MODE_${channel.toUpperCase()}`] ?? env.COMMS_MODE;
    const isMail = channel === "email";
    return {
        mode: parseMode(raw),
        redirectTo: (isMail ? env.COMMS_REDIRECT_EMAIL : env.COMMS_REDIRECT_PHONE)?.trim() || undefined,
        allowlist: list(isMail ? env.COMMS_ALLOWLIST_EMAIL : env.COMMS_ALLOWLIST_PHONE),
        production: isProduction(env),
    };
}
/** Throws when live is asked for outside production. Call at startup so a bad setting stops the app, not a client's inbox. */
export function assertCommsConfig(env, channels = ["email", "sms", "whatsapp", "push"]) {
    for (const ch of channels) {
        const c = channelConfig(ch, env);
        if (c.mode === "live" && !c.production) {
            throw new Error(`COMMS ${ch}: live mode refused outside production (set COMMS_ENVIRONMENT=production only on the real deployment).`);
        }
    }
}
/** One line per channel for the startup log, e.g. "comms email=redirect(test inbox set) sms=off ...". Never prints addresses or numbers. */
export function startupLine(env, channels = ["email", "sms", "whatsapp", "push"]) {
    const parts = channels.map((ch) => {
        const c = channelConfig(ch, env);
        const note = c.mode === "redirect" ? (c.redirectTo ? "(test target set)" : "(NO test target: will block)")
            : c.mode === "allowlist" ? `(${c.allowlist.length} entries)` : c.mode === "live" ? (c.production ? "(PRODUCTION)" : "(REFUSED: not production)") : "";
        return `${ch}=${c.mode}${note}`;
    });
    return `comms delivery modes: ${parts.join(" ")}`;
}
const onList = (channel, to, allow) => {
    if (channel === "email") {
        const a = to.toLowerCase();
        return allow.some((e) => (e.startsWith("@") ? a.endsWith(e.toLowerCase()) : a === e.toLowerCase()));
    }
    return allow.some((n) => digits(n) !== "" && digits(n) === digits(to)); // an entry with no digits ("n/a") never matches
};
/** What would happen to a message for these recipients. Pure: used by the senders, the dry-run CLI and the preview page. */
export function decide(channel, to, env) {
    const original = (Array.isArray(to) ? [...to] : [to]).filter(Boolean);
    const c = channelConfig(channel, env);
    if (c.mode === "off")
        return { mode: c.mode, action: "block", original, actual: [], reason: "mode off" };
    if (c.mode === "live") {
        if (!c.production)
            return { mode: c.mode, action: "block", original, actual: [], reason: "live refused: not production" };
        return { mode: c.mode, action: "send", original, actual: original, reason: "live" };
    }
    if (c.mode === "allowlist") {
        const ok = original.filter((t) => onList(channel, t, c.allowlist));
        const rest = original.filter((t) => !ok.includes(t));
        if (!rest.length)
            return { mode: c.mode, action: "send", original, actual: ok, reason: "all on allowlist" };
        if (!c.redirectTo) {
            return ok.length
                ? { mode: c.mode, action: "send", original, actual: ok, reason: `${rest.length} not on allowlist, dropped (no test target)` }
                : { mode: c.mode, action: "block", original, actual: [], reason: "not on allowlist and no test target" };
        }
        return { mode: c.mode, action: ok.length ? "send" : "redirect", original, actual: ok.length ? [...ok, c.redirectTo] : [c.redirectTo], reason: `${rest.length} not on allowlist, copy redirected` };
    }
    if (!c.redirectTo)
        return { mode: c.mode, action: "block", original, actual: [], reason: "redirect mode but no test target configured" };
    return { mode: c.mode, action: "redirect", original, actual: [c.redirectTo], reason: "redirect mode" };
}
export class MemoryOutbox {
    entries = [];
    log = (e) => { this.entries.push(e); };
}
/** JSON-lines file outbox for Node (one line per attempt). `append` is injected so this file stays free of node imports. */
export const jsonLinesOutbox = (append) => (e) => append(JSON.stringify(e) + "\n");
const safe = async (outbox, e) => {
    try {
        await outbox?.(e);
    }
    catch (err) {
        console.warn(`comms outbox write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
};
const bannerHtml = (d) => `<div style="margin:0 0 12px;padding:10px 14px;background:#fff4cc;border:2px solid #b45309;color:#3b2a00;font:14px/1.4 Arial,sans-serif" role="note"><strong>TEST MESSAGE, not sent to the real recipient.</strong> Mode: ${d.mode}. Written for: ${d.original.map(esc).join(", ")}. Delivered to: ${d.actual.map(esc).join(", ")}.</div>`;
const bannerText = (d) => `*** TEST MESSAGE, not sent to the real recipient. Mode: ${d.mode}. Written for: ${d.original.join(", ")}. Delivered to: ${d.actual.join(", ")}. ***\n\n`;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** The emails exactly as the guard would deliver them (used by sending and by dry-run). Real recipients on the allowlist get the message unchanged; a redirected copy goes to the test target, tagged and bannered. Empty list = blocked. */
export function previewEmail(message, env) {
    const d = decide("email", message.to, env);
    if (d.action === "block")
        return { decision: d, messages: [] };
    const real = d.actual.filter((t) => d.original.includes(t));
    const test = d.actual.filter((t) => !d.original.includes(t));
    const out = [];
    if (real.length)
        out.push({ ...message, to: real });
    if (test.length) {
        const lost = d.original.filter((t) => !real.includes(t));
        const tag = `[TEST to ${lost.join(", ")}] `;
        const banner = { ...d, original: lost };
        const html = /<body[^>]*>/i.test(message.html) ? message.html.replace(/(<body[^>]*>)/i, `$1${bannerHtml(banner)}`) : bannerHtml(banner) + message.html;
        out.push({ ...message, to: test, subject: tag + message.subject, html, text: bannerText(banner) + message.text });
    }
    return { decision: d, messages: out };
}
const envOf = (o) => (typeof o.env === "function" ? o.env() : o.env);
async function record(o, channel, d, what, r) {
    await safe(o.outbox, {
        at: (o.now?.() ?? new Date()).toISOString(), channel, mode: d.mode, action: d.action, who: d.original,
        redirectedTo: d.action === "send" && d.mode === "live" ? [] : d.actual, what, reason: d.reason,
        outcome: r ? r.status : "blocked", providerId: r?.providerId,
    });
}
/** Wrap an EmailSender. Everything that leaves goes through the delivery mode and is written to the outbox. */
export function guardEmailSender(inner, o) {
    return {
        name: `${inner.name}+guard`,
        async send(message) {
            const { decision, messages } = previewEmail(message, envOf(o));
            if (!messages.length) {
                await record(o, "email", decision, message.subject, null);
                return { status: "not_configured", error: `blocked by delivery mode: ${decision.reason}` };
            }
            const results = [];
            for (const m of messages)
                results.push(await inner.send(m));
            const r = results.find((x) => x.status !== "sent") ?? results[0];
            await record(o, "email", decision, message.subject, r);
            return r;
        },
    };
}
export function guardSmsSender(inner, o) {
    return {
        name: `${inner.name}+guard`,
        async send(message) {
            const d = decide("sms", message.to, envOf(o));
            if (d.action === "block") {
                await record(o, "sms", d, "sms", null);
                return { status: "not_configured", error: `blocked by delivery mode: ${d.reason}` };
            }
            const results = [];
            for (const to of d.actual) {
                const prefix = d.mode === "live" || d.original.includes(to) ? "" : `[TEST to ${d.original.join(",")}] `;
                results.push(await inner.send({ ...message, to, text: prefix + message.text }));
            }
            const r = results.find((x) => x.status !== "sent") ?? results[0] ?? { status: "failed", error: "no recipient" };
            await record(o, "sms", d, "sms", r);
            return r;
        },
    };
}
export function guardWhatsAppSender(inner, o) {
    return {
        name: `${inner.name}+guard`,
        async send(message) {
            // WhatsApp is owner-only already; the guard still applies so a template never reaches a client during redirect.
            const d = decide("whatsapp", message.to ?? "", envOf(o));
            if (d.action === "block" || !d.actual.length) {
                await record(o, "whatsapp", d, message.template?.name ?? "text", null);
                return { status: "not_configured", error: `blocked by delivery mode: ${d.reason}` };
            }
            const r = await inner.send({ ...message, to: d.actual[0] });
            await record(o, "whatsapp", d, message.template?.name ?? "text", r);
            return r;
        },
    };
}
/** Dry run: what would happen to this message right now, without calling any sender. */
export function dryRun(channel, to, env, what) {
    const decision = decide(channel, to, env);
    const line = `${channel} "${what}" written for ${decision.original.join(", ")} -> ${decision.action.toUpperCase()} ${decision.actual.join(", ") || "(nobody)"} [${decision.mode}: ${decision.reason}]`;
    return { decision, line };
}
