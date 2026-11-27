// The built user guide (PDF and DOCX files of the documentation pack) served to signed-in users. Files are read from GUIDE_DIR
// (default docs/guides/published); only plain file names with a known extension are served, never a path.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DIR = fileURLToPath(new URL('../docs/guides/published/', import.meta.url));
const TYPES = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const ext = (n) => { const i = n.lastIndexOf('.'); return i < 0 ? '' : n.slice(i).toLowerCase(); };

export function listGuide(dir = DEFAULT_DIR) {
  let names = []; try { names = readdirSync(dir); } catch { return []; }
  return names.filter((n) => TYPES[ext(n)] && /^\w[\w.-]*$/.test(n)).sort().map((n) => ({ name: n, kind: ext(n).slice(1).toUpperCase(), kb: Math.round(statSync(join(dir, n)).size / 1024) }));
}
export function guideFile(dir = DEFAULT_DIR, name = '') {
  if (!/^\w[\w.-]*$/.test(name) || name.includes('..') || !TYPES[ext(name)] || !listGuide(dir).some((f) => f.name === name)) return null;
  return { name, type: TYPES[ext(name)], data: readFileSync(join(dir, name)) };
}
