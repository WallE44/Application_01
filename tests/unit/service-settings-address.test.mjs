import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, validateSettings, withDefaults } from '../../app/js/core/settings.js';
import { getDayReport, notificationText, loadSettings, tripSignature } from '../../app/js/core/service.js';
import { searchAddress, reverseLabel, parseFeatures, AddressError } from '../../app/js/core/address.js';
import { memoryStore, KEYS } from '../../app/js/core/store.js';
import { createLogger } from '../../app/js/core/logs.js';
import { openMeteoJson, flat } from '../helpers/fake-weather.mjs';

const FRI_0700 = new Date(2026, 10, 27, 7, 0).getTime();
const trip = { a: { lat: 47.2184, lon: -1.5536 }, b: { lat: 47.2784, lon: -1.5236 }, morning: '08:00', evening: '17:30', workdays: [1, 2, 3, 4, 5], mode: 'bike', manualSpeed: null };
const json = (prob, mm = 0, temp = 12) => openMeteoJson(new Date(2026, 10, 27), flat(prob, mm, temp));
const okFetch = (j) => async () => ({ ok: true, status: 200, json: async () => j });
const downFetch = async () => { throw new TypeError('Failed to fetch'); };

test('Paramètres admin : défauts conformes à la SDB', () => {
  assert.deepEqual({ ...DEFAULT_SETTINGS }, {
    speedWalk: 5, speedScooter: 15, speedBike: 18, rainAdvisedPct: 30, rainRequiredPct: 50,
    rainRequiredMm: 0.5, glovesWinterBelowC: 10, notifyTime: '07:30', detourCoef: 1.3, weatherSource: 'open-meteo',
  });
});

test('EXG-13 bornes des paramètres admin', () => {
  assert.equal(validateSettings(DEFAULT_SETTINGS).ok, true);
  const ok = validateSettings({ ...DEFAULT_SETTINGS, detourCoef: '1,5', speedWalk: '10' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.detourCoef, 1.5);
  const cases = [
    { speedWalk: 0 }, { speedWalk: 11 }, { speedScooter: 4 }, { speedScooter: 31 }, { speedBike: 41 },
    { rainAdvisedPct: -1 }, { rainRequiredPct: 101 }, { rainRequiredMm: 11 }, { glovesWinterBelowC: -11 },
    { glovesWinterBelowC: 26 }, { detourCoef: 0.9 }, { detourCoef: 2.1 }, { notifyTime: '24:00' },
    { notifyTime: '7:30' }, { weatherSource: 'autre' }, { rainAdvisedPct: 50, rainRequiredPct: 50 }, { speedBike: 'abc' },
  ];
  for (const c of cases) assert.equal(validateSettings({ ...DEFAULT_SETTINGS, ...c }).ok, false, JSON.stringify(c));
  assert.equal(validateSettings(null).ok, false);
  assert.deepEqual(withDefaults(undefined), { ...DEFAULT_SETTINGS });
  assert.deepEqual(withDefaults({ speedBike: 999 }), { ...DEFAULT_SETTINGS }, 'valeur corrompue → défauts');
  assert.equal(withDefaults({ speedBike: 20 }).speedBike, 20);
});

test('EXG-08/09 rapport du jour avec rafraîchissement et cache', async () => {
  const store = memoryStore();
  const logger = createLogger(store, { now: () => FRI_0700 });
  assert.deepEqual(await getDayReport({ store, userId: 'u1', now: FRI_0700 }), { status: 'no-trip' });
  await store.set(KEYS.trip('u1'), trip);
  const r = await getDayReport({ store, logger, userId: 'u1', fetchImpl: okFetch(json(40)), now: FRI_0700 });
  assert.equal(r.status, 'ok');
  assert.equal(r.result.verdict.level, 1);
  assert.equal(r.fetchedAt, FRI_0700);
  assert.equal(r.stale, false);
  assert.ok((await logger.list()).some((e) => e.type === 'weather'));
});

test('EXG-12 / RG-07 hors-ligne : dernière prévision horodatée, puis périmée', async () => {
  const store = memoryStore();
  const logger = createLogger(store);
  await store.set(KEYS.trip('u1'), trip);
  await getDayReport({ store, logger, userId: 'u1', fetchImpl: okFetch(json(70)), now: FRI_0700 });
  const off = await getDayReport({ store, logger, userId: 'u1', fetchImpl: downFetch, now: FRI_0700 + 60 * 60e3 });
  assert.equal(off.status, 'ok');
  assert.equal(off.fetchedAt, FRI_0700);
  assert.equal(off.stale, false);
  assert.match(off.error, /injoignable/);
  assert.equal(off.result.verdict.level, 2);
  const old = await getDayReport({ store, logger, userId: 'u1', fetchImpl: downFetch, now: FRI_0700 + 4 * 60 * 60e3 });
  assert.equal(old.stale, true);
  assert.ok((await logger.list()).some((e) => e.type === 'error'));
  const noRefresh = await getDayReport({ store, userId: 'u1', refresh: false, now: FRI_0700 });
  assert.equal(noRefresh.status, 'ok');
});

test('ENF-06 pas de cache et pas de réseau → message clair', async () => {
  const store = memoryStore();
  await store.set(KEYS.trip('u1'), trip);
  const r = await getDayReport({ store, userId: 'u1', fetchImpl: downFetch, now: FRI_0700 });
  assert.equal(r.status, 'error');
  assert.match(r.error, /injoignable/);
  const r2 = await getDayReport({ store, userId: 'u1', refresh: false, now: FRI_0700 });
  assert.match(r2.error, /Aucune prévision/);
});

test('Cache ignoré si le trajet a changé ; erreur de calcul gérée', async () => {
  const store = memoryStore();
  await store.set(KEYS.trip('u1'), trip);
  await getDayReport({ store, userId: 'u1', fetchImpl: okFetch(json(10)), now: FRI_0700 });
  await store.set(KEYS.trip('u1'), { ...trip, b: { lat: 47.3, lon: -1.5 } });
  const r = await getDayReport({ store, userId: 'u1', fetchImpl: downFetch, now: FRI_0700 });
  assert.equal(r.status, 'error');
  assert.notEqual(tripSignature(trip), tripSignature({ ...trip, b: { lat: 47.3, lon: -1.5 } }));
  // cache d'un autre jour (heures absentes)
  await store.set(KEYS.trip('u1'), trip);
  await getDayReport({ store, userId: 'u1', fetchImpl: okFetch(json(10)), now: FRI_0700 });
  const later = new Date(2026, 11, 2, 7).getTime(); // mercredi suivant, hors des 3 jours en cache
  const r2 = await getDayReport({ store, userId: 'u1', fetchImpl: downFetch, now: later });
  assert.equal(r2.status, 'error');
  assert.match(r2.error, /Pas de prévision/);
});

test('RG-08 jour non travaillé : pas de verdict', async () => {
  const store = memoryStore();
  await store.set(KEYS.trip('u1'), trip);
  const sat = new Date(2026, 10, 28, 7).getTime();
  assert.deepEqual(await getDayReport({ store, userId: 'u1', fetchImpl: okFetch(json(90)), now: sat }), { status: 'day-off' });
});

test('EXG-13 une modification admin change le calcul suivant', async () => {
  const store = memoryStore();
  await store.set(KEYS.trip('u1'), trip);
  const f = okFetch(json(25));
  assert.equal((await getDayReport({ store, userId: 'u1', fetchImpl: f, now: FRI_0700 })).result.verdict.level, 0);
  await store.set(KEYS.settings, { ...DEFAULT_SETTINGS, rainAdvisedPct: 20 });
  assert.equal((await loadSettings(store)).rainAdvisedPct, 20);
  assert.equal((await getDayReport({ store, userId: 'u1', fetchImpl: f, now: FRI_0700 })).result.verdict.level, 1);
});

test('EXG-11 texte de notification', async () => {
  const store = memoryStore();
  await store.set(KEYS.trip('u1'), trip);
  for (const [prob, mm, temp, re, gl] of [[80, 0, 5, /indispensable/, /hiver/], [40, 0, 15, /conseillée/, /été/], [5, 0, 15, /pas nécessaire/, /été/]]) {
    const r = await getDayReport({ store, userId: 'u1', fetchImpl: okFetch(json(prob, mm, temp)), now: FRI_0700 });
    const n = notificationText(r);
    assert.match(n.title, re);
    assert.match(n.title, new RegExp(`${prob} %`));
    assert.match(n.body, gl);
  }
});

const feature = (label, lon, lat) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { label } });

test('EXG-04 recherche d’adresse (API Adresse), repli sur la Géoplateforme', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith('https://api-adresse')) return { ok: false, status: 410 };
    return { ok: true, json: async () => ({ features: [feature('1 Rue X 44000 Nantes', -1.55, 47.21), { geometry: null }] }) };
  };
  const res = await searchAddress('1 rue x nantes', { fetchImpl });
  assert.deepEqual(res, [{ label: '1 Rue X 44000 Nantes', lon: -1.55, lat: 47.21 }]);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((u) => u.startsWith('https://')));
  assert.deepEqual(await searchAddress('ab', { fetchImpl }), [], 'moins de 3 caractères : pas d’appel');
  await assert.rejects(searchAddress('rue inconnue', { fetchImpl: downFetch }), AddressError);
  assert.throws(() => parseFeatures({}), /invalide/);
  assert.deepEqual(parseFeatures({ features: [feature(undefined, 'x', 1)] }), []);
});

test('EXG-04 libellé d’un point carte / ma position', async () => {
  const p = { lat: 47.21, lon: -1.55 };
  assert.equal(await reverseLabel(p, { fetchImpl: okFetch({ features: [feature('Place Royale 44000 Nantes', -1.55, 47.21)] }) }), 'Place Royale 44000 Nantes');
  assert.equal(await reverseLabel(p, { fetchImpl: downFetch }), 'Position 47.21000, -1.55000');
  assert.equal(await reverseLabel(p, { fetchImpl: okFetch({ features: [] }) }), 'Position 47.21000, -1.55000');
});
