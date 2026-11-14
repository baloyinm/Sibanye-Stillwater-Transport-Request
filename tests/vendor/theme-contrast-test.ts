// WCAG contrast checks over the real CSS custom properties of a project, light and dark.
// Parses a stylesheet's rules, resolves var() chains and color-mix(in srgb, ...), and reports every
// foreground/background pair that falls below its minimum ratio. Editing a colour in the CSS is therefore tested.
// No dependencies; use it inside vitest/jest (see example/).

export type Rgb = [number, number, number];

const NAMED: Record<string, Rgb> = { white: [255, 255, 255], black: [0, 0, 0] };

/** The text between the braces of the first rule whose selector text starts with `selector`, searching from `from`. */
export function ruleBody(css: string, selector: string, from = 0): string {
  const start = css.indexOf(selector, from);
  if (start < 0) throw new Error(`rule not found: ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed rule: ${selector}`);
}

/** `--name: value;` declarations in a rule body. */
export function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const parseHex = (hex: string): Rgb => {
  const raw = hex.slice(1);
  const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb: Rgb): string => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Splits on commas that are not inside brackets. */
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

/** Returns a function from a token name (`--x`) or colour expression to a #rrggbb hex, resolving against `vars`. */
export function makeResolver(vars: Record<string, string>): (nameOrExpr: string) => string {
  const colour = (expr: string, seen: string[] = []): Rgb => {
    const e = expr.trim();
    if (e.startsWith("#")) return parseHex(e);
    if (NAMED[e]) return NAMED[e];
    const v = e.match(/^var\((--[\w-]+)\)$/);
    if (v) {
      const name = v[1];
      if (seen.includes(name)) throw new Error(`cycle at ${name}`);
      const raw = vars[name];
      if (raw === undefined) throw new Error(`undefined token ${name}`);
      return colour(raw, [...seen, name]);
    }
    const mix = e.match(/^color-mix\(in srgb,([\s\S]*)\)$/);
    if (mix) {
      const [a, b] = splitTop(mix[1]).map((part) => {
        const m = part.match(/^([\s\S]*?)(?:\s+(\d+(?:\.\d+)?)%)?$/)!;
        return { rgb: colour(m[1], seen), pct: m[2] === undefined ? undefined : Number(m[2]) };
      });
      const pa = a.pct ?? (b.pct === undefined ? 50 : 100 - b.pct);
      const pb = b.pct ?? 100 - pa;
      return [0, 1, 2].map((i) => (a.rgb[i] * pa + b.rgb[i] * pb) / (pa + pb)) as Rgb;
    }
    throw new Error(`cannot resolve: ${expr}`);
  };
  return (name) => toHex(colour(name.startsWith("--") ? `var(${name})` : name));
}

const lum = (hex: string): number => {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two #rrggbb colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export interface Pair {
  name: string;
  /** A token (`--color-text`), a colour expression, or `white` / `black`. */
  fg: string;
  bg: string;
  /** Minimum ratio. 4.5 for text (default), 3 for large text and interface parts. */
  min?: number;
}

/** Pairs below their minimum, as readable lines. Empty means everything passes. */
export function failingPairs(get: (n: string) => string, pairs: readonly Pair[]): string[] {
  return pairs.flatMap((p) => {
    const min = p.min ?? 4.5;
    const ratio = contrastRatio(get(p.fg), get(p.bg));
    return ratio >= min ? [] : [`${p.name}: ${ratio.toFixed(2)} (needs ${min})`];
  });
}

/** Text pairs (4.5:1) of every text token on every background token: a handy starting set. */
export function textOnBackgrounds(texts: readonly string[], backgrounds: readonly string[]): Pair[] {
  return backgrounds.flatMap((bg) => texts.map((fg) => ({ name: `${fg} on ${bg}`, fg, bg })));
}
