// A small QR code generator (byte mode, versions 1 to 10, error correction L/M/Q/H). No dependencies, runs in the browser and in Node.
// Written for this library after the standard (ISO/IEC 18004) and checked by decoding its output with OpenCV (example/decode_check.py).
// A web address of up to 213 characters fits at level M; longer text throws a plain-words error.

export type Ecc = "L" | "M" | "Q" | "H";
const ECC_INDEX: Record<Ecc, number> = { L: 0, M: 1, Q: 2, H: 3 };
const ECC_FORMAT_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };
// index = version (1..10); [ecc level][version]
const ECC_PER_BLOCK = [
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
];
const BLOCKS = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
];
const MAX_VERSION = 10;

function rawModules(ver: number): number {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const a = Math.floor(ver / 7) + 2; n -= (25 * a - 10) * a - 55; if (ver >= 7) n -= 36; }
  return n;
}
const dataCodewords = (ver: number, e: number) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[e][ver] * BLOCKS[e][ver];

// ---- Reed-Solomon over GF(256), polynomial 0x11D
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
function rsDivisor(degree: number): number[] {
  const r = new Array<number>(degree).fill(0); r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = gfMul(root, 0x02);
  }
  return r;
}
function rsRemainder(data: number[], divisor: number[]): number[] {
  const out = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (out.shift() as number); out.push(0);
    divisor.forEach((c, i) => { out[i] ^= gfMul(c, factor); });
  }
  return out;
}

function utf8(text: string): number[] { return Array.from(new TextEncoder().encode(text)); }

/** The code as rows of booleans (true = dark module), without the quiet zone. */
export function qrMatrix(text: string, ecc: Ecc = "M"): boolean[][] {
  if (typeof text !== "string" || text === "") throw new Error("Give the QR code some text, for example a web address.");
  const e = ECC_INDEX[ecc], bytes = utf8(text);
  let ver = 1;
  for (; ver <= MAX_VERSION; ver++) {
    const cap = dataCodewords(ver, e) * 8, ccBits = ver < 10 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 <= cap) break;
  }
  if (ver > MAX_VERSION) throw new Error("That text is too long for the QR code. Use a shorter web address.");

  // ---- data bits: byte mode, terminator, padding
  const bits: number[] = [];
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  const capBits = dataCodewords(ver, e) * 8;
  put(0, Math.min(4, capBits - bits.length)); put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // ---- blocks, error correction, interleave
  const nb = BLOCKS[e][ver], eccLen = ECC_PER_BLOCK[e][ver], raw = Math.floor(rawModules(ver) / 8);
  const shortLen = Math.floor(raw / nb) - eccLen, numShort = nb - (raw % nb), div = rsDivisor(eccLen);
  const blocks: number[][] = []; let k = 0;
  for (let i = 0; i < nb; i++) {
    const len = shortLen + (i < numShort ? 0 : 1), d = data.slice(k, k + len); k += len;
    const r = rsRemainder(d, div);
    if (i < numShort) d.push(0);                 // placeholder so every block has equal length; skipped below
    blocks.push(d.concat(r));
  }
  const all: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen || j >= numShort) all.push(b[i]); });

  // ---- the grid
  const size = ver * 4 + 17;
  const dark: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));   // function module (not data)
  const set = (x: number, y: number, v: boolean) => { dark[y][x] = v; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const align = ver === 1 ? [] : (() => {
    const n = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2, r = [6];
    for (let pos = size - 7; r.length < n; pos -= step) r.splice(1, 0, pos);
    return r;
  })();
  align.forEach((ax, i) => align.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const formatBits = (mask: number) => {
    const d = (ECC_FORMAT_BITS[ecc] << 3) | mask; let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((d << 10) | rem) ^ 0x5412;
  };
  const drawFormat = (mask: number) => {
    const b = formatBits(mask), bit = (i: number) => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const v = ((b >>> i) & 1) !== 0, a = size - 11 + (i % 3), c = Math.floor(i / 3);
      set(a, c, v); set(c, a, v);
    }
  }
  // ---- data modules in the zigzag order
  let idx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && idx < all.length * 8) { dark[y][x] = ((all[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0; idx++; }
    }
  }
  // ---- choose the mask with the lowest penalty
  const maskFn = [
    (x: number, y: number) => (x + y) % 2 === 0, (_x: number, y: number) => y % 2 === 0, (x: number) => x % 3 === 0, (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const apply = (mask: number) => dark.map((row, y) => row.map((v, x) => (fn[y][x] ? v : v !== maskFn[mask](x, y))));
  const penalty = (g: boolean[][]): number => {
    let p = 0;
    const line = (get: (i: number) => boolean) => {
      let run = 1, s = "";
      for (let i = 0; i < size; i++) { s += get(i) ? "1" : "0"; if (i > 0 && get(i) === get(i - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
      for (const pat of ["10111010000", "00001011101"]) { let at = s.indexOf(pat); while (at >= 0) { p += 40; at = s.indexOf(pat, at + 1); } }
    };
    for (let y = 0; y < size; y++) line((i) => g[y][i]);
    for (let x = 0; x < size; x++) line((i) => g[i][x]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) p += 3;
    const total = size * size, ones = g.reduce((a, r) => a + r.filter(Boolean).length, 0);
    p += Math.floor(Math.abs(ones * 20 - total * 10) / total) * 10;                  // balance of dark and light (rule 4)
    return p;
  };
  let best = 0, bestScore = Infinity, bestGrid = apply(0);
  for (let m = 0; m < 8; m++) { const g = apply(m); const sc = penalty(g); if (sc < bestScore) { bestScore = sc; best = m; bestGrid = g; } }
  drawFormat(best);
  // format modules were drawn into `dark` (function modules); copy them over the masked grid
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (fn[y][x]) bestGrid[y][x] = dark[y][x];
  return bestGrid;
}

export interface QrSvgOptions { ecc?: Ecc; /** Empty modules around the code. Default 4 (the standard's minimum). */ quiet?: number; dark?: string; light?: string; /** Accessible name. */ title?: string }

/** The code as one SVG string (a single path, scales to any size). */
export function qrSvg(text: string, o: QrSvgOptions = {}): string {
  const m = qrMatrix(text, o.ecc ?? "M"), q = o.quiet ?? 4, n = m.length + q * 2;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  let d = "";
  m.forEach((row, y) => { let x = 0; while (x < row.length) { if (!row[x]) { x++; continue; } let w = 1; while (x + w < row.length && row[x + w]) w++; d += `M${x + q} ${y + q}h${w}v1h${-w}z`; x += w; } });
  const title = o.title ? `<title>${esc(o.title)}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${esc(o.title ?? "QR code")}">${title}<rect width="${n}" height="${n}" fill="${o.light ?? "#ffffff"}"/><path d="${d}" fill="${o.dark ?? "#000000"}"/></svg>`;
}
