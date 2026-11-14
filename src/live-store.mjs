// LIVE data store over MariaDB. Same methods as src/demo-store.mjs. Only used when DATA_MODE=live.
// Tables: database/schema.mariadb.sql then database/002_request_workflow.sql.
import mariadb from 'mariadb';
import { randomUUID } from 'node:crypto';
import { distanceKm } from '../lib/geo_distance.mjs';

const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);
const sqlTime = (s) => (s ? new Date(s).toISOString().slice(0, 19).replace('T', ' ') : null);
const num = (x) => (typeof x === 'bigint' ? Number(x) : x);
const clean = (row) => { if (!row) return null; const o = {}; for (const [k, v] of Object.entries(row)) o[k] = v instanceof Date ? v.toISOString() : num(v); return o; };

const RIDE_SELECT = `SELECT r.*, TRIM(CONCAT(p.name,' ',COALESCE(p.surname,''))) AS requester,
  TRIM(CONCAT(d.name,' ',COALESCE(d.surname,''))) AS driver_name
  FROM rides r LEFT JOIN profiles p ON p.id = r.user_id LEFT JOIN drivers d ON d.id = r.driver_id`;

export function createLiveStore(cfg) {
  const pool = mariadb.createPool({ host: cfg.host, port: cfg.port, socketPath: cfg.socketPath, database: cfg.database, user: cfg.user, password: cfg.password, connectionLimit: 5, initSql: "SET time_zone = '+00:00'", bigIntAsNumber: true, insertIdAsNumber: true });
  const q = async (sql, args = []) => { const r = await pool.query(sql, args); return Array.isArray(r) ? r.map(clean) : r; };
  const one = async (sql, args) => (await q(sql, args))[0] ?? null;
  const fixRide = (r) => (r ? { ...r } : null);

  const store = {
    mode: 'live', pool,
    async close() { await pool.end(); },
    // sign-in adapter (data/php-session-auth-guard)
    async findUserByLogin(login) { return one('SELECT * FROM users WHERE email = ?', [login]); },
    async findUserById(id) { return one('SELECT * FROM users WHERE id = ?', [id]); },
    async updatePasswordHash(id, h) { await q('UPDATE users SET password_hash = ? WHERE id = ?', [h, id]); },
    async countAttempts(key, since) { return Number((await one('SELECT COUNT(*) AS n FROM auth_rate_limits WHERE rl_key = ? AND at_sec >= ?', [key, since])).n); },
    async recordAttempt(key, at) { await q('INSERT INTO auth_rate_limits (rl_key, at_sec) VALUES (?, ?)', [key, at]); },
    async clearAttempts(key) { await q('DELETE FROM auth_rate_limits WHERE rl_key = ?', [key]); },
    async purgeAttempts(before) { await q('DELETE FROM auth_rate_limits WHERE at_sec < ?', [before]); },
    // data
    async nameOf(id) {
      const r = await one(`SELECT TRIM(CONCAT(name,' ',COALESCE(surname,''))) AS n FROM profiles WHERE id = ? UNION ALL SELECT TRIM(CONCAT(name,' ',COALESCE(surname,''))) FROM drivers WHERE id = ?`, [id, id]);
      return r?.n ?? id;
    },
    async listPlaces() { return q('SELECT id AS `key`, name, latitude AS lat, longitude AS lng FROM places WHERE active = TRUE ORDER BY name'); },
    async listRides(user) {
      const where = user.user_type === 'user' ? 'WHERE r.user_id = ?' : user.user_type === 'driver' ? 'WHERE r.driver_id = ?' : '';
      return q(`${RIDE_SELECT} ${where} ORDER BY r.created_at DESC LIMIT 500`, where ? [user.id] : []);
    },
    async getRide(id) { return fixRide(await one(`${RIDE_SELECT} WHERE r.id = ?`, [id])); },
    async rideEvents(id) { return q(`SELECT e.id, e.ride_id, e.actor_id, e.type, e.note, e.at, COALESCE((SELECT TRIM(CONCAT(name,' ',COALESCE(surname,''))) FROM profiles WHERE id = e.actor_id), (SELECT TRIM(CONCAT(name,' ',COALESCE(surname,''))) FROM drivers WHERE id = e.actor_id), e.actor_id) AS actor FROM ride_events e WHERE e.ride_id = ? ORDER BY e.at, e.id`, [id]); },
    async createRide(user, v) {
      const id = randomUUID();
      const km = v.destination_latitude != null && v.destination_longitude != null ? distanceKm(v.pickup_latitude, v.pickup_longitude, v.destination_latitude, v.destination_longitude) : null;
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        await c.query(`INSERT INTO rides (id,user_id,pickup_latitude,pickup_longitude,pickup_address,destination_latitude,destination_longitude,destination_address,vehicle_type,status,distance_text,scheduled_at,passenger_count,purpose)
          VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,?,?)`, [id, user.id, v.pickup_latitude, v.pickup_longitude, v.pickup_address, v.destination_latitude, v.destination_longitude, v.destination_address, v.vehicle_type, km == null ? null : `${km} km (straight line)`, sqlTime(v.scheduled_at), v.passenger_count, v.purpose]);
        await c.query('INSERT INTO ride_events (ride_id, actor_id, type) VALUES (?,?,?)', [id, user.id, 'requested']);
        await c.commit();
      } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
      return store.getRide(id);
    },
    /** Moves a trip to its next status. Fails with code CONFLICT if someone else changed it first, or if the driver is no longer free. */
    async transition(ride, actor, action, to, extra = {}) {
      const c = await pool.getConnection();
      const conflict = (m) => Object.assign(new Error(m), { code: 'CONFLICT' });
      try {
        await c.beginTransaction();
        if (action === 'assign') {
          const [d] = await c.query('SELECT id, is_available FROM drivers WHERE id = ? FOR UPDATE', [extra.driver_id]);
          const [busy] = await c.query("SELECT COUNT(*) AS n FROM rides WHERE driver_id = ? AND status IN ('assigned','in_progress')", [extra.driver_id]);
          if (!d || !d.is_available || Number(busy.n) > 0) throw conflict('That driver is not free.');
        }
        const sets = ['status = ?']; const args = [to];
        if (action === 'approve') { sets.push('approved_by = ?', 'approved_at = UTC_TIMESTAMP()'); args.push(actor.id); }
        if (action === 'reject') { sets.push('rejection_reason = ?'); args.push(extra.reason); }
        if (action === 'assign') { sets.push('driver_id = ?', 'accepted_at = UTC_TIMESTAMP()'); args.push(extra.driver_id); }
        if (action === 'unassign') sets.push('driver_id = NULL');
        if (action === 'complete') sets.push('completed_at = UTC_TIMESTAMP()');
        if (action === 'cancel') sets.push('cancelled_at = UTC_TIMESTAMP()');
        const res = await c.query(`UPDATE rides SET ${sets.join(', ')} WHERE id = ? AND status = ?`, [...args, ride.id, ride.status]);
        if (Number(res.affectedRows) !== 1) throw conflict('This trip was changed by someone else.');
        const note = extra.reason ?? (extra.driver_id ? await store.nameOf(extra.driver_id) : null);
        await c.query('INSERT INTO ride_events (ride_id, actor_id, type, note) VALUES (?,?,?,?)', [ride.id, actor.id, action, note]);
        await c.commit();
      } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
      return store.getRide(ride.id);
    },
    async listDrivers() { return (await q('SELECT * FROM drivers ORDER BY name')).map((d) => ({ ...d, is_available: !!d.is_available })); },
    async getDriver(id) { const d = await one('SELECT * FROM drivers WHERE id = ?', [id]); return d ? { ...d, is_available: !!d.is_available } : null; },
    async setDriverLocation(id, lat, lng) { await q('UPDATE drivers SET current_latitude = ?, current_longitude = ?, location_at = UTC_TIMESTAMP() WHERE id = ?', [lat, lng, id]); },
    async setDriverAvailable(id, on) { await q('UPDATE drivers SET is_available = ? WHERE id = ?', [on ? 1 : 0, id]); },
    async driverBusy(id) { return Number((await one("SELECT COUNT(*) AS n FROM rides WHERE driver_id = ? AND status IN ('assigned','in_progress')", [id])).n) > 0; },
  };
  return store;
}
