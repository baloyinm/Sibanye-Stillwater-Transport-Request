// POPIA retention: finished trips older than N days lose their addresses, purpose and reasons. Names stay out of this table already.
export const FINISHED = ['completed', 'rejected', 'cancelled'];
export const REMOVED = '[removed]';

export function dueForAnonymising(rides, days, now = Date.now()) {
  if (!Number.isFinite(days) || days < 30) throw new Error('RETENTION_DAYS must be a number of at least 30.');
  const cutoff = now - days * 86400000;
  return rides.filter((r) => FINISHED.includes(r.status) && r.pickup_address !== REMOVED
    && Date.parse(r.completed_at ?? r.cancelled_at ?? r.created_at) < cutoff);
}
