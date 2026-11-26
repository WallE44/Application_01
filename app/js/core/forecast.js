// Assemblage du verdict du jour (EXG-08 à EXG-10, RG-01 à RG-06).
import { midpoint, routeDistanceKm } from './geo.js';
import {
  atTime,
  dayVerdict,
  durationMinutes,
  effectiveSpeedKmh,
  glovesAdvice,
  hourKey,
  isWorkingDay,
  nearestFullHour,
  passageTimes,
} from './rules.js';
import { valuesAt } from './weather.js';

/** Les 3 points météo : A, mi-parcours, B (index 0, 1, 2). */
export function tripPoints(trip) {
  return [trip.a, midpoint(trip.a, trip.b), trip.b];
}

/** Données de trajet indépendantes de la météo. */
export function tripMetrics(trip, settings) {
  const distanceKm = routeDistanceKm(trip.a, trip.b, settings.detourCoef);
  const speedKmh = effectiveSpeedKmh(trip, settings);
  return { distanceKm, speedKmh, durationMin: durationMinutes(distanceKm, speedKmh) };
}

/**
 * Calcule le verdict d'un jour à partir des prévisions déjà récupérées.
 * `weather` : tableau de 3 séries horaires alignées sur tripPoints(trip).
 */
export function computeDay({ trip, settings, weather, day }) {
  if (!isWorkingDay(day, trip.workdays)) {
    return { workingDay: false, day: hourKey(day).slice(0, 10) };
  }
  const metrics = tripMetrics(trip, settings);
  const legs = [
    { id: 'aller', label: 'Aller', start: trip.morning, order: [0, 1, 2], names: ['A (départ)', 'Mi-parcours', 'B (arrivée)'] },
    { id: 'retour', label: 'Retour', start: trip.evening, order: [2, 1, 0], names: ['B (départ)', 'Mi-parcours', 'A (arrivée)'] },
  ];
  const points = [];
  const legResults = legs.map((leg) => {
    const times = passageTimes(atTime(day, leg.start), metrics.durationMin);
    const legPoints = leg.order.map((locIndex, i) => {
      const hour = nearestFullHour(times[i]);
      const key = hourKey(hour);
      const v = valuesAt(weather[locIndex], key);
      const p = { leg: leg.id, name: leg.names[i], passage: times[i].getTime(), forecastHour: key, ...v };
      points.push(p);
      return p;
    });
    return { id: leg.id, label: leg.label, points: legPoints };
  });
  return {
    workingDay: true,
    day: hourKey(day).slice(0, 10),
    ...metrics,
    legs: legResults,
    verdict: dayVerdict(points, settings),
    gloves: glovesAdvice(points, settings),
  };
}
