import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createDemoStore, DEMO_PASSWORD } from '../src/demo-store.mjs';
import { createApp } from '../src/app.mjs';
import { loadSettings } from '../src/settings.mjs';
import { loadConfig } from '../src/config.mjs';
import { roadRoute } from '../lib/routing.mjs';

const setup = async (env = {}, fetchFn) => {
  const store = await createDemoStore(); const app = createApp(store, { settings: loadSettings(env) }, fetchFn);
  const as = async (email) => { let cookie = ''; const call = async (method, path, body, query, headers = {}) => { const r = await app({ method, path, query, body, headers: { host: 'x.test', origin: 'http://x.test', cookie, ...headers } }); if (r.setCookie) cookie = r.setCookie.split(';')[0]; return r; }; await call('POST', '/api/login', { email, password: DEMO_PASSWORD }); return call; };
  return { store, app, as };
};
const trip = { pickup_address: 'Demo Gate A', pickup_latitude: -26.52, pickup_longitude: 27.61, destination_address: 'Demo Shaft 1', destination_latitude: -26.5, destination_longitude: 27.65, vehicle_type: 'Sedan', passenger_count: 2 };

test('defaults are the simple choices and bad values are refused', () => {
  const s = loadSettings({}); assert.equal(s.approvalChain, 'single'); assert.equal(s.driverAccept, 'auto'); assert.equal(s.notify, 'off'); assert.equal(s.retentionDays, 730);
  assert.throws(() => loadSettings({ APPROVAL_CHAIN: 'three' }), /APPROVAL_CHAIN/);
  assert.throws(() => loadSettings({ ROUTING: 'road' }), /ROUTING_URL/);
  assert.throws(() => loadSettings({ TRACKING: 'tracker', TRACKER_TOKEN: 'short' }), /TRACKER_TOKEN/);
  assert.throws(() => loadSettings({ RETENTION_DAYS: '5' }), /at least 30/);
  assert.equal(loadConfig({}).settings.placesMode, 'list');
});
test('Q1 two-step approval: supervisor endorses, then controller approves; controller cannot skip', async () => {
  const { as } = await setup({ APPROVAL_CHAIN: 'two' });
  const u = await as('requester1@example.test'), s = await as('supervisor@example.test'), a = await as('admin@example.test');
  const id = (await u('POST', '/api/rides', trip)).body.ride.id;
  assert.equal((await a('POST', `/api/rides/${id}/approve`)).status, 409);          // not endorsed yet
  assert.equal((await s('POST', `/api/rides/${id}/approve`)).status, 409);
  assert.equal((await u('POST', `/api/rides/${id}/endorse`)).status, 403);
  assert.equal((await s('POST', `/api/rides/${id}/endorse`)).body.ride.status, 'endorsed');
  assert.equal((await s('POST', `/api/rides/${id}/approve`)).status, 403);          // supervisor cannot give the final yes
  assert.equal((await a('POST', `/api/rides/${id}/approve`)).body.ride.status, 'approved');
});
test('Q1 default: controller approves directly and supervisor has no step', async () => {
  const { as } = await setup(); const u = await as('requester1@example.test'), s = await as('supervisor@example.test'), a = await as('admin@example.test');
  const id = (await u('POST', '/api/rides', trip)).body.ride.id;
  assert.equal((await s('POST', `/api/rides/${id}/endorse`)).status, 404);
  assert.deepEqual((await s('GET', `/api/rides/${id}`)).body.ride.actions, []);
  assert.equal((await a('POST', `/api/rides/${id}/approve`)).body.ride.status, 'approved');
});
test('Q2 free places and Q3 cost centre and vehicle types', async () => {
  const { as } = await setup({ PLACES_MODE: 'free', COST_CENTRE: 'required', VEHICLE_TYPES: 'Sedan,Van' });
  const u = await as('requester1@example.test');
  const free = { pickup_address: '12 Any Street', destination_address: 'Somewhere else', vehicle_type: 'Van', passenger_count: 1 };
  const bad = await u('POST', '/api/rides', free); assert.equal(bad.status, 422); assert.ok(bad.body.errors.cost_centre);
  const ok = await u('POST', '/api/rides', { ...free, cost_centre: 'CC-100/A' }); assert.equal(ok.status, 201); assert.equal(ok.body.ride.cost_centre, 'CC-100/A'); assert.equal(ok.body.ride.distance_text, null);
  assert.ok((await u('POST', '/api/rides', { ...free, cost_centre: 'CC-1', vehicle_type: 'Truck' })).body.errors.vehicle_type);
  assert.ok((await u('POST', '/api/rides', { ...free, cost_centre: '<script>' })).body.errors.cost_centre);
});
test('Q4 driver must accept: offer, decline frees the trip, accept then start', async () => {
  const { as } = await setup({ DRIVER_ACCEPT: 'accept' });
  const u = await as('requester1@example.test'), a = await as('admin@example.test'), d = await as('driver1@example.test');
  const id = (await u('POST', '/api/rides', trip)).body.ride.id; await a('POST', `/api/rides/${id}/approve`);
  assert.equal((await a('POST', `/api/rides/${id}/assign`, { driver_id: 'd-1' })).body.ride.status, 'offered');
  assert.equal((await d('POST', `/api/rides/${id}/start`)).status, 409);             // must accept first
  const dd = (await a('GET', '/api/drivers', null, { ride: id })).body.drivers.find((x) => x.id === 'd-1'); assert.equal(dd.busy, true);   // an offer holds the driver
  assert.equal((await d('POST', `/api/rides/${id}/decline`)).body.ride.status, 'approved');
  assert.equal((await a('POST', `/api/rides/${id}/assign`, { driver_id: 'd-1' })).body.ride.status, 'offered');
  assert.equal((await d('POST', `/api/rides/${id}/accept`)).body.ride.status, 'assigned');
  assert.equal((await d('POST', `/api/rides/${id}/start`)).body.ride.status, 'in_progress');
});
test('Q5 in-app messages only when switched on, and only to the people concerned', async () => {
  const off = await setup(); const uo = await off.as('requester1@example.test'); await uo('POST', '/api/rides', trip); assert.deepEqual((await uo('GET', '/api/notices')).body.notices, []);
  const { as } = await setup({ NOTIFY: 'inapp' }); const u = await as('requester1@example.test'), u2 = await as('requester2@example.test'), a = await as('admin@example.test');
  const id = (await u('POST', '/api/rides', trip)).body.ride.id; await a('POST', `/api/rides/${id}/reject`, { reason: 'No car' });
  const n = (await u('GET', '/api/notices')).body.notices; assert.ok(n.some((x) => /rejected: No car/.test(x.text)));
  assert.equal((await u2('GET', '/api/notices')).body.notices.length, 0);
  await u('POST', '/api/notices/read'); assert.ok((await u('GET', '/api/notices')).body.notices.every((x) => x.read_at));
});
test('Q6 road distance from a routing service, with a fallback when it is down', async () => {
  const srv = createServer((rq, rs) => { rs.setHeader('content-type', 'application/json'); rs.end(JSON.stringify(rq.url.includes('route/v1/driving/27.61,-26.52;27.65,-26.5') ? { routes: [{ distance: 6200, duration: 540 }] } : {})); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.deepEqual(await roadRoute(url, { lat: -26.52, lng: 27.61 }, { lat: -26.5, lng: 27.65 }), { km: 6.2, minutes: 9 });
    const { as } = await setup({ ROUTING: 'road', ROUTING_URL: url }); const u = await as('requester1@example.test');
    const r = (await u('POST', '/api/rides', trip)).body.ride; assert.equal(r.distance_text, '6.2 km (by road)'); assert.equal(r.duration_text, '9 min');
  } finally { srv.close(); }
  const { as } = await setup({ ROUTING: 'road', ROUTING_URL: 'http://127.0.0.1:1' }); const u = await as('requester1@example.test');
  assert.match((await u('POST', '/api/rides', trip)).body.ride.distance_text, /straight line/);
});
test('Q7 vehicle trackers post positions with a token; refused otherwise', async () => {
  const token = 'tracker-token-for-tests-001';
  const { app, as, store } = await setup({ TRACKING: 'tracker', TRACKER_TOKEN: token });
  const post = (headers, body) => app({ method: 'POST', path: '/api/tracker/position', headers: { host: 'x.test', ...headers }, body });
  assert.equal((await post({}, { registration_number: 'DEMO 001 GP', latitude: -26.5, longitude: 27.6 })).status, 401);
  assert.equal((await post({ 'x-tracker-token': 'wrong-token-wrong-token' }, {})).status, 401);
  assert.equal((await post({ 'x-tracker-token': token }, { registration_number: 'NOPE', latitude: -26.5, longitude: 27.6 })).status, 404);
  assert.equal((await post({ 'x-tracker-token': token }, { registration_number: 'DEMO 001 GP', latitude: 999, longitude: 27.6 })).status, 422);
  assert.equal((await post({ 'x-tracker-token': token }, { registration_number: 'DEMO 001 GP', latitude: -26.5, longitude: 27.6 })).status, 200);
  assert.equal((await store.getDriver('d-1')).current_latitude, -26.5);
  const phone = await setup(); assert.equal((await phone.app({ method: 'POST', path: '/api/tracker/position', headers: { host: 'x.test', 'x-tracker-token': token }, body: {} })).status, 404);
});
test('Q9 parts requests only when switched on, need a list of items', async () => {
  const off = await setup(); const uo = await off.as('requester1@example.test'); assert.ok((await uo('POST', '/api/rides', { ...trip, kind: 'parts', items: 'Pump' })).body.errors.kind);
  const { as } = await setup({ ROTABLES: 'on' }); const u = await as('requester1@example.test');
  assert.ok((await u('POST', '/api/rides', { ...trip, kind: 'parts', items: '' })).body.errors.items);
  const r = await u('POST', '/api/rides', { ...trip, kind: 'parts', vehicle_type: 'Bakkie', items: 'Pump housing\nSeal kit' }); assert.equal(r.status, 201); assert.equal(r.body.ride.kind, 'parts'); assert.equal(r.body.ride.passenger_count, 0);
});
