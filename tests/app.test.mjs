import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoStore, DEMO_PASSWORD } from '../src/demo-store.mjs';
import { createApp } from '../src/app.mjs';
import { loadConfig } from '../src/config.mjs';
import { checkPeople, parseCsv, buildSql } from '../scripts/import.mjs';
import { readFileSync } from 'node:fs';

async function setup() {
  const store = await createDemoStore(); const app = createApp(store);
  const H = { host: 'x.test', origin: 'http://x.test' };
  const as = async (email, password = DEMO_PASSWORD) => {
    let cookie = ''; const call = async (method, path, body, query) => {
      const r = await app({ method, path, query, body, headers: { ...H, cookie } }); if (r.setCookie) cookie = r.setCookie.split(';')[0]; return r;
    };
    const r = await call('POST', '/api/login', { email, password }); return { call, login: r };
  };
  return { store, as };
}
const trip = { pickup_address: 'Demo Gate A', pickup_latitude: -26.52, pickup_longitude: 27.61, destination_address: 'Demo Shaft 1', destination_latitude: -26.5, destination_longitude: 27.65, vehicle_type: 'Sedan', passenger_count: 2 };

test('sign-in: wrong password refused, no data without a session', async () => {
  const { as } = await setup();
  assert.equal((await as('admin@example.test', 'nope')).login.status, 401);
  const { call } = await as('nobody@example.test'); assert.equal((await call('GET', '/api/rides')).status, 401);
});
test('whole flow: request, approve, assign, start, track, complete', async () => {
  const { as } = await setup();
  const u = await as('requester1@example.test'), a = await as('admin@example.test'), d = await as('driver1@example.test');
  const made = await u.call('POST', '/api/rides', trip); assert.equal(made.status, 201); const id = made.body.ride.id;
  assert.equal(made.body.ride.status, 'pending'); assert.match(made.body.ride.distance_text, /km/);
  assert.equal((await u.call('POST', `/api/rides/${id}/approve`)).status, 403);          // requester cannot approve
  assert.equal((await a.call('POST', `/api/rides/${id}/assign`, { driver_id: 'd-1' })).status, 409); // not approved yet
  assert.equal((await a.call('POST', `/api/rides/${id}/approve`)).body.ride.status, 'approved');
  const list = await a.call('GET', '/api/drivers', null, { ride: id }); assert.equal(list.body.drivers[0].id, 'd-1'); // nearest first
  assert.equal((await a.call('POST', `/api/rides/${id}/assign`, { driver_id: 'd-1' })).body.ride.status, 'assigned');
  assert.equal((await d.call('POST', `/api/driver/location`, { latitude: -26.519, longitude: 27.609 })).status, 200);
  const t = await u.call('GET', `/api/rides/${id}`); assert.ok(t.body.track.km_to_pickup < 1);
  assert.equal((await as('driver2@example.test').then((x) => x.call('POST', `/api/rides/${id}/start`))).status, 404); // other driver cannot see it
  assert.equal((await d.call('POST', `/api/rides/${id}/start`)).body.ride.status, 'in_progress');
  assert.equal((await d.call('POST', `/api/rides/${id}/complete`)).body.ride.status, 'completed');
  const ev = (await u.call('GET', `/api/rides/${id}`)).body.events.map((e) => e.type);
  assert.deepEqual(ev, ['requested', 'approve', 'assign', 'start', 'complete']);
  assert.equal((await u.call('POST', `/api/rides/${id}/cancel`)).status, 409);          // finished trips are final
});
test('reject needs a reason; busy driver cannot be double-booked', async () => {
  const { as } = await setup();
  const u = await as('requester1@example.test'), a = await as('admin@example.test');
  const r1 = (await u.call('POST', '/api/rides', trip)).body.ride.id, r2 = (await u.call('POST', '/api/rides', trip)).body.ride.id;
  assert.equal((await a.call('POST', `/api/rides/${r1}/reject`, {})).status, 422);
  const rj = await a.call('POST', `/api/rides/${r1}/reject`, { reason: 'No vehicle' }); assert.equal(rj.body.ride.rejection_reason, 'No vehicle');
  await a.call('POST', `/api/rides/${r2}/approve`); await a.call('POST', `/api/rides/${r2}/assign`, { driver_id: 'd-1' });
  const r3 = (await u.call('POST', '/api/rides', trip)).body.ride.id; await a.call('POST', `/api/rides/${r3}/approve`);
  assert.equal((await a.call('POST', `/api/rides/${r3}/assign`, { driver_id: 'd-1' })).status, 409);
});
test('people only see their own trips; validation messages say what to do', async () => {
  const { as } = await setup();
  const u1 = await as('requester1@example.test'), u2 = await as('requester2@example.test');
  const id = (await u1.call('POST', '/api/rides', trip)).body.ride.id;
  assert.equal((await u2.call('GET', `/api/rides/${id}`)).status, 404);
  assert.ok((await u2.call('GET', '/api/rides')).body.rides.every((r) => r.requester.includes('Two')));
  const bad = await u1.call('POST', '/api/rides', { ...trip, vehicle_type: 'Rocket', passenger_count: 0 }); assert.equal(bad.status, 422); assert.ok(bad.body.errors.vehicle_type && bad.body.errors.passenger_count);
  assert.equal((await u1.call('GET', '/api/drivers')).status, 403);
});
test('cross-site writes are refused', async () => {
  const { store } = await setup(); const app = createApp(store);
  const r = await app({ method: 'POST', path: '/api/login', body: {}, headers: { host: 'x.test', origin: 'http://evil.test' } }); assert.equal(r.status, 403);
});
test('config: live mode refuses to start until real data is wired', () => {
  assert.equal(loadConfig({}).mode, 'demo');
  assert.throws(() => loadConfig({ DATA_MODE: 'live' }), /DB_HOST/);
  assert.throws(() => loadConfig({ DATA_MODE: 'nonsense' }), /demo/);
});
test('import: template passes, bad rows are named, SQL has hashes not passwords', async () => {
  const ok = checkPeople(parseCsv(readFileSync(new URL('../templates/people.csv', import.meta.url), 'utf8'))); assert.deepEqual(ok.problems, []);
  const bad = checkPeople(parseCsv('email,user_type,name,surname,z_number,mining_operation,specific_site,car_type,registration_number\nnotanemail,boss,,,Z1,,,,\n')); assert.equal(bad.problems.length, 3);
  const { sql, temps } = await buildSql(ok.people); assert.match(sql, /scrypt\$/); const pw = temps.split('\n')[1].split(',')[1]; assert.ok(!sql.includes(pw));
});
