// document-style-kit 1.13.0: charts as data. One ChartSpec (line, bar, timeline) is laid out once into drawing primitives (points, y down);
// the PDF renderer draws them as vector graphics (real text, no picture) and the HTML renderer as inline SVG. The numbers are also printed by the caller
// in a table next to the chart (the builders do this), and `alt` carries the description for screen readers.
import type { Org } from "./types.ts";
import { formatMoney } from "./format.ts";
let moneyPrefix = "R";   // 1.13.3: the organisation's own money style (space after R or not), set by layoutChart

export type Tone = "ink" | "primary" | "accent" | "muted" | "ok" | "danger" | "warn";
export interface ChartSeries { name: string; /** Line: [x, y] pairs (x = day number from 1970-01-01 for a date axis). Bar: one value per category. */ values?: number[]; points?: [number, number][]; tone?: Tone; dashed?: boolean;
  /** Line (1.14.0): "none" draws the line without a dot on every point, for a calculated curve (a prediction) where the points are not readings. Default "all" keeps the dots (up to 40 points). */ marks?: "all" | "none" }
export interface ChartMarker { x: number; label: string; tone?: Tone }
export interface ChartThreshold { y: number; label: string; tone?: Tone }
export interface ChartSpan { lane: number; from: number; to: number; label?: string; tone?: Tone }
export interface ChartEvent { lane: number; x: number; label?: string; tone?: Tone; shape?: "circle" | "square" | "diamond" | "triangle" }
export interface ChartData {
  type: "line" | "bar" | "timeline";
  title: string;
  /** What the chart shows, in words, for screen readers and for anyone who cannot see colour. */
  alt: string;
  caption: string;
  heightMm?: number;
  xAxis?: { title?: string; kind?: "date" | "number"; min?: number; max?: number };
  yAxis?: { title?: string; unit?: string; min?: number; max?: number; format?: "int" | "pct" | "money" | "number" };
  series?: ChartSeries[];
  /** Bar charts: the category labels, one per value. */
  categories?: string[];
  /** Bar charts: stack the series on top of each other (default is side by side). */
  stacked?: boolean;
  /** Line charts: a shaded band between low and high (for example the 80% window of a prediction), one [x, low, high] per point. */
  band?: { name: string; points: [number, number, number][]; tone?: Tone };
  markers?: ChartMarker[];
  thresholds?: ChartThreshold[];
  /** Timeline: one row per lane. */
  lanes?: string[]; spans?: ChartSpan[]; events?: ChartEvent[];
  /** Printed under the plot when there is nothing to draw. */
  emptyText?: string;
}

export type Prim =
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; w: number; c: string; dash?: number[] }
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; opacity?: number }
  | { t: "poly"; pts: [number, number][]; w: number; c: string; dash?: number[] }
  | { t: "area"; pts: [number, number][]; fill: string; opacity: number }
  | { t: "mark"; shape: "circle" | "square" | "diamond" | "triangle"; x: number; y: number; r: number; fill: string; stroke?: string }
  | { t: "text"; x: number; y: number; s: string; size: number; anchor: "start" | "middle" | "end"; c: string; bold?: boolean };
export type Measure = (s: string, size: number, bold?: boolean) => number;

export const DAY_MS = 86_400_000;
export const dayNo = (iso: string): number => Math.floor(Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso) / DAY_MS);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ymd = (d: number) => { const t = new Date(d * DAY_MS); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }; };
const dayLabel = (d: number, span: number) => { const t = ymd(d); return span > 60 ? `${MONTHS[t.m]} ${t.y}` : `${t.d} ${MONTHS[t.m]}`; };

/** Round tick values (1, 2, 5 times a power of ten) from min to max. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / target, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  const out: number[] = []; for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}
/** Tick days for a date axis: month starts, every 2, 3, 6 or 12 months, so labels never touch. */
export function dateTicks(from: number, to: number, maxTicks = 7): number[] {
  const months = [1, 2, 3, 6, 12, 24, 60];
  for (const step of months) {
    const out: number[] = []; const a = ymd(from);
    let y = a.y, m = a.m - (a.m % step) ; if (m < 0) m = 0;
    for (let i = 0; i < 400; i++) { const d = Math.floor(Date.UTC(y, m, 1) / DAY_MS); if (d > to) break; if (d >= from) out.push(d); m += step; while (m >= 12) { m -= 12; y++; } }
    if (out.length <= maxTicks) return out;
  }
  return [from, to];
}
const fmtNum = (v: number, f: NonNullable<ChartData["yAxis"]>["format"] = "number", unit = ""): string => {
  const r = f === "pct" ? `${Math.round(v * 100)}%` : f === "int" ? String(Math.round(v)) : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-ZA").replace(/[  ]/g, " ") : String(Math.round(v * 10) / 10);
  return f === "money" ? (Math.round(v) === 0 ? "0" : `${moneyPrefix}${Math.round(v).toLocaleString("en-ZA").replace(/[  ]/g, " ")}`) : unit && f !== "pct" ? `${r} ${unit}` : r;
};
export const formatChartValue = fmtNum;

export function toneColour(tone: Tone | undefined, org: Pick<Org, "colours">, i = 0): string {
  const c = org.colours; const order: Tone[] = ["primary", "accent", "muted", "ok", "danger"];
  const t = tone ?? order[i % order.length];
  return t === "ink" ? c.ink : t === "primary" ? c.primary : t === "accent" ? c.accent : t === "muted" ? c.muted : t === "ok" ? c.ok : t === "danger" ? c.danger : "#B7791F";
}
/** 1.14.0: ink on a light fill (amber), white on a dark one, so a label inside a segment keeps 4.5:1. Unknown colour strings (CSS variables) keep white. */
function onColour(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return "#FFFFFF";
  const [r, g, b] = [0, 2, 4].map((i) => { const v = parseInt(m[1]!.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#1A1A1A" : "#FFFFFF";
}
const SHAPES = ["circle", "square", "diamond", "triangle"] as const;
const DASHES: (number[] | undefined)[] = [undefined, [5, 3], [1.5, 2.5], [8, 3, 2, 3]];

/** Lay one chart out in a box `width` x `height` points. Returns primitives (y down, origin top left of the box). */
export function layoutChart(d: ChartData, org: Pick<Org, "colours"> & Partial<Pick<Org, "locale">>, width: number, height: number, measure: Measure): Prim[] {
  moneyPrefix = org.locale ? (/^\D*/.exec(formatMoney(0, org.locale))?.[0] ?? "R").replace(/\u00a0/g, " ") : "R";
  const out: Prim[] = []; const ink = org.colours.ink, muted = org.colours.muted, rule = org.colours.rule;
  const txt = (x: number, y: number, s: string, size: number, anchor: "start" | "middle" | "end" = "start", c = muted, bold = false) => out.push({ t: "text", x, y, s, size, anchor, c, bold });
  txt(0, 10, d.title, 10.5, "start", ink, true);
  const series = d.series ?? [];
  const legendNames = d.type === "timeline" ? [] : [...series.map((s, i) => ({ n: s.name, c: toneColour(s.tone, org, i), i })), ...(d.band ? [{ n: d.band.name, c: toneColour(d.band.tone ?? "primary", org), i: -1 }] : [])];
  // legend row (always when two or more series)
  let top = 20;
  if (legendNames.length >= 2) { let lx = 0; for (const l of legendNames) { const w = measure(l.n, 8.5) + 22; if (lx + w > width) break; out.push(l.i < 0 ? { t: "rect", x: lx, y: top - 7, w: 10, h: 7, fill: l.c, opacity: 0.25 } : { t: "rect", x: lx, y: top - 7, w: 10, h: 7, fill: l.c }); txt(lx + 14, top, l.n, 8.5, "start", ink); lx += w; } top += 10; }
  const yTitle = d.yAxis?.title ? (txt(0, top + 6, d.yAxis.title + (d.yAxis.unit && d.yAxis.format !== "pct" && d.yAxis.format !== "money" ? ` (${d.yAxis.unit})` : ""), 8, "start", muted), 10) : 0;
  top += yTitle + 4;
  const bottom = height - (d.xAxis?.title ? 26 : 16);
  const labelW = d.type === "timeline" ? Math.min(width * 0.28, Math.max(...(d.lanes ?? [""]).map((l) => measure(l, 8.5)), 30) + 8) : 0;
  const empty = (d.type === "line" && !series.some((s) => s.points?.length)) || (d.type === "bar" && !(d.categories?.length)) || (d.type === "timeline" && !(d.lanes?.length));
  if (empty) { txt(0, top + 24, d.emptyText ?? "Nothing recorded yet.", 9, "start", muted); return out; }

  // ---- y scale (line, bar)
  let ymin = d.yAxis?.min ?? 0, ymax = d.yAxis?.max;
  if (d.type === "line") {
    const ys = [...series.flatMap((s) => (s.points ?? []).map((p) => p[1])), ...(d.band?.points.flatMap((p) => [p[1], p[2]]) ?? []), ...(d.thresholds ?? []).map((t) => t.y)];
    if (ymax === undefined) ymax = Math.max(...ys, ymin + 1); if (d.yAxis?.min === undefined && Math.min(...ys) < ymin) ymin = Math.min(...ys);
  } else if (d.type === "bar") {
    const n = d.categories!.length; const totals = Array.from({ length: n }, (_, i) => d.stacked ? series.reduce((a, s) => a + (s.values?.[i] ?? 0), 0) : Math.max(0, ...series.map((s) => s.values?.[i] ?? 0)));
    if (ymax === undefined) ymax = Math.max(...totals, ...(d.thresholds ?? []).map((t) => t.y), 1);
  }
  const yt = d.type === "timeline" ? [] : (d.yAxis?.format === "int" ? niceTicks(ymin, ymax!, 4).filter((v) => Number.isInteger(v)) : niceTicks(ymin, ymax!, 4));   // 1.13.2: a count axis only shows whole numbers if (yt.length && ymax !== undefined && d.yAxis?.max === undefined) ymax = Math.max(ymax, yt[yt.length - 1]);
  const yLab = (v: number) => fmtNum(v, d.yAxis?.format, d.yAxis?.format === "money" ? "" : d.yAxis?.unit && yt.length > 0 ? "" : "");
  const left = d.type === "timeline" ? labelW : Math.max(...yt.map((v) => measure(yLab(v), 8)), 12) + 8;
  const right = d.type === "line" ? Math.min(70, Math.max(...series.map((s) => measure(s.name, 8)), 0) + 6) * (series.length >= 2 && series.length <= 4 ? 1 : 0) : 6;
  const x0 = left, x1 = width - right - 4, y0 = bottom, y1 = top;     // plot box (y0 is the bottom)
  const sy = (v: number) => y0 - ((v - ymin) / ((ymax ?? 1) - ymin || 1)) * (y0 - y1);

  // ---- x scale
  let xmin = 0, xmax = 1; const isDate = d.xAxis?.kind !== "number";
  if (d.type === "line" || d.type === "timeline") {
    const xs = [...series.flatMap((s) => (s.points ?? []).map((p) => p[0])), ...(d.band?.points.map((p) => p[0]) ?? []), ...(d.markers ?? []).map((m) => m.x), ...(d.spans ?? []).flatMap((s) => [s.from, s.to]), ...(d.events ?? []).map((e) => e.x)];
    xmin = d.xAxis?.min ?? Math.min(...xs); xmax = d.xAxis?.max ?? Math.max(...xs); if (isDate && xmax - xmin < 14) { const mid = (xmin + xmax) / 2; xmin = mid - 7; xmax = mid + 7; }   // 1.13.1: readings all on one day get a two week axis so they can be seen
    if (xmax <= xmin) { xmax = xmin + 1; }
    if (d.type === "line" && !isDate && d.xAxis?.min === undefined) xmin = Math.min(xmin, 0);
  }
  const sx = (v: number) => x0 + ((v - xmin) / (xmax - xmin)) * (x1 - x0);

  // ---- grid and axis labels
  for (const v of yt) { const y = sy(v); out.push({ t: "line", x1: x0, y1: y, x2: x1, y2: y, w: 0.4, c: rule }); txt(x0 - 4, y + 3, yLab(v), 8, "end"); }
  if (d.type !== "timeline") out.push({ t: "line", x1: x0, y1: y0, x2: x1, y2: y0, w: 0.8, c: muted });
  if (d.type === "line" || d.type === "timeline") {
    const ticks = isDate ? dateTicks(xmin, xmax, Math.max(3, Math.floor((x1 - x0) / 52))) : niceTicks(xmin, xmax, Math.max(3, Math.floor((x1 - x0) / 60)));
    for (const v of ticks) { const x = sx(v); out.push({ t: "line", x1: x, y1: y0, x2: x, y2: y0 + 3, w: 0.6, c: muted }); if (d.type === "timeline") out.push({ t: "line", x1: x, y1: y1, x2: x, y2: y0, w: 0.3, c: rule }); txt(x, y0 + 12, isDate ? dayLabel(v, xmax - xmin) : fmtNum(v, "number"), 8, "middle"); }
  }
  if (d.xAxis?.title) txt((x0 + x1) / 2, height - 3, d.xAxis.title, 8, "middle", muted);

  if (d.type === "bar") {
    const n = d.categories!.length, slot = (x1 - x0) / n, labelStep = Math.max(1, Math.ceil((Math.max(...d.categories!.map((c) => measure(c, 8)), 1) + 4) / slot)), k = d.stacked ? 1 : Math.max(1, series.length), bw = Math.min(34, (slot * 0.7) / k);
    d.categories!.forEach((cat, i) => {
      const cx = x0 + slot * (i + 0.5); let acc = 0;
      series.forEach((s, si) => {
        const v = s.values?.[i] ?? 0; const colour = toneColour(s.tone, org, si);
        const bx = d.stacked ? cx - bw / 2 : cx - (bw * k) / 2 + si * bw;
        const from = d.stacked ? acc : 0; if (d.stacked) acc += v;
        if (v > 0) { out.push({ t: "rect", x: bx, y: sy(from + v), w: bw - (d.stacked ? 0 : 1.5), h: Math.max(0.8, sy(from) - sy(from + v) - (d.stacked ? 0.8 : 0)), fill: colour });
          if (!d.stacked && n * k <= 14) txt(bx + (bw - 1.5) / 2, sy(v) - 3, fmtNum(v, d.yAxis?.format), 8, "middle", ink);
          else if (d.stacked && sy(from) - sy(from + v) >= 11) out.push({ t: "text", x: bx + bw / 2, y: sy(from + v / 2) + 3, s: fmtNum(v, d.yAxis?.format), size: 8, anchor: "middle", c: onColour(colour), bold: true }); }
      });
      if (d.stacked && acc > 0) txt(cx, sy(acc) - 3, fmtNum(acc, d.yAxis?.format), 8, "middle", ink, true);
      if (i % labelStep === 0 || i === n - 1 && (n - 1) % labelStep >= labelStep / 2) txt(cx, y0 + 12, cat, 8, "middle");
    });
  }
  if (d.type === "line") {
    if (d.band?.points.length) { const up = d.band.points.map((p) => [sx(p[0]), sy(p[2])] as [number, number]), dn = d.band.points.map((p) => [sx(p[0]), sy(p[1])] as [number, number]).reverse(); out.push({ t: "area", pts: [...up, ...dn], fill: toneColour(d.band.tone ?? "primary", org), opacity: 0.18 }); }
    series.forEach((s, si) => {
      const pts = (s.points ?? []).map((p) => [sx(p[0]), sy(p[1])] as [number, number]); if (!pts.length) return;
      const c = toneColour(s.tone, org, si);
      if (pts.length > 1) out.push({ t: "poly", pts, w: 1.8, c, dash: s.dashed ? [5, 3] : DASHES[0] });
      if (pts.length <= 40 && s.marks !== "none") pts.forEach((p) => out.push({ t: "mark", shape: SHAPES[si % 4], x: p[0], y: p[1], r: 2.6, fill: c, stroke: "#FFFFFF" }));
      if (series.length >= 2 && series.length <= 4) { const l = pts[pts.length - 1]; txt(Math.min(l[0] + 6, width - 2), l[1] + 3, s.name, 8, "start", ink); }
    });
  }
  // reference lines
  for (const t of d.thresholds ?? []) { const y = sy(t.y); const c = toneColour(t.tone ?? "danger", org); out.push({ t: "line", x1: x0, y1: y, x2: x1, y2: y, w: 1, c, dash: [4, 3] }); txt(x1 - 2, y - 3, t.label, 8, "end", ink); }
  if (d.type !== "bar") (d.markers ?? []).forEach((m, i) => { const x = sx(m.x); if (x < x0 - 0.5 || x > x1 + 0.5) return; const c = toneColour(m.tone ?? "ink", org); out.push({ t: "line", x1: x, y1: y1, x2: x, y2: y0, w: 1.1, c, dash: [3, 2] }); const right = x > (x0 + x1) / 2; txt(right ? x - 3 : x + 3, y1 + 8 + i * 9, m.label, 8, right ? "end" : "start", ink, true); });
  if (d.type === "timeline") {
    const lanes = d.lanes!, rh = Math.min(26, (y0 - y1) / lanes.length);
    const ly = (i: number) => y1 + rh * (i + 0.5);
    lanes.forEach((l, i) => { out.push({ t: "line", x1: 0, y1: y1 + rh * (i + 1), x2: x1, y2: y1 + rh * (i + 1), w: 0.3, c: rule }); txt(labelW - 6, ly(i) + 3, l.length * 4.4 > labelW ? `${l.slice(0, Math.floor(labelW / 4.4) - 1)}…` : l, 8.5, "end", ink); });
    for (const s of d.spans ?? []) { const c = toneColour(s.tone, org); const xa = sx(Math.max(s.from, xmin)), xb = Math.max(sx(Math.min(s.to, xmax)), xa + 2); out.push({ t: "rect", x: xa, y: ly(s.lane) - 6, w: xb - xa, h: 12, fill: c, opacity: 0.85 }); if (s.label && measure(s.label, 7.5) + 4 < xb - xa) out.push({ t: "text", x: xa + 3, y: ly(s.lane) + 2.5, s: s.label, size: 7.5, anchor: "start", c: "#FFFFFF", bold: true }); }
    for (const e of d.events ?? []) { const c = toneColour(e.tone, org); out.push({ t: "mark", shape: e.shape ?? "diamond", x: sx(e.x), y: ly(e.lane), r: 4, fill: c, stroke: "#FFFFFF" }); }
  }
  return out;
}

/** The chart as inline SVG (HTML output). Same layout as the PDF. */
export function chartSvg(d: ChartData, org: Pick<Org, "colours">, widthPt = 480): string {
  const h = Math.round((d.heightMm ?? 62) * 2.8346), measure: Measure = (s, size, b) => s.length * size * (b ? 0.55 : 0.5);
  const prims = layoutChart(d, org, widthPt, h, measure); const e = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const body = prims.map((p) => {
    switch (p.t) {
      case "line": return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${p.c}" stroke-width="${p.w}"${p.dash ? ` stroke-dasharray="${p.dash.join(" ")}"` : ""}/>`;
      case "rect": return `<rect x="${p.x}" y="${p.y}" width="${Math.max(0, p.w)}" height="${Math.max(0, p.h)}" fill="${p.fill ?? "none"}"${p.stroke ? ` stroke="${p.stroke}"` : ""}${p.opacity !== undefined ? ` fill-opacity="${p.opacity}"` : ""}/>`;
      case "poly": return `<polyline points="${p.pts.map((q) => q.join(",")).join(" ")}" fill="none" stroke="${p.c}" stroke-width="${p.w}"${p.dash ? ` stroke-dasharray="${p.dash.join(" ")}"` : ""}/>`;
      case "area": return `<polygon points="${p.pts.map((q) => q.join(",")).join(" ")}" fill="${p.fill}" fill-opacity="${p.opacity}"/>`;
      case "mark": return p.shape === "circle" ? `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${p.fill}"/>` : p.shape === "square" ? `<rect x="${p.x - p.r}" y="${p.y - p.r}" width="${p.r * 2}" height="${p.r * 2}" fill="${p.fill}"/>` : p.shape === "diamond" ? `<polygon points="${p.x},${p.y - p.r * 1.3} ${p.x + p.r * 1.3},${p.y} ${p.x},${p.y + p.r * 1.3} ${p.x - p.r * 1.3},${p.y}" fill="${p.fill}"/>` : `<polygon points="${p.x},${p.y - p.r * 1.2} ${p.x + p.r * 1.2},${p.y + p.r} ${p.x - p.r * 1.2},${p.y + p.r}" fill="${p.fill}"/>`;
      case "text": return `<text x="${p.x}" y="${p.y}" font-size="${p.size}" text-anchor="${p.anchor}" fill="${p.c}"${p.bold ? ' font-weight="700"' : ""}>${e(p.s)}</text>`;
    }
  }).join("");
  return `<svg role="img" aria-label="${e(d.alt)}" viewBox="0 0 ${widthPt} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Source Sans 3, Arial, sans-serif"><title>${e(d.title)}</title>${body}</svg>`;
}
