// Recherche d'adresse en France (API Adresse / Géoplateforme, même format GeoJSON).
// Seul le texte saisi ou les coordonnées sont envoyés (ENF-09).

export const ADDRESS_ENDPOINTS = Object.freeze([
  'https://api-adresse.data.gouv.fr',
  'https://data.geopf.fr/geocodage',
]);

export class AddressError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AddressError';
  }
}

export function parseFeatures(json) {
  if (!json || !Array.isArray(json.features)) throw new AddressError('Réponse du service d’adresses invalide');
  return json.features
    .filter((f) => Array.isArray(f?.geometry?.coordinates) && f.geometry.coordinates.length >= 2)
    .map((f) => ({
      label: String(f.properties?.label ?? 'Adresse'),
      lon: Number(f.geometry.coordinates[0]),
      lat: Number(f.geometry.coordinates[1]),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

async function tryEndpoints(path, params, fetchImpl) {
  let lastErr;
  for (const base of ADDRESS_ENDPOINTS) {
    try {
      const res = await fetchImpl(`${base}${path}?${params}`, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new AddressError(`HTTP ${res.status}`);
      return parseFeatures(await res.json());
    } catch (e) {
      lastErr = e;
    }
  }
  throw new AddressError(`Service d’adresses indisponible (${lastErr?.message ?? 'erreur'})`);
}

export async function searchAddress(query, { fetchImpl = fetch, limit = 5 } = {}) {
  const q = String(query ?? '').trim();
  if (q.length < 3) return [];
  return tryEndpoints('/search/', new URLSearchParams({ q, limit: String(limit) }), fetchImpl);
}

/** Libellé d'un point choisi sur la carte ou par géolocalisation (repli sur les coordonnées). */
export async function reverseLabel(point, { fetchImpl = fetch } = {}) {
  const fallback = `Position ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
  try {
    const res = await tryEndpoints(
      '/reverse/',
      new URLSearchParams({ lat: point.lat.toFixed(5), lon: point.lon.toFixed(5), limit: '1' }),
      fetchImpl,
    );
    return res[0]?.label ?? fallback;
  } catch {
    return fallback;
  }
}
