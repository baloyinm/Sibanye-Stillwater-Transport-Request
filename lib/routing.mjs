// Road distance and time from an OSRM-compatible service (GET {url}/route/v1/driving/lng,lat;lng,lat).
// Returns { km, minutes } or null when the service is down, slow or answers badly; callers fall back to straight line.
export async function roadRoute(baseUrl, a, b, fetchFn = fetch, timeoutMs = 3000) {
  const ok = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
  if (!ok(a) || !ok(b)) return null;
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const r = (await res.json())?.routes?.[0];
    if (!r || !Number.isFinite(r.distance) || !Number.isFinite(r.duration)) return null;
    return { km: Math.round(r.distance / 10) / 100, minutes: Math.max(1, Math.round(r.duration / 60)) };
  } catch { return null; }
}
