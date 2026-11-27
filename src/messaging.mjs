// Messages to people (NOTIFY=messages). One message is written once with email/message-channels-kit, checked, and handed to a
// sender wrapped in the integrations/email-sms-messaging delivery mode. COMMS_MODE decides where it goes: off, redirect (the
// default: only to the test inbox / number), allowlist, live (refused outside production). No real provider is connected here:
// the base sender only records. Nothing reaches a real person until the owner says yes and a provider is wired in.
import { templates, renderBundle, assertMessageOk } from '../lib/message-channels-kit/index.js';
import { MemoryOutbox, guardEmailSender, guardSmsSender, assertCommsConfig, startupLine } from '../lib/email-sms-messaging/delivery-mode.js';

const recorder = (name) => ({ name, async send() { return { status: 'sent', providerId: `${name}-not-connected` }; } });

export function createMessenger({ org, env = process.env, appUrl = env.APP_URL || 'https://transport.example.invalid', now = () => new Date(), emailProvider, smsProvider }) {
  assertCommsConfig(env, ['email', 'sms']);
  const outbox = new MemoryOutbox();
  const opts = { env, outbox: outbox.log, now };
  const email = guardEmailSender(emailProvider ?? recorder('email-recorder'), opts);
  const sms = guardSmsSender(smsProvider ?? recorder('sms-recorder'), opts);
  const sender = { name: org.messaging?.fromName ?? org.shortName, designation: 'Transport controller' };
  return {
    outbox: outbox.entries, startupLine: () => startupLine(env, ['email', 'sms']),
    /** contact: { name, email?, phone? }. Returns what happened per channel. Never throws for a failed send. */
    async send(contact, { title, text, reference }) {
      const msg = templates.notification(org, { recipient: { name: contact.name, email: contact.email, phone: contact.phone }, sender, date: now().toISOString().slice(0, 10), reference },
        { title, text, action: { label: 'Open the trip', url: `${appUrl}/#/trip/${reference ?? ''}`.replace(/\/#\/trip\/$/, '/') }, subject: title, short: `${title}. ${text}`.slice(0, 120) });
      const channels = [contact.email ? 'email' : null, contact.phone ? 'sms' : null].filter(Boolean);
      if (!channels.length) return [];
      const bundle = renderBundle(org, msg, channels);
      assertMessageOk(org, bundle);
      const out = [];
      if (bundle.email) out.push(['email', await email.send({ to: contact.email, subject: bundle.email.subject, html: bundle.email.html, text: bundle.email.text, replyTo: bundle.email.replyTo, headers: bundle.email.headers })]);
      if (bundle.sms) out.push(['sms', await sms.send({ to: contact.phone, text: bundle.sms.text })]);
      return out.map(([channel, r]) => ({ channel, status: r.status, error: r.error }));
    },
  };
}
