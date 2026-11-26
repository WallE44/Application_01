// Orchestration partagée entre l'interface et le service worker :
// rafraîchissement météo, cache hors-ligne (EXG-12, RG-07) et calcul du verdict.
import { computeDay, tripPoints } from './forecast.js';
import { isStale, isWorkingDay } from './rules.js';
import { withDefaults } from './settings.js';
import { KEYS } from './store.js';
import { fetchForecast } from './weather.js';

export const tripSignature = (trip) => tripPoints(trip).map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join('|');

export async function loadSettings(store) {
  return withDefaults(await store.get(KEYS.settings));
}

/**
 * Retourne le verdict du jour.
 * - Rafraîchit la météo si `refresh` est vrai (ouverture de l'app, notification) ;
 * - en cas d'échec, utilise la dernière prévision en cache (horodatée).
 * Résultat : { status, result?, fetchedAt?, stale, error?, offline }
 */
export async function getDayReport({ store, logger, userId, refresh = true, fetchImpl, now = Date.now() }) {
  const trip = await store.get(KEYS.trip(userId));
  if (!trip) return { status: 'no-trip' };
  const settings = await loadSettings(store);
  const day = new Date(now);
  if (!isWorkingDay(day, trip.workdays)) return { status: 'day-off' };

  const sig = tripSignature(trip);
  let cache = await store.get(KEYS.forecast(userId));
  if (cache && cache.sig !== sig) cache = null;
  let error = null;

  if (refresh) {
    try {
      const { data } = await fetchForecast(tripPoints(trip), fetchImpl ? { fetchImpl } : undefined);
      cache = { sig, fetchedAt: now, weather: data };
      await store.set(KEYS.forecast(userId), cache);
      await logger?.log('weather', 'Prévision Open-Meteo mise à jour (3 points)');
    } catch (e) {
      error = e.message;
      await logger?.log('error', `Météo : ${e.message}`);
    }
  }
  if (!cache) return { status: 'error', error: error ?? 'Aucune prévision disponible', stale: true };

  try {
    const result = computeDay({ trip, settings, weather: cache.weather, day });
    return { status: 'ok', result, fetchedAt: cache.fetchedAt, stale: isStale(cache.fetchedAt, now), error };
  } catch (e) {
    await logger?.log('error', `Calcul : ${e.message}`);
    return { status: 'error', error: e.message, fetchedAt: cache.fetchedAt, stale: true };
  }
}

/** Texte de la notification quotidienne (EXG-11). */
export function notificationText(report) {
  const r = report.result;
  const title = `Pluie : ${r.verdict.levelInfo.label.toLowerCase()} (${r.verdict.maxProb} %)`;
  const advice =
    r.verdict.level === 2
      ? 'Prenez vos vêtements de pluie.'
      : r.verdict.level === 1
        ? 'Vêtements de pluie conseillés.'
        : 'Pas besoin de vêtements de pluie aujourd’hui.';
  return { title, body: `${advice} ${r.gloves.label}.` };
}
