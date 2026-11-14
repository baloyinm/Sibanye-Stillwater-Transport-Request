// Port of business/geo-distance-rule v1.0.0 (geoDistance.ts) to plain JavaScript. Straight-line km (haversine), not road distance.
const R = 6371;
const valid = (la, lo) => typeof la === 'number' && typeof lo === 'number' && Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
export function distanceKm(lat1, lng1, lat2, lng2, decimals = 2) {
  if (!valid(lat1, lng1) || !valid(lat2, lng2)) return null;
  const rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const f = 10 ** Math.max(0, Math.min(6, decimals));
  return Math.round(km * f) / f;
}
