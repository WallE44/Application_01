import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildForecastUrl, parseForecast, valuesAt, fetchForecast, WeatherError } from '../../app/js/core/weather.js';
import { computeDay, tripMetrics, tripPoints } from '../../app/js/core/forecast.js';
import { DEFAULT_SETTINGS as S } from '../../app/js/core/settings.js';
import { openMeteoJson, flat } from '../helpers/fake-weather.mjs';

const DAY = new Date(2026, 10, 27); // vendredi 27/11/2026
const A = { lat: 47.2184, lon: -1.5536, label: 'Domicile' };
const B = { lat: 47.2784, lon: -1.5236, label: 'Travail' };
const trip = (over = {}) => ({ a: A, b: B, morning: '08:00', evening: '17:30', workdays: [1, 2, 3, 4, 5], mode: 'bike', manualSpeed: null, ...over });
const okFetch = (json) => async () => ({ ok: true, status: 200, json: async () => json });

test('ENF-03/ENF-09 URL Open-Meteo : HTTPS, coordonnées seules, 3 points en un appel', () => {
  const url = new URL(buildForecastUrl(tripPoints(trip())));
  assert.equal(url.protocol, 'https:');
  assert.equal(url.host, 'api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude').split(',').length, 3);
  assert.equal(url.searchParams.get('hourly'), 'precipitation_probability,precipitation,temperature_2m');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['forecast_days', 'hourly', 'latitude', 'longitude', 'timezone']);
  assert.throws(() => buildForecastUrl([]), WeatherError);
});

test('Parsing : un point (objet) ou plusieurs (tableau)', () => {
  const json = openMeteoJson(DAY, flat(10));
  assert.equal(parseForecast(json, 3).length, 3);
  assert.equal(parseForecast(json[0], 1).length, 1);
  assert.throws(() => parseForecast(json, 2), /incomplète/);
  assert.throws(() => parseForecast([{}], 1), /invalide/);
  const broken = structuredClone(json[0]);
  broken.hourly.precipitation = [];
  assert.throws(() => parseForecast(broken, 1), /precipitation/);
});

test('valuesAt : heure absente ou valeur nulle → erreur claire (ENF-06)', () => {
  const [loc] = parseForecast(openMeteoJson(DAY, flat(10), 1), 1);
  assert.deepEqual(valuesAt(loc, '2026-11-27T08:00'), { prob: 10, mm: 0, temp: 12 });
  assert.throws(() => valuesAt(loc, '2030-01-01T08:00'), /Pas de prévision/);
  loc.prob[8] = null;
  assert.throws(() => valuesAt(loc, '2026-11-27T08:00'), /incomplète/);
});

test('fetchForecast : succès et erreurs réseau/HTTP/JSON (ENF-06)', async () => {
  const pts = tripPoints(trip());
  const r = await fetchForecast(pts, { fetchImpl: okFetch(openMeteoJson(DAY, flat(10))) });
  assert.equal(r.data.length, 3);
  await assert.rejects(fetchForecast(pts, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), /injoignable/);
  await assert.rejects(fetchForecast(pts, { fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
  await assert.rejects(fetchForecast(pts, { fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('x'); } }) }), /illisible/);
});

test('fetchForecast : délai dépassé → abandon', async () => {
  const slow = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
  await assert.rejects(fetchForecast(tripPoints(trip()), { fetchImpl: slow, timeoutMs: 20 }), /injoignable/);
});

test('RG-01/02 métriques du trajet', () => {
  const m = tripMetrics(trip(), S);
  assert.ok(m.distanceKm > 8 && m.distanceKm < 10);
  assert.equal(m.speedKmh, 18);
  assert.ok(Math.abs(m.durationMin - (m.distanceKm / 18) * 60) < 1e-9);
});

test('EXG-08 : 6 points (aller A→B le matin, retour B→A le soir) à l’heure de passage', () => {
  // valeur codée : prob = index du point * 10 + heure → on vérifie point et heure retenus
  const json = openMeteoJson(DAY, (i, key) => ({ prob: i * 10 + Number(key.slice(11, 13)) / 100, mm: 0, temp: 12 }));
  const t = trip({ manualSpeed: 10 }); // ~8,7 km à 10 km/h ≈ 52 min
  const r = computeDay({ trip: t, settings: S, weather: parseForecast(json, 3), day: DAY });
  assert.equal(r.workingDay, true);
  const [aller, retour] = r.legs;
  assert.deepEqual(aller.points.map((p) => p.forecastHour.slice(11)), ['08:00', '08:00', '09:00']);
  assert.deepEqual(aller.points.map((p) => Math.floor(p.prob / 10)), [0, 1, 2], 'aller : A, mi, B');
  assert.deepEqual(retour.points.map((p) => p.forecastHour.slice(11)), ['18:00', '18:00', '18:00']);
  assert.deepEqual(retour.points.map((p) => Math.floor(p.prob / 10)), [2, 1, 0], 'retour : B, mi, A');
  for (const p of [...aller.points, ...retour.points]) {
    assert.ok(Number.isFinite(p.passage) && Number.isFinite(p.prob) && Number.isFinite(p.mm) && Number.isFinite(p.temp));
  }
});

test('EXG-09/10 : verdict et gants sur jeu de données', () => {
  const json = openMeteoJson(DAY, (i, key) => {
    const h = Number(key.slice(11, 13));
    if (key.startsWith('2026-11-27') && h === 18 && i === 1) return { prob: 60, mm: 0.2, temp: 8 };
    return { prob: 10, mm: 0, temp: 14 };
  });
  const r = computeDay({ trip: trip(), settings: S, weather: parseForecast(json, 3), day: DAY });
  assert.equal(r.verdict.level, 2);
  assert.equal(r.verdict.maxProb, 60);
  assert.equal(r.gloves.code, 'winter');
});

test('RG-08 : pas de verdict un jour non travaillé', () => {
  const sat = new Date(2026, 10, 28);
  const r = computeDay({ trip: trip(), settings: S, weather: [], day: sat });
  assert.deepEqual(r, { workingDay: false, day: '2026-11-28' });
});
