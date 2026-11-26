import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, STATUSES, allowedActions, validateNewRide } from '../src/workflow.mjs';

const U = { id: 'u', user_type: 'user' }, A = { id: 'a', user_type: 'admin' }, D = { id: 'd', user_type: 'driver' }, D2 = { id: 'd2', user_type: 'driver' }, U2 = { id: 'u2', user_type: 'user' };
const ride = (status) => ({ status, user_id: 'u', driver_id: 'd' });

test('every transition lands on a known status and finished trips have no actions', () => {
  for (const a of Object.values(ACTIONS)) { assert.ok(STATUSES.includes(a.to)); a.from.forEach((s) => assert.ok(STATUSES.includes(s))); }
  for (const s of ['rejected', 'completed', 'cancelled']) for (const p of [U, A, D]) assert.deepEqual(allowedActions(p, ride(s)), []);
});
test('who may do what, per status', () => {
  assert.deepEqual(allowedActions(A, ride('pending')).sort(), ['approve', 'cancel', 'reject']);
  assert.deepEqual(allowedActions(U, ride('pending')), ['cancel']);
  assert.deepEqual(allowedActions(U2, ride('pending')), []);          // someone else's trip
  assert.deepEqual(allowedActions(A, ride('approved')).sort(), ['assign', 'cancel']);
  assert.deepEqual(allowedActions(D, ride('assigned')), ['start']);
  assert.deepEqual(allowedActions(D2, ride('assigned')), []);         // not the assigned driver
  assert.deepEqual(allowedActions(D, ride('in_progress')), ['complete']);
  assert.deepEqual(allowedActions(U, ride('in_progress')), []);       // cannot cancel a trip under way
});
test('new trip validation: dates in the past, bad coordinates, long text', () => {
  const ok = { pickup_address: 'A', pickup_latitude: -26, pickup_longitude: 27, destination_address: 'B', vehicle_type: 'Bakkie', passenger_count: 3 };
  assert.ok(validateNewRide(ok).value);
  assert.ok(validateNewRide({ ...ok, scheduled_at: '2000-01-01T00:00:00Z' }).errors.scheduled_at);
  assert.ok(validateNewRide({ ...ok, pickup_latitude: 95 }).errors.pickup_latitude);
  assert.ok(validateNewRide({ ...ok, purpose: 'x'.repeat(301) }).errors.purpose);
  assert.ok(validateNewRide({ ...ok, passenger_count: 1.5 }).errors.passenger_count);
});
