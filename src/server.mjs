import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { createDemoStore } from './demo-store.mjs';
import { createApp } from './app.mjs';

const PUB = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" };

export function buildServer(app) {
  return createServer(async (rq, rs) => {
    try {
      const url = new URL(rq.url, 'http://x');
      if (url.pathname.startsWith('/api/')) {
        let raw = ''; let size = 0;
        for await (const c of rq) { size += c.length; if (size > 100000) { rs.writeHead(413, SEC).end(); return; } raw += c; }
        let body = {}; if (raw) { try { body = JSON.parse(raw); } catch { rs.writeHead(400, { ...SEC, 'Content-Type': 'application/json' }).end('{"error":"Bad request body."}'); return; } }
        const out = await app({ method: rq.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: rq.headers, body, https: rq.headers['x-forwarded-proto'] === 'https', ip: rq.socket.remoteAddress });
        rs.writeHead(out.status, { ...SEC, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(out.setCookie ? { 'Set-Cookie': out.setCookie } : {}) });
        rs.end(JSON.stringify(out.body)); return;
      }
      const rel = url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
      const file = join(PUB, rel); if (!file.startsWith(PUB)) { rs.writeHead(403).end(); return; }
      const data = await readFile(file);
      rs.writeHead(200, { ...SEC, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', ...(rel === 'sw.js' ? { 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' } : {}) }).end(data);
    } catch (e) { rs.writeHead(e.code === 'ENOENT' ? 404 : 500, SEC).end(e.code === 'ENOENT' ? 'Not found' : 'Server error'); }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  let store;
  if (cfg.mode === 'live') { const { createLiveStore } = await import('./live-store.mjs'); store = createLiveStore(cfg.db); await store.listPlaces(); } // fails fast if the database cannot be reached
  else store = await createDemoStore();
  buildServer(createApp(store, cfg)).listen(cfg.port, cfg.host, () => console.log(`Transport Hub (${cfg.mode.toUpperCase()} DATA) on http://${cfg.host}:${cfg.port}`));
}
