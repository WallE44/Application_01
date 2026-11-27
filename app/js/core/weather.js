// Accès Open-Meteo (RG-03). Seules les coordonnées des points sont envoyées (ENF-09),
// arrondies à 2 décimales (≈ 1 km, la maille du modèle météo est d'environ 2 km) : ANO-08.

export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
export const COORD_DECIMALS = 2;
export const HOURLY_VARS = ['precipitation_probability', 'precipitation', 'temperature_2m'];

export class WeatherError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'WeatherError';
    this.cause = cause;
  }
}

/** Construit l'URL pour plusieurs points en un seul appel. */
export function buildForecastUrl(points) {
  if (!points.length) throw new WeatherError('Aucun point à interroger');
  const fmt = (n) => n.toFixed(COORD_DECIMALS);
  const params = new URLSearchParams({
    latitude: points.map((p) => fmt(p.lat)).join(','),
    longitude: points.map((p) => fmt(p.lon)).join(','),
    hourly: HOURLY_VARS.join(','),
    timezone: 'Europe/Paris',
    forecast_days: '3',
  });
  return `${OPEN_METEO_URL}?${params.toString()}`;
}

/** Normalise la réponse (objet pour 1 point, tableau pour plusieurs). */
export function parseForecast(json, expectedCount) {
  const list = Array.isArray(json) ? json : [json];
  if (list.length !== expectedCount) {
    throw new WeatherError(`Réponse météo incomplète (${list.length}/${expectedCount} points)`);
  }
  return list.map((loc, i) => {
    const h = loc?.hourly;
    if (!h || !Array.isArray(h.time)) throw new WeatherError(`Réponse météo invalide pour le point ${i + 1}`);
    for (const v of HOURLY_VARS) {
      if (!Array.isArray(h[v]) || h[v].length !== h.time.length) {
        throw new WeatherError(`Donnée « ${v} » absente pour le point ${i + 1}`);
      }
    }
    return { time: h.time, prob: h.precipitation_probability, mm: h.precipitation, temp: h.temperature_2m };
  });
}

/** Valeurs à une heure donnée ("YYYY-MM-DDTHH:00"). */
export function valuesAt(location, key) {
  const i = location.time.indexOf(key);
  if (i < 0) throw new WeatherError(`Pas de prévision disponible pour ${key.replace('T', ' ')}`);
  const prob = location.prob[i];
  const mm = location.mm[i];
  const temp = location.temp[i];
  if (![prob, mm, temp].every(Number.isFinite)) {
    throw new WeatherError(`Prévision incomplète pour ${key.replace('T', ' ')}`);
  }
  return { prob, mm, temp };
}

/** Appel réseau avec délai maximal. */
export async function fetchForecast(points, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const url = buildForecastUrl(points);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (e) {
    throw new WeatherError('Service météo injoignable (réseau indisponible ?)', e);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new WeatherError(`Service météo en erreur (HTTP ${res.status})`);
  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new WeatherError('Réponse météo illisible', e);
  }
  return { url, data: parseForecast(json, points.length) };
}
