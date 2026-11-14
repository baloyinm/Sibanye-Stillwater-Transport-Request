// One switch decides where data comes from: DATA_MODE=demo (default, fake in-memory data) or live (real MariaDB, see MIGRATION.md).
export function loadConfig(env = process.env) {
  const mode = (env.DATA_MODE || 'demo').toLowerCase();
  if (!['demo', 'live'].includes(mode)) throw new Error('DATA_MODE must be "demo" or "live".');
  const cfg = { mode, port: Number(env.PORT || 3000), host: env.HOST || '127.0.0.1', allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').filter(Boolean) };
  if (mode === 'live') {
    for (const k of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
      if (!env[k]) throw new Error(`Live mode needs ${k} in the server environment. See MIGRATION.md.`);
    }
    cfg.db = { host: env.DB_HOST, port: Number(env.DB_PORT || 3306), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD };
  }
  return cfg;
}
