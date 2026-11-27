// Corrections des anomalies de la recette v1.0 (ANO-01, 04 à 08, 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, validateSettings } from '../../app/js/core/settings.js';
import { eveningBeforeMorning, validateTrip } from '../../app/js/core/rules.js';
import { buildForecastUrl } from '../../app/js/core/weather.js';
import { notificationText, stamp } from '../../app/js/core/service.js';
import { createAuth } from '../../app/js/core/auth.js';
import { memoryStore } from '../../app/js/core/store.js';

test('ANO-01 champ vide : valeur par défaut de la SDB, jamais 0', () => {
  const v = validateSettings({ ...DEFAULT_SETTINGS, speedBike: 20, rainRequiredMm: '', rainAdvisedPct: ' ', glovesWinterBelowC: '' });
  assert.equal(v.ok, true);
  assert.equal(v.value.rainRequiredMm, 0.5);
  assert.equal(v.value.rainAdvisedPct, 30);
  assert.equal(v.value.glovesWinterBelowC, 10);
  assert.equal(v.value.speedBike, 20, 'les autres champs sont conservés');
  assert.deepEqual(v.defaulted.sort(), ['glovesWinterBelowC', 'rainAdvisedPct', 'rainRequiredMm']);
  assert.deepEqual(validateSettings(DEFAULT_SETTINGS).defaulted, []);
  assert.equal(validateSettings({ ...DEFAULT_SETTINGS, rainRequiredMm: 'abc' }).ok, false, 'texte non numérique toujours refusé');
});

const trip = { a: { lat: 47, lon: -1.5 }, b: { lat: 47.1, lon: -1.5 }, morning: '08:00', evening: '17:30', workdays: [1], mode: 'bike', manualSpeed: null };

test('ANO-05 au moins un jour de travail', () => {
  const v = validateTrip({ ...trip, workdays: [] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(), /au moins un jour/);
});

test('ANO-06 départ du soir pas après le matin : détecté', () => {
  assert.equal(eveningBeforeMorning(trip), false);
  assert.equal(eveningBeforeMorning({ ...trip, morning: '18:00', evening: '08:00' }), true);
  assert.equal(eveningBeforeMorning({ ...trip, evening: '08:00' }), true, 'égalité');
  assert.equal(eveningBeforeMorning({ ...trip, evening: 'x' }), false);
});

test('ANO-08 coordonnées envoyées à Open-Meteo arrondies à 2 décimales', () => {
  const url = new URL(buildForecastUrl([{ lat: 47.215312, lon: -1.558543 }, { lat: 47.2557, lon: -1.5276 }]));
  assert.equal(url.searchParams.get('latitude'), '47.22,47.26');
  assert.equal(url.searchParams.get('longitude'), '-1.56,-1.53');
});

test('ANO-10 notification : prévision ancienne signalée', () => {
  const result = { verdict: { level: 1, maxProb: 40, levelInfo: { label: 'Conseillée' } }, gloves: { label: 'Gants hiver' } };
  const at = new Date(2026, 10, 26, 18, 5).getTime();
  assert.equal(stamp(at), '26/11 à 18:05');
  assert.doesNotMatch(notificationText({ result, stale: false, fetchedAt: at }).body, /Prévision du/);
  assert.match(notificationText({ result, stale: true, fetchedAt: at }).body, /Prévision du 26\/11 à 18:05, non mise à jour\./);
});

test('ANO-07 identifiant inconnu : même calcul de hachage', async () => {
  const store = memoryStore();
  const auth = createAuth({ store, volatile: memoryStore(), iterations: 200000 });
  await auth.setupAdmin('roland', 'Secret#2026');
  const time = async (u) => {
    const t0 = performance.now();
    await auth.login(u, 'faux-mdp-123', false);
    await store.set('loginGuard', { failed: 0, lockedUntil: 0 });
    return performance.now() - t0;
  };
  await time('inconnu'); // préchauffage
  const known = await time('roland');
  const unknown = await time('inconnu');
  assert.ok(unknown > known * 0.5, `inconnu ${unknown.toFixed(0)} ms, connu ${known.toFixed(0)} ms`);
});
