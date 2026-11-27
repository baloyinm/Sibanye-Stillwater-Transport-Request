import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoStore } from '../src/demo-store.mjs';
import { createApp } from '../src/app.mjs';
import { loadSettings } from '../src/settings.mjs';
import { loadOrg } from '../src/org.mjs';
import { createMessenger } from '../src/messaging.mjs';
import { templates, renderBundle, checkBundle } from '../lib/message-channels-kit/index.js';

const trip = { pickup_address: 'Demo Gate A', pickup_latitude: -26.52, pickup_longitude: 27.61, destination_address: 'Demo Shaft 1', destination_latitude: -26.5, destination_longitude: 27.65, vehicle_type: 'Sedan', passenger_count: 2, scheduled_at: new Date(Date.now() + 3600e3).toISOString() };
const setup = async (env, extra = {}) => {
  const store = await createDemoStore(); const settings = loadSettings({ NOTIFY: 'messages', DRIVER_ACCEPT: 'accept', ...extra });
  const messenger = createMessenger({ org: loadOrg({}), env });
  const app = createApp(store, { settings, messenger });
  const as = async (email) => { let cookie = ''; const call = async (method, path, body, query) => { const r = await app({ method, path, query, body, headers: { host: 'x.test', origin: 'http://x.test', cookie } }); if (r.setCookie) cookie = r.setCookie.split(';')[0]; return r; }; await call('POST', '/api/login', { email, password: 'demo-password-001' }); return call; };
  return { store, messenger, as };
};
const flow = async (as) => {
  const u = await as('requester1@example.test'), a = await as('admin@example.test');
  const id = (await u('POST', '/api/rides', trip)).body.ride.id;
  await a('POST', `/api/rides/${id}/approve`); await a('POST', `/api/rides/${id}/assign`, { driver_id: 'd-1' });
  return { u, a, id };
};

test('redirect mode (default): every message goes to the test inbox only, nothing to the real person', async () => {
  const { messenger, as } = await setup({ COMMS_REDIRECT_EMAIL: 'inbox@example.test', COMMS_REDIRECT_PHONE: '+27000000999' });
  const { a } = await flow(as);
  const e = messenger.outbox; assert.ok(e.length >= 3, 'requester email x2 and driver email + sms');
  assert.ok(e.every((x) => x.mode === 'redirect' && x.action === 'redirect' && x.redirectedTo.length === 1));
  assert.ok(e.some((x) => x.channel === 'sms'), 'driver has a phone, so an SMS is made');
  assert.ok(e.every((x) => !JSON.stringify(x).includes('requester1@example.test') || x.who.includes('requester1@example.test')));
  const log = await a('GET', '/api/outbox'); assert.equal(log.status, 200); assert.equal(log.body.enabled, true); assert.ok(log.body.entries.length >= 3);
  assert.ok(!JSON.stringify(log.body).includes('@example.test'), 'the log never shows addresses');
});
test('redirect with no test inbox set: blocked, never falls through to the real address', async () => {
  const { messenger, as } = await setup({}); await flow(as);
  assert.ok(messenger.outbox.length > 0); assert.ok(messenger.outbox.every((x) => x.action === 'block' && x.outcome === 'blocked'));
});
test('mode off blocks; live is refused outside production; allowlist redirects the rest', async () => {
  const off = await setup({ COMMS_MODE: 'off' }); await flow(off.as); assert.ok(off.messenger.outbox.every((x) => x.action === 'block'));
  assert.throws(() => createMessenger({ org: loadOrg({}), env: { COMMS_MODE: 'live' } }), /live mode refused/);
  const al = await setup({ COMMS_MODE: 'allowlist', COMMS_ALLOWLIST_EMAIL: '@nobody.test', COMMS_REDIRECT_EMAIL: 'inbox@example.test' }); await flow(al.as);
  assert.ok(al.messenger.outbox.filter((x) => x.channel === 'email').every((x) => x.action === 'redirect'));
});
test('NOTIFY=inapp sends nothing outside the app; /api/outbox says disabled', async () => {
  const store = await createDemoStore(); const app = createApp(store, { settings: loadSettings({ NOTIFY: 'inapp' }) });
  let cookie = ''; const call = async (m, p, b) => { const r = await app({ method: m, path: p, body: b, headers: { host: 'x.test', origin: 'http://x.test', cookie } }); if (r.setCookie) cookie = r.setCookie.split(';')[0]; return r; };
  await call('POST', '/api/login', { email: 'admin@example.test', password: 'demo-password-001' });
  const r = await call('GET', '/api/outbox'); assert.equal(r.body.enabled, false); assert.equal(r.body.entries.length, 0);
});
test('kit checkers pass for the trip message in every channel used (no PROBLEM lines)', () => {
  const org = loadOrg({}); const msg = templates.notification(org, { recipient: { name: 'Demo Requester', email: 'requester1@example.test', phone: '+27000000021' }, sender: { name: 'Transport Hub', designation: 'Transport controller' }, date: '2026-11-27', reference: 'r-101' },
    { title: 'Transport trip update', text: 'Your trip from Demo Gate A to Demo Shaft 1 was approved.', action: { label: 'Open the trip', url: 'https://transport.example.invalid/' }, subject: 'Transport trip update', short: 'Your trip was approved.' });
  const problems = checkBundle(org, renderBundle(org, msg, ['email', 'sms', 'push', 'inapp'])).filter((i) => i.severity === 'PROBLEM');
  assert.deepEqual(problems, []);
});
