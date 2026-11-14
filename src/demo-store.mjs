// DEMO data store: in memory, fake people and places, lost on restart. Everything here is made up.
import { hashPassword } from '../lib/auth_guard.mjs';
import { distanceKm } from '../lib/geo_distance.mjs';

export const DEMO_PASSWORD = 'demo-password-001';   // made up; works only in demo mode
const SITES = { // fake pickup points near a made-up mine area; coordinates are rough and not real addresses
  gate: ['Demo Gate A', -26.5200, 27.6100], shaft: ['Demo Shaft 1', -26.5000, 27.6500], hostel: ['Demo Hostel', -26.5400, 27.5800], depot: ['Demo Rotables Depot', -26.5100, 27.6000],
};

export async function createDemoStore(now = () => new Date().toISOString()) {
  const hash = await hashPassword(DEMO_PASSWORD);
  const users = []; const profiles = []; const drivers = []; const rides = []; const events = [];
  let seq = 100;
  const nid = (p) => `${p}-${++seq}`;
  const addUser = (id, email, type, name, surname, extra = {}) => {
    users.push({ id, email, password_hash: hash, user_type: type, created_at: now() });
    if (type === 'driver') drivers.push({ id, name, surname, z_number: extra.z, mining_operation: 'Demo Operation', car_type: extra.car, registration_number: extra.reg, is_available: true, current_latitude: extra.lat, current_longitude: extra.lng, created_at: now() });
    else profiles.push({ id, name, surname, z_number: extra.z, mining_operation: 'Demo Operation', specific_site: 'Demo Site', role: type, created_at: now() });
  };
  addUser('u-1', 'requester1@example.test', 'user', 'Demo', 'Requester One', { z: 'Z000001' });
  addUser('u-2', 'requester2@example.test', 'user', 'Demo', 'Requester Two', { z: 'Z000002' });
  addUser('a-1', 'admin@example.test', 'admin', 'Demo', 'Controller', { z: 'Z000010' });
  addUser('d-1', 'driver1@example.test', 'driver', 'Demo', 'Driver One', { z: 'Z000021', car: 'Sedan', reg: 'DEMO 001 GP', lat: -26.5150, lng: 27.6050 });
  addUser('d-2', 'driver2@example.test', 'driver', 'Demo', 'Driver Two', { z: 'Z000022', car: 'Minibus', reg: 'DEMO 002 GP', lat: -26.5300, lng: 27.5900 });

  const event = (ride_id, actor_id, type, note = null) => events.push({ id: nid('e'), ride_id, actor_id, type, note, at: now() });
  const publicUser = (u) => ({ id: u.id, email: u.email, user_type: u.user_type, name: nameOf(u.id) });
  const nameOf = (id) => { const p = profiles.find((x) => x.id === id) || drivers.find((x) => x.id === id); return p ? `${p.name} ${p.surname ?? ''}`.trim() : id; };
  const dr = (id) => drivers.find((d) => d.id === id);

  const store = {
    mode: 'demo', demoPassword: DEMO_PASSWORD,
    // --- sign-in adapter (data/php-session-auth-guard) ---
    users,
    async findUserByLogin(login) { return users.find((u) => u.email === login) ?? null; },
    async findUserById(id) { return users.find((u) => u.id === id) ?? null; },
    async updatePasswordHash(id, h) { const u = users.find((x) => x.id === id); if (u) u.password_hash = h; },
    _attempts: [],
    async countAttempts(k, since) { return this._attempts.filter((a) => a.key === k && a.at >= since).length; },
    async recordAttempt(k, at) { this._attempts.push({ key: k, at }); },
    async clearAttempts(k) { this._attempts = this._attempts.filter((a) => a.key !== k); },
    async purgeAttempts(before) { this._attempts = this._attempts.filter((a) => a.at >= before); },
    // --- data ---
    async nameOf(id) { return nameOf(id); },
    demoAccounts() { return users.map((u) => ({ email: u.email, role: u.user_type, name: nameOf(u.id) })); },
    places: Object.entries(SITES).map(([k, [name, lat, lng]]) => ({ key: k, name, lat, lng })),
    async listRides(user) {
      let r = rides;
      if (user.user_type === 'user') r = r.filter((x) => x.user_id === user.id);
      else if (user.user_type === 'driver') r = r.filter((x) => x.driver_id === user.id);
      return r.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map((x) => ({ ...x, requester: nameOf(x.user_id), driver_name: x.driver_id ? nameOf(x.driver_id) : null }));
    },
    async getRide(id) { const x = rides.find((r) => r.id === id); return x ? { ...x, requester: nameOf(x.user_id), driver_name: x.driver_id ? nameOf(x.driver_id) : null } : null; },
    async rideEvents(id) { return events.filter((e) => e.ride_id === id).map((e) => ({ ...e, actor: nameOf(e.actor_id) })); },
    async createRide(user, v) {
      const id = nid('r');
      const km = v.destination_latitude != null && v.destination_longitude != null ? distanceKm(v.pickup_latitude, v.pickup_longitude, v.destination_latitude, v.destination_longitude) : null;
      const ride = { id, user_id: user.id, driver_id: null, ...v, status: 'pending', distance_text: km == null ? null : `${km} km (straight line)`, duration_text: null, scheduled_status: null, rejection_reason: null, approved_by: null, approved_at: null, created_at: now(), accepted_at: null, completed_at: null, cancelled_at: null };
      rides.push(ride); event(id, user.id, 'requested'); return ride;
    },
    async listPlaces() { return store.places; },
    async transition(ride, actor, action, to, extra = {}) {
      const r = rides.find((x) => x.id === ride.id); const stamp = now();
      r.status = to;
      if (action === 'approve') { r.approved_by = actor.id; r.approved_at = stamp; }
      if (action === 'reject') r.rejection_reason = extra.reason;
      if (action === 'assign') { r.driver_id = extra.driver_id; r.accepted_at = stamp; }
      if (action === 'unassign') r.driver_id = null;
      if (action === 'complete') r.completed_at = stamp;
      if (action === 'cancel') r.cancelled_at = stamp;
      event(r.id, actor.id, action, extra.reason ?? (extra.driver_id ? nameOf(extra.driver_id) : null));
      return { ...r, requester: nameOf(r.user_id), driver_name: r.driver_id ? nameOf(r.driver_id) : null };
    },
    async listDrivers() { return drivers.map((d) => ({ ...d })); },
    async getDriver(id) { const d = dr(id); return d ? { ...d } : null; },
    async setDriverLocation(id, lat, lng) { const d = dr(id); d.current_latitude = lat; d.current_longitude = lng; d.location_at = now(); },
    async setDriverAvailable(id, on) { dr(id).is_available = !!on; },
    async driverBusy(id) { return rides.some((r) => r.driver_id === id && ['assigned', 'in_progress'].includes(r.status)); },
    async seedSampleRides() {
      const a = await store.createRide(users[0], { pickup_address: SITES.gate[0], pickup_latitude: SITES.gate[1], pickup_longitude: SITES.gate[2], destination_address: SITES.shaft[0], destination_latitude: SITES.shaft[1], destination_longitude: SITES.shaft[2], purpose: 'Demo: team to shaft', vehicle_type: 'Minibus', passenger_count: 6, scheduled_at: null });
      const b = await store.createRide(users[1], { pickup_address: SITES.depot[0], pickup_latitude: SITES.depot[1], pickup_longitude: SITES.depot[2], destination_address: SITES.hostel[0], destination_latitude: SITES.hostel[1], destination_longitude: SITES.hostel[2], purpose: 'Demo: parts to hostel store', vehicle_type: 'Bakkie', passenger_count: 1, scheduled_at: null });
      await store.transition(b, users[2], 'approve', 'approved');
    },
    publicUser,
  };
  await store.seedSampleRides();
  return store;
}
