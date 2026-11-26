// Usage: RETENTION_DAYS=730 node scripts/retention.mjs [--apply]   (DATA_MODE=live needs DB_* in the environment)
// Dry run by default: lists how many trips are due and changes nothing.
import { loadConfig } from '../src/config.mjs';
import { dueForAnonymising } from '../src/retention.mjs';
const cfg = loadConfig(); const days = Number(process.env.RETENTION_DAYS);
if (cfg.mode !== 'live') { console.log('DATA_MODE is demo: nothing to do.'); process.exit(0); }
const { createLiveStore } = await import('../src/live-store.mjs');
const store = createLiveStore(cfg.db);
try {
  const due = dueForAnonymising(await store.listRides({ user_type: 'admin' }), days);
  console.log(`${due.length} finished trip(s) older than ${days} days.`);
  if (process.argv.includes('--apply') && due.length) console.log(`Anonymised ${await store.anonymiseRides(due.map((r) => r.id))}.`);
  else console.log('Dry run. Add --apply to anonymise.');
} finally { await store.close(); }
