// Calculs géographiques (RG-01).

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function isValidPoint(p) {
  return (
    p != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lon >= -180 &&
    p.lon <= 180
  );
}

/** Distance à vol d'oiseau (formule de haversine), en km. */
export function haversineKm(a, b) {
  if (!isValidPoint(a) || !isValidPoint(b)) throw new Error('Coordonnées invalides');
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point milieu sur la sphère entre A et B. */
export function midpoint(a, b) {
  if (!isValidPoint(a) || !isValidPoint(b)) throw new Error('Coordonnées invalides');
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const λ1 = toRad(a.lon);
  const Δλ = toRad(b.lon - a.lon);
  const Bx = Math.cos(φ2) * Math.cos(Δλ);
  const By = Math.cos(φ2) * Math.sin(Δλ);
  const φm = Math.atan2(Math.sin(φ1) + Math.sin(φ2), Math.sqrt((Math.cos(φ1) + Bx) ** 2 + By ** 2));
  const λm = λ1 + Math.atan2(By, Math.cos(φ1) + Bx);
  return { lat: toDeg(φm), lon: ((toDeg(λm) + 540) % 360) - 180 };
}

/** RG-01 : distance du trajet = vol d'oiseau × coefficient de détour. */
export function routeDistanceKm(a, b, detourCoef) {
  if (!Number.isFinite(detourCoef) || detourCoef <= 0) throw new Error('Coefficient de détour invalide');
  return haversineKm(a, b) * detourCoef;
}
