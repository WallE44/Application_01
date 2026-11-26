// Génère des réponses Open-Meteo factices (format réel de l'API) pour les tests.

const pad = (n) => String(n).padStart(2, '0');

/** Heures locales "YYYY-MM-DDTHH:00" sur `days` jours à partir de `start` (Date locale). */
export function hours(start, days = 3) {
  const out = [];
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      const x = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d, h);
      out.push(`${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(h)}:00`);
    }
  }
  return out;
}

/**
 * fn(locIndex, key) => { prob, mm, temp } ; locIndex 0 = A, 1 = mi-parcours, 2 = B.
 * Retourne le JSON brut tel que renvoyé par Open-Meteo pour plusieurs points.
 */
export function openMeteoJson(start, fn, count = 3) {
  const time = hours(start);
  return Array.from({ length: count }, (_, i) => {
    const vals = time.map((k) => fn(i, k));
    return {
      latitude: 47 + i / 100,
      longitude: -1.5,
      timezone: 'Europe/Paris',
      hourly_units: { time: 'iso8601', precipitation_probability: '%', precipitation: 'mm', temperature_2m: '°C' },
      hourly: {
        time,
        precipitation_probability: vals.map((v) => v.prob),
        precipitation: vals.map((v) => v.mm),
        temperature_2m: vals.map((v) => v.temp),
      },
    };
  });
}

/** Valeurs constantes partout. */
export const flat = (prob, mm = 0, temp = 12) => () => ({ prob, mm, temp });
