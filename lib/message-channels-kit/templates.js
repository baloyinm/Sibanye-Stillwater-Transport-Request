import { longDate, orgShort } from "./util.js";
const first = (r) => (r.name ? r.name.split(/\s+/)[0] : "");
const hi = (r) => `Hello${first(r) ? " " + first(r) : ""},`;
const why = (c, d) => c.reason ?? d;
/** The general service message. 1.1.0 adds optional `subject`, `preheader`, `rows` (a key-value block), `blocks` (any further blocks, placed before the button), `short` (the one sentence for SMS, push and in-app) and `personalInfo`; without them it behaves as before. */
export const notification = (o, c, d) => ({
    type: "notification", purpose: "transactional", reference: c.reference, subject: d.subject ?? d.title, preheader: d.preheader ?? d.text.slice(0, 100), title: d.title, greeting: hi(c.recipient),
    blocks: [{ kind: "paragraph", text: d.text }, ...(d.rows?.length ? [{ kind: "kv", rows: d.rows }] : []), ...(d.blocks ?? []), ...(d.action ? [{ kind: "button", ...d.action }] : [])], short: d.short ?? d.text, action: d.action, sender: c.sender, recipient: c.recipient, date: c.date,
    personalInfo: d.personalInfo, reason: why(c, `You are receiving this because of your account with ${orgShort(o)}.`),
});
export const taskAssigned = (o, c, d) => ({
    type: "task_assigned", purpose: "transactional", reference: c.reference,
    subject: `Action needed by ${longDate(d.due)}: ${d.task}`, preheader: `${d.assignedBy} assigned this to you. Due ${longDate(d.due)}.`, title: "A task is waiting for you", greeting: hi(c.recipient),
    blocks: [{ kind: "paragraph", text: `${d.assignedBy} has assigned a task to you.` },
        { kind: "kv", rows: [["Task", d.task], ["Due", longDate(d.due)], ...(d.priority ? [["Priority", d.priority]] : []), ...(c.reference ? [["Reference", c.reference]] : [])] },
        ...(d.details ? [{ kind: "paragraph", text: d.details }] : []), { kind: "button", label: "Open the task", url: d.url }],
    short: `Task for you: ${d.task}. Due ${longDate(d.due)}.`, action: { label: "Open the task", url: d.url }, due: d.due, sender: c.sender, recipient: c.recipient, date: c.date,
    reason: why(c, `You are receiving this because a task was assigned to you in ${orgShort(o)}.`),
});
export const reminder = (o, c, d) => {
    const od = (d.overdueDays ?? 0) > 0;
    return {
        type: "reminder", purpose: "transactional", reference: c.reference,
        subject: od ? `Overdue by ${d.overdueDays} days: ${d.what}` : `Reminder: ${d.what} is due ${longDate(d.due)}`,
        preheader: od ? `This was due on ${longDate(d.due)}. Please act today.` : `Due on ${longDate(d.due)}. A short reminder.`, title: od ? "This is now overdue" : "A friendly reminder", greeting: hi(c.recipient),
        blocks: [{ kind: "paragraph", text: od ? `${d.what} was due on ${longDate(d.due)} and is now ${d.overdueDays} days overdue.` : `${d.what} is due on ${longDate(d.due)}.` },
            ...(od ? [{ kind: "callout", tone: "warn", title: "Please act today", text: "If you have already dealt with this, please reply and tell us so that we can update our records." }] : []),
            { kind: "button", label: d.actionLabel ?? "View the details", url: d.url }],
        short: od ? `Overdue: ${d.what}, due ${longDate(d.due)}.` : `Reminder: ${d.what} is due ${longDate(d.due)}.`, action: { label: d.actionLabel ?? "View the details", url: d.url }, due: d.due,
        sender: c.sender, recipient: c.recipient, date: c.date, reason: why(c, `You are receiving this reminder because of your account with ${orgShort(o)}.`),
    };
};
export const approvalRequest = (o, c, d) => ({
    type: "approval_request", purpose: "transactional", reference: c.reference, subject: `Approval needed: ${d.what}`, preheader: `${d.requestedBy} is waiting for your decision${d.due ? ` by ${longDate(d.due)}` : ""}.`,
    title: "Your approval is needed", greeting: hi(c.recipient),
    blocks: [{ kind: "paragraph", text: `${d.requestedBy} asks you to approve ${d.what}.` }, { kind: "kv", rows: d.summary },
        { kind: "button", label: "Approve", url: d.approveUrl, note: "Check the details first." }, { kind: "button", label: "Send back with a comment", url: d.sendBackUrl, style: "secondary" }],
    short: `Approval needed: ${d.what}.`, action: { label: "Approve", url: d.approveUrl }, due: d.due, sender: c.sender, recipient: c.recipient, date: c.date,
    reason: why(c, `You are receiving this because you are the approver for this item in ${orgShort(o)}.`),
});
export const documentAttached = (o, c, d) => ({
    type: "document_attached", purpose: "transactional", reference: c.reference ?? d.number, subject: `${d.docType}${d.number ? " " + d.number : ""} from ${orgShort(o)}`,
    preheader: `Your ${d.docType.toLowerCase()} is attached as a PDF.`, title: `Your ${d.docType.toLowerCase()} is attached`, greeting: hi(c.recipient),
    blocks: [{ kind: "paragraph", text: `Please find your ${d.docType.toLowerCase()} attached to this email.` }, { kind: "kv", rows: d.summary },
        { kind: "attachments", items: [{ name: d.attachment.name, description: `${d.docType}${d.number ? " " + d.number : ""} (PDF)`, sizeKb: d.attachment.sizeKb }] },
        ...(d.url ? [{ kind: "button", label: `View the ${d.docType.toLowerCase()} online`, url: d.url }] : []),
        { kind: "callout", tone: "info", title: "Check before you pay", text: `We never change our banking details by email. If you get a message that says we have, phone us on ${o.contacts.tel} first.` }],
    short: `Your ${d.docType.toLowerCase()}${d.number ? " " + d.number : ""} is ready.`, action: d.url ? { label: `View the ${d.docType.toLowerCase()}`, url: d.url } : undefined,
    sender: c.sender, recipient: c.recipient, date: c.date, personalInfo: d.docType === "Payslip", reason: why(c, `You are receiving this because ${orgShort(o)} issued you ${/^[aeiou]/i.test(d.docType) ? "an" : "a"} ${d.docType.toLowerCase()}.`),
});
export const receipt = (o, c, d) => ({
    type: "receipt", purpose: "transactional", reference: d.reference, subject: `Payment received: ${d.reference}`, preheader: `We received ${d.amount} on ${longDate(d.paidOn)}. Thank you.`, title: "Thank you, we have your payment", greeting: hi(c.recipient),
    blocks: [{ kind: "paragraph", text: `We have received your payment for ${d.forWhat}.` }, { kind: "kv", rows: [["Amount", d.amount], ["Date", longDate(d.paidOn)], ["Method", d.method], ["Reference", d.reference]] },
        ...(d.url ? [{ kind: "button", label: "View your receipt", url: d.url }] : [])],
    short: `Payment of ${d.amount} received. Reference ${d.reference}. Thank you.`, action: d.url ? { label: "View your receipt", url: d.url } : undefined, sender: c.sender, recipient: c.recipient, date: c.date,
    reason: why(c, `You are receiving this because you made a payment to ${orgShort(o)}.`),
});
export const securityCode = (o, c, d) => ({
    type: "security_code", purpose: "security", subject: d.resetUrl ? "Reset your password" : "Your verification code", preheader: "Use this once. Do not share it with anyone.", title: d.resetUrl ? "Reset your password" : "Your verification code", greeting: hi(c.recipient),
    blocks: [{ kind: "paragraph", text: d.resetUrl ? "We received a request to reset your password. Use the button below. The link works once." : "Use this code to finish signing in." },
        ...(d.resetUrl ? [{ kind: "button", label: "Choose a new password", url: d.resetUrl }] : [{ kind: "code", value: d.code, expiresMinutes: d.expiresMinutes }]),
        { kind: "callout", tone: "warn", title: "Not you", text: `If you did not ask for this, ignore this message and tell us on ${o.contacts.email}. Your account is still safe.` }],
    short: "We sent you a verification code. If this was not you, contact us.", action: d.resetUrl ? { label: "Choose a new password", url: d.resetUrl } : undefined, code: d.resetUrl ? undefined : { value: d.code, expiresMinutes: d.expiresMinutes },
    sender: c.sender, recipient: c.recipient, date: c.date, reason: why(c, `You are receiving this because a security action was started on your ${orgShort(o)} account.`),
});
export const welcome = (o, c, d) => ({
    type: "welcome", purpose: "transactional", subject: `Welcome to ${orgShort(o)}`, preheader: "Your account is ready. Here is how to get started.", title: `Welcome to ${orgShort(o)}`, greeting: hi(c.recipient),
    blocks: [{ kind: "paragraph", text: "Your account is ready. Here is how to get started:" }, { kind: "list", items: d.steps, ordered: true }, { kind: "button", label: "Open your account", url: d.url },
        { kind: "paragraph", text: `Questions? Reply to this email or call ${o.contacts.tel}.` }],
    short: `Welcome to ${orgShort(o)}. Your account is ready.`, action: { label: "Open your account", url: d.url }, sender: c.sender, recipient: c.recipient, date: c.date, reason: why(c, `You are receiving this because an account was created for you at ${orgShort(o)}.`),
});
export const appointment = (o, c, d) => ({
    type: "appointment", purpose: "transactional", reference: c.reference, subject: `${d.cancelled ? "Cancelled" : "Confirmed"}: ${d.what} on ${longDate(d.event.start)}`, preheader: d.cancelled ? "This appointment has been cancelled." : `See you on ${longDate(d.event.start)} at ${d.event.start.slice(11, 16)}.`,
    title: d.cancelled ? "Your appointment is cancelled" : "Your appointment is confirmed", greeting: hi(c.recipient),
    blocks: [{ kind: "kv", rows: [["What", d.what], ["Date", longDate(d.event.start)], ["Time", `${d.event.start.slice(11, 16)}${d.event.end ? " to " + d.event.end.slice(11, 16) : ""} (SAST)`], ...(d.event.location ? [["Where", d.event.location]] : [])] },
        { kind: "paragraph", text: d.cancelled ? "The calendar entry attached to this email removes it from your calendar." : "A calendar invitation is attached to this email. Open it to add the appointment to your calendar." },
        ...(d.cancelled ? [] : [{ kind: "button", label: "Change or cancel", url: d.changeUrl, style: "secondary" }])],
    short: `${d.cancelled ? "Cancelled" : "Confirmed"}: ${d.what}, ${longDate(d.event.start)} at ${d.event.start.slice(11, 16)}.`, action: d.cancelled ? undefined : { label: "Change or cancel", url: d.changeUrl },
    event: { ...d.event, status: d.cancelled ? "CANCELLED" : "CONFIRMED" }, sender: c.sender, recipient: c.recipient, date: c.date, reason: why(c, `You are receiving this because an appointment was booked with ${orgShort(o)}.`),
});
export const statusUpdate = (o, c, d) => ({
    type: "status_update", purpose: "transactional", reference: c.reference, subject: `Update on ${d.what}: ${d.to}`, preheader: `Status changed from ${d.from} to ${d.to}.`, title: `${d.what}: ${d.to}`, greeting: hi(c.recipient),
    blocks: [{ kind: "kv", rows: [["Item", d.what], ["Was", d.from], ["Now", d.to], ["What happens next", d.next]] }, { kind: "button", label: "See the full history", url: d.url }],
    short: `${d.what} is now ${d.to}. Next: ${d.next}`, action: { label: "See the full history", url: d.url }, sender: c.sender, recipient: c.recipient, date: c.date, reason: why(c, `You are receiving this because you follow this item in ${orgShort(o)}.`),
});
export const newsletter = (o, c, d) => ({
    type: "newsletter", purpose: "marketing", subject: d.headline, preheader: d.intro.slice(0, 100), title: d.headline, greeting: hi(c.recipient),
    blocks: [{ kind: "paragraph", text: d.intro }, ...d.items.flatMap((i) => [{ kind: "heading", text: i.title }, { kind: "paragraph", text: i.text }]), { kind: "button", label: "Read more", url: d.url }],
    short: d.intro.slice(0, 100), action: { label: "Read more", url: d.url }, sender: c.sender, recipient: c.recipient, date: c.date,
    unsubscribe: { url: d.unsubscribeUrl, mailto: d.mailto }, reason: d.why,
});
