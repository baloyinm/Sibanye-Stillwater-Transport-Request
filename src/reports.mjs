// Pure report rules: summary counts and a safe CSV. No database here.
import { STATUSES, LABELS } from './workflow.mjs';

/** Trips created between from and to (ISO strings, both optional). */
export function inRange(rides, from, to) {
  const f = from ? Date.parse(from) : -Infinity; const t = to ? Date.parse(to) : Infinity;
  return rides.filter((r) => { const c = Date.parse(r.created_at); return c >= f && c <= t; });
}

export function summarise(rides) {
  const by_status = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const by_vehicle = {}; let passengers = 0; let km = 0; let decided = 0; let waitMs = 0;
  for (const r of rides) {
    by_status[r.status] = (by_status[r.status] ?? 0) + 1;
    by_vehicle[r.vehicle_type] = (by_vehicle[r.vehicle_type] ?? 0) + 1;
    if (r.status === 'completed') { passengers += Number(r.passenger_count) || 0; km += parseFloat(r.distance_text) || 0; }
    if (r.approved_at) { decided++; waitMs += Date.parse(r.approved_at) - Date.parse(r.created_at); }
  }
  return { total: rides.length, by_status, by_vehicle, completed_passengers: passengers, completed_km_straight_line: Math.round(km * 10) / 10,
    avg_minutes_to_approve: decided ? Math.round(waitMs / decided / 60000) : null };
}

/** Stop spreadsheet programs from running text that starts with = + - @ as a formula. */
export function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(rides) {
  const cols = ['id', 'created_at', 'status', 'requester', 'pickup_address', 'destination_address', 'vehicle_type', 'passenger_count', 'driver_name', 'distance_text', 'purpose'];
  const head = ['Trip', 'Requested', 'Status', 'Requester', 'From', 'To', 'Vehicle type', 'Passengers', 'Driver', 'Distance', 'Purpose'];
  return [head.join(','), ...rides.map((r) => cols.map((c) => csvCell(c === 'status' ? LABELS[r.status] : r[c])).join(','))].join('\r\n') + '\r\n';
}
