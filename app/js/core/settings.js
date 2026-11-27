// Paramètres globaux administrables (SDB, section « Paramètres admin »).

export const DEFAULT_SETTINGS = Object.freeze({
  speedWalk: 5,
  speedScooter: 15,
  speedBike: 18,
  rainAdvisedPct: 30,
  rainRequiredPct: 50,
  rainRequiredMm: 0.5,
  glovesWinterBelowC: 10,
  notifyTime: '07:30',
  detourCoef: 1.3,
  weatherSource: 'open-meteo',
});

export const WEATHER_SOURCES = Object.freeze(['open-meteo']);

const NUMERIC_BOUNDS = {
  speedWalk: [1, 10, 'Vitesse à pied'],
  speedScooter: [5, 30, 'Vitesse trottinette'],
  speedBike: [5, 40, 'Vitesse vélo'],
  rainAdvisedPct: [0, 100, 'Seuil « conseillée »'],
  rainRequiredPct: [0, 100, 'Seuil « indispensable »'],
  rainRequiredMm: [0, 10, 'Cumul « indispensable »'],
  glovesWinterBelowC: [-10, 25, 'Seuil gants hiver'],
  detourCoef: [1, 2, 'Coefficient de détour'],
};

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Valide un objet de paramètres complet. Retourne { ok, errors, value }.
 * Les nombres peuvent arriver en chaîne (formulaire) : ils sont convertis.
 * Un champ numérique vide reprend sa valeur par défaut ; `defaulted` liste ces champs.
 */
export function validateSettings(input) {
  const errors = [];
  const value = { ...DEFAULT_SETTINGS };
  const defaulted = [];
  for (const [key, [min, max, label]] of Object.entries(NUMERIC_BOUNDS)) {
    const raw = input?.[key];
    // Champ vidé : jamais enregistré vide ni à 0, il reprend la valeur par défaut de la SDB (décision du 27/11/2026).
    if (input != null && typeof raw === 'string' && raw.trim() === '') {
      defaulted.push(key);
      continue;
    }
    const n = typeof raw === 'string' ? Number(raw.replace(',', '.')) : raw;
    if (!Number.isFinite(n) || n < min || n > max) {
      errors.push(`${label} : valeur attendue entre ${min} et ${max}`);
    } else {
      value[key] = n;
    }
  }
  if (!TIME_RE.test(String(input?.notifyTime ?? ''))) {
    errors.push('Heure de notification : format HH:MM attendu (00:00 à 23:59)');
  } else {
    value.notifyTime = input.notifyTime;
  }
  if (!WEATHER_SOURCES.includes(input?.weatherSource)) {
    errors.push('Source météo : seule Open-Meteo est disponible');
  } else {
    value.weatherSource = input.weatherSource;
  }
  if (errors.length === 0 && !(value.rainAdvisedPct < value.rainRequiredPct)) {
    errors.push('Le seuil « conseillée » doit être inférieur au seuil « indispensable »');
  }
  return { ok: errors.length === 0, errors, value: errors.length === 0 ? value : null, defaulted };
}

/** Fusionne des paramètres stockés avec les défauts (tolère les anciennes versions). */
export function withDefaults(stored) {
  const merged = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  const res = validateSettings(merged);
  return res.ok ? res.value : { ...DEFAULT_SETTINGS };
}
