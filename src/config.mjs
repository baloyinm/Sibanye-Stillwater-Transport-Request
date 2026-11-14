// One switch decides where data comes from: DATA_MODE=demo (default, fake in-memory data) or live (real MariaDB, see MIGRATION.md).
export function loadConfig(env = process.env) {
  const mode = (env.DATA_MODE || 'demo').toLowerCase();
  if (!['demo', 'live'].includes(mode)) throw new Error('DATA_MODE must be "demo" or "live".');
  const cfg = { mode, port: Number(env.PORT || 3000), host: env.HOST || '127.0.0.1', allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').filter(Boolean) };
  if (mode === 'live') {
    for (const k of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
      if (!env[k]) throw new Error(`Live mode needs ${k} in the server environment. See MIGRATION.md.`);
    }
    throw new Error('Live mode needs the MariaDB data store (src/live-store.mjs), which is not written yet. See MIGRATION.md, step 4.');
  }
  return cfg;
}
