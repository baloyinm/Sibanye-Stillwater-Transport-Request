import { esc } from "./util.js";
/** A single self-contained page showing every channel for each message, the checker result and (optionally) where each would be delivered. No scripts, nothing is sent. */
export function renderPreviewPage(items, title = "Message preview (dry run, nothing was sent)") {
    const sec = (h, inner) => `<section><h3>${esc(h)}</h3>${inner}</section>`;
    const del = (n) => n ? `<p class="del"><strong>${esc(n.mode)}: ${esc(n.action)}.</strong> Written for ${esc(n.original.join(", "))}. Would go to ${esc(n.actual.join(", ") || "nobody")}. ${esc(n.reason)}</p>` : "";
    const cards = items.map(({ bundle: b, issues, icsText, delivery }) => {
        const p = issues.filter((i) => i.severity === "PROBLEM").length;
        const parts = [
            b.email && sec("Email", del(delivery?.email) + `<p><strong>Subject:</strong> ${esc(b.email.subject)} <span class="mut">Reply-To ${esc(b.email.replyTo)}</span></p><iframe title="Email ${esc(b.message.type)}" sandbox srcdoc="${esc(b.email.html)}" style="width:100%;height:640px;border:1px solid #bbb"></iframe><details><summary>Plain-text part</summary><pre>${esc(b.email.text)}</pre></details>`),
            b.sms && sec("SMS", del(delivery?.sms) + `<p class="mut">From ${esc(b.sms.senderId)}, ${b.sms.segments} segment(s)${b.sms.unicode ? ", unicode" : ""}</p><pre class="bubble">${esc(b.sms.text)}</pre>`),
            b.whatsapp && sec("WhatsApp template", del(delivery?.whatsapp) + `<p class="mut">${esc(b.whatsapp.name)} (${esc(b.whatsapp.category)}, ${esc(b.whatsapp.language)})</p><pre class="bubble">${esc(b.whatsapp.body.replace(/\{\{(\d)\}\}/g, (_, n) => b.whatsapp.params[+n - 1] ?? ""))}\n\n${esc(b.whatsapp.footer ?? "")}\n${b.whatsapp.buttons.map((x) => `[ ${esc(x.text)} ]`).join(" ")}</pre>`),
            b.push && sec("Push", del(delivery?.push) + `<div class="push"><strong>${esc(b.push.title)}</strong><br>${esc(b.push.body)}</div>`),
            b.inapp && sec("In-app", `<div class="push"><strong>${esc(b.inapp.title)}</strong> <span class="mut">[${esc(b.inapp.severity)}]</span><br>${esc(b.inapp.body)}</div>`),
            b.portal && sec("Portal message", `<div class="push"><strong>${esc(b.portal.subject)}</strong>${b.portal.bodyHtml}</div>`),
            b.letter && sec("Posted letter (A4)", `<iframe title="Letter" sandbox srcdoc="${esc(b.letter.html)}" style="width:100%;height:720px;border:1px solid #bbb;background:#fff"></iframe>`),
            icsText && sec("Calendar invite (.ics)", `<pre>${esc(icsText)}</pre>`),
        ].filter(Boolean).join("\n");
        return `<article><h2>${esc(b.message.type)} <span class="mut">${esc(b.message.purpose)}</span> <span class="${p ? "bad" : "good"}">${p ? p + " problem(s)" : "checks pass"}</span></h2>${issues.length ? `<pre class="issues">${esc(issues.map((i) => `${i.severity} ${i.code} ${i.channel} ${i.where}: ${i.why}`).join("\n"))}</pre>` : ""}${parts}</article>`;
    }).join("\n");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:15px/1.5 Arial,sans-serif;max-width:900px;margin:0 auto;padding:16px;color:#111}h1{font-size:22px}article{border-top:3px solid #111;margin-top:28px;padding-top:8px}pre{white-space:pre-wrap;background:#f3f4f6;padding:10px;border-radius:6px;font:13px/1.4 monospace}.bubble{background:#e7f5e8;border-radius:12px;max-width:420px}.push{background:#f3f4f6;border-radius:12px;padding:10px 14px;max-width:420px}.mut{color:#555;font-weight:400;font-size:13px}.bad{color:#b00020}.good{color:#0a6b2d}.del{background:#fff4cc;border:2px solid #b45309;padding:8px 12px}.issues{border-left:4px solid #b00020}</style></head><body><h1>${esc(title)}</h1>${cards}</body></html>`;
}
