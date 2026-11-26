// Règles de gestion RG-02 à RG-08 (fonctions pures, testées à 100 %).
import { isValidPoint } from './geo.js';
import { TIME_RE } from './settings.js';

export const MODES = Object.freeze({
  walk: { label: 'À pied', settingKey: 'speedWalk' },
  scooter: { label: 'Trottinette', settingKey: 'speedScooter' },
  bike: { label: 'Vélo', settingKey: 'speedBike' },
});

export const MANUAL_SPEED_MIN = 1;
export const MANUAL_SPEED_MAX = 40;
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000; // RG-07 : 3 h

/** Niveaux de verdict pluie (RG-04). */
export const LEVELS = Object.freeze([
  { id: 0, code: 'none', label: 'Pas nécessaire', color: 'vert' },
  { id: 1, code: 'advised', label: 'Conseillée', color: 'orange' },
  { id: 2, code: 'required', label: 'Indispensable', color: 'rouge' },
]);

export const WEEKDAYS = Object.freeze([
  { id: 1, short: 'Lun', label: 'Lundi' },
  { id: 2, short: 'Mar', label: 'Mardi' },
  { id: 3, short: 'Mer', label: 'Mercredi' },
  { id: 4, short: 'Jeu', label: 'Jeudi' },
  { id: 5, short: 'Ven', label: 'Vendredi' },
  { id: 6, short: 'Sam', label: 'Samedi' },
  { id: 0, short: 'Dim', label: 'Dimanche' },
]);

/** Valide un trajet saisi (EXG-04 à EXG-07). */
export function validateTrip(trip) {
  const errors = [];
  if (!isValidPoint(trip?.a)) errors.push('Point A (domicile) non renseigné');
  if (!isValidPoint(trip?.b)) errors.push('Point B (travail) non renseigné');
  if (!TIME_RE.test(String(trip?.morning ?? ''))) errors.push('Heure du matin invalide (HH:MM, 24 h)');
  if (!TIME_RE.test(String(trip?.evening ?? ''))) errors.push('Heure du soir invalide (HH:MM, 24 h)');
  if (!Array.isArray(trip?.workdays) || trip.workdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    errors.push('Jours de travail invalides');
  }
  if (!Object.hasOwn(MODES, trip?.mode ?? '')) errors.push('Mode de déplacement invalide');
  if (trip?.manualSpeed != null) {
    const s = trip.manualSpeed;
    if (!Number.isFinite(s) || s < MANUAL_SPEED_MIN || s > MANUAL_SPEED_MAX) {
      errors.push(`Vitesse manuelle : entre ${MANUAL_SPEED_MIN} et ${MANUAL_SPEED_MAX} km/h`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** EXG-07 / RG-02 : la vitesse manuelle remplace celle du mode. */
export function effectiveSpeedKmh(trip, settings) {
  if (trip.manualSpeed != null) return trip.manualSpeed;
  const mode = MODES[trip.mode];
  if (!mode) throw new Error('Mode de déplacement inconnu');
  return settings[mode.settingKey];
}

/** RG-02 : durée en minutes. */
export function durationMinutes(distanceKm, speedKmh) {
  if (!(speedKmh > 0)) throw new Error('Vitesse invalide');
  if (!(distanceKm >= 0)) throw new Error('Distance invalide');
  return (distanceKm / speedKmh) * 60;
}

/** Construit une Date locale pour `day` (Date) à l'heure "HH:MM". */
export function atTime(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

/**
 * RG-02 : heures de passage aux 3 points d'un trajet.
 * Retourne [départ, mi-parcours, arrivée] en Date.
 */
export function passageTimes(departure, durationMin) {
  const t0 = departure.getTime();
  const ms = durationMin * 60 * 1000;
  return [new Date(t0), new Date(t0 + ms / 2), new Date(t0 + ms)];
}

/** RG-03 : heure pleine la plus proche (à 30 min pile, on arrondit à l'heure suivante). */
export function nearestFullHour(date) {
  const d = new Date(date.getTime());
  const round = d.getMinutes() * 60 + d.getSeconds() >= 30 * 60;
  d.setMinutes(0, 0, 0);
  if (round) d.setHours(d.getHours() + 1);
  return d;
}

const pad = (n) => String(n).padStart(2, '0');

/** Clé horaire au format Open-Meteo, en heure locale : "YYYY-MM-DDTHH:00". */
export function hourKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
}

export function formatHHMM(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** RG-04 : niveau d'un point. */
export function pointLevel({ prob, mm }, settings) {
  if (prob > settings.rainRequiredPct || mm > settings.rainRequiredMm) return 2;
  if (prob >= settings.rainAdvisedPct) return 1;
  return 0;
}

/** RG-05 : verdict du jour = niveau max ; risque = probabilité max. */
export function dayVerdict(points, settings) {
  if (!Array.isArray(points) || points.length === 0) throw new Error('Aucun point météo');
  let level = 0;
  let maxProb = 0;
  for (const p of points) {
    level = Math.max(level, pointLevel(p, settings));
    maxProb = Math.max(maxProb, p.prob);
  }
  return { level, levelInfo: LEVELS[level], maxProb };
}

/** RG-06 : conseil gants. */
export function glovesAdvice(points, settings) {
  if (!Array.isArray(points) || points.length === 0) throw new Error('Aucun point météo');
  const minTemp = Math.min(...points.map((p) => p.temp));
  const winter = minTemp < settings.glovesWinterBelowC;
  return { minTemp, code: winter ? 'winter' : 'summer', label: winter ? 'Gants hiver' : 'Gants été' };
}

/** RG-08 / EXG-06 : jour travaillé ? (workdays au format Date#getDay, 0 = dimanche). */
export function isWorkingDay(date, workdays) {
  return Array.isArray(workdays) && workdays.includes(date.getDay());
}

/** RG-07 : prévision périmée au-delà de 3 h. */
export function isStale(fetchedAt, now) {
  if (!Number.isFinite(fetchedAt)) return true;
  return now - fetchedAt > STALE_AFTER_MS;
}

/** Même jour calendaire local. */
export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * EXG-11 / RG-08 : faut-il envoyer la notification maintenant ?
 * Fenêtre : de l'heure réglée jusqu'au départ du soir (au-delà, l'information n'est plus utile).
 */
export function shouldNotify({ now, trip, settings, lastNotifiedDay }) {
  if (!trip || !isWorkingDay(now, trip.workdays)) return false;
  if (lastNotifiedDay && lastNotifiedDay === hourKey(now).slice(0, 10)) return false;
  const start = atTime(now, settings.notifyTime);
  let end = atTime(now, trip.evening);
  if (end <= start) end = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  return now >= start && now < end;
}
