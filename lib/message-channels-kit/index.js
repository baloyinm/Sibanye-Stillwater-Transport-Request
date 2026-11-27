export * from "./types.js";
export { renderEmail, legalLines, logoUrl, isSet } from "./email.js";
export { renderSms, renderWhatsApp, renderPush, renderInApp, renderPortal, renderLetter, icsInput } from "./channels.js";
export * as templates from "./templates.js";
export { checkEmail, checkSms, checkWhatsApp, checkPush, checkInApp, checkPortal, checkLetter, checkIcs, summarise } from "./check.js";
export { renderPreviewPage } from "./preview.js";
export { palette, contrast, findSensitive, linkProblems, smsLength, rand, longDate } from "./util.js";
import { renderEmail } from "./email.js";
import { icsInput, renderInApp, renderLetter, renderPortal, renderPush, renderSms, renderWhatsApp } from "./channels.js";
import { checkEmail, checkInApp, checkIcs, checkLetter, checkPortal, checkPush, checkSms, checkWhatsApp } from "./check.js";
/** Letters are never on by default: a posted letter is a deliberate choice (it needs a reference and a postal address). */
export const ALL_CHANNELS = ["email", "sms", "whatsapp", "push", "inapp", "portal", "ics"];
/** Render one Message to the channels asked for (default all that make sense for it). */
export function renderBundle(org, message, channels = ALL_CHANNELS, opts = {}) {
    const b = { message };
    if (channels.includes("email"))
        b.email = renderEmail(org, message);
    if (channels.includes("sms"))
        b.sms = renderSms(org, message);
    if (channels.includes("whatsapp"))
        b.whatsapp = renderWhatsApp(org, message);
    if (channels.includes("push"))
        b.push = renderPush(org, message);
    if (channels.includes("inapp"))
        b.inapp = renderInApp(org, message, opts.id ?? `${message.type}-${message.reference ?? "1"}`, opts.now ?? new Date(0).toISOString());
    if (channels.includes("portal"))
        b.portal = renderPortal(org, message);
    if (channels.includes("letter") && (message.recipient.address ?? []).length)
        b.letter = renderLetter(org, message);
    if (channels.includes("ics"))
        b.ics = icsInput(org, message);
    return b;
}
/** Run every checker that has something to check. `icsText` is the .ics file built from `bundle.ics` with email/calendar-ics-builder. */
export function checkBundle(org, b, opts = {}) {
    const m = b.message;
    const out = [];
    if (b.email)
        out.push(...checkEmail(org, m, b.email));
    if (b.sms)
        out.push(...checkSms(org, m, b.sms));
    if (b.whatsapp)
        out.push(...checkWhatsApp(org, m, b.whatsapp));
    if (b.push)
        out.push(...checkPush(org, m, b.push));
    if (b.inapp)
        out.push(...checkInApp(org, m, b.inapp));
    if (b.portal)
        out.push(...checkPortal(org, m, b.portal));
    if (b.letter)
        out.push(...checkLetter(org, m, b.letter));
    if (b.ics && opts.icsText)
        out.push(...checkIcs(org, m, opts.icsText, b.ics.method));
    return out;
}
/** Throws with every PROBLEM line when a message fails: use in an app's tests and before a send. */
export function assertMessageOk(org, b, opts = {}) {
    const problems = checkBundle(org, b, opts).filter((i) => i.severity === "PROBLEM");
    if (problems.length)
        throw new Error(problems.map((i) => `PROBLEM ${i.code} ${i.channel} ${i.where}: ${i.why}`).join("\n"));
}
