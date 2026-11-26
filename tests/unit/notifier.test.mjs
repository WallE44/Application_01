import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maybeNotify, msUntilNext } from '../../app/js/core/notifier.js';
import { memoryStore, KEYS } from '../../app/js/core/store.js';
import { createLogger } from '../../app/js/core/logs.js';
import { openMeteoJson, flat } from '../helpers/fake-weather.mjs';

const trip = { a: { lat: 47.2184, lon: -1.5536 }, b: { lat: 47.2784, lon: -1.5236 }, morning: '08:00', evening: '17:30', workdays: [1, 2, 3, 4, 5], mode: 'bike', manualSpeed: null };
const at = (d, h, m) => new Date(2026, 10, d, h, m).getTime();
const okFetch = async () => ({ ok: true, json: async () => openMeteoJson(new Date(2026, 10, 27), flat(80, 1, 6)) });

async function setup(cfg = { enabled: true, userId: 'u1' }) {
  const store = memoryStore();
  await store.set(KEYS.trip('u1'), trip);
  await store.set(KEYS.notify, cfg);
  const sent = [];
  const show = async (title, opts) => sent.push({ title, ...opts });
  return { store, sent, show, logger: createLogger(store) };
}

test('EXG-11 notification envoyée une seule fois un jour de travail à l’heure réglée', async () => {
  const { store, sent, show, logger } = await setup();
  assert.equal(await maybeNotify({ store, logger, show, now: at(27, 7, 0), fetchImpl: okFetch }), 'not-due');
  assert.equal(await maybeNotify({ store, logger, show, now: at(27, 7, 30), fetchImpl: okFetch }), 'sent');
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /indispensable \(80 %\)/);
  assert.match(sent[0].body, /Prenez vos vêtements de pluie\. Gants hiver\./);
  assert.equal((await store.get(KEYS.notify)).lastNotifiedDay, '2026-11-27');
  assert.equal(await maybeNotify({ store, logger, show, now: at(27, 7, 40), fetchImpl: okFetch }), 'not-due');
  assert.equal(sent.length, 1);
});

test('EXG-06 / RG-08 aucune notification un jour non travaillé', async () => {
  const { store, sent, show } = await setup();
  assert.equal(await maybeNotify({ store, show, now: at(28, 7, 30), fetchImpl: okFetch }), 'not-due');
  assert.equal(sent.length, 0);
});

test('Notifications désactivées ou sans donnée', async () => {
  const off = await setup({ enabled: false, userId: 'u1' });
  assert.equal(await maybeNotify({ ...off, now: at(27, 7, 30), fetchImpl: okFetch }), 'disabled');
  const none = await setup(undefined);
  await none.store.del(KEYS.notify);
  assert.equal(await maybeNotify({ ...none, now: at(27, 7, 30), fetchImpl: okFetch }), 'disabled');
  const net = await setup();
  assert.equal(await maybeNotify({ ...net, now: at(27, 7, 30), fetchImpl: async () => { throw new Error('x'); } }), 'no-data');
  assert.equal(net.sent.length, 0);
});

test('EXG-13 heure de notification réglée par l’admin', async () => {
  const { store, show } = await setup();
  await store.set(KEYS.settings, { speedWalk: 5, speedScooter: 15, speedBike: 18, rainAdvisedPct: 30, rainRequiredPct: 50, rainRequiredMm: 0.5, glovesWinterBelowC: 10, notifyTime: '06:45', detourCoef: 1.3, weatherSource: 'open-meteo' });
  assert.equal(await maybeNotify({ store, show, now: at(27, 6, 50), fetchImpl: okFetch }), 'sent');
});

test('Délai jusqu’à la prochaine heure de notification', () => {
  assert.equal(msUntilNext('07:30', at(27, 7, 0)), 30 * 60e3);
  assert.equal(msUntilNext('07:30', at(27, 7, 30)), 24 * 60 * 60e3);
  assert.equal(msUntilNext('07:30', at(27, 8, 0)), 23.5 * 60 * 60e3);
});

test('Pas de doublon si un autre déclencheur a notifié pendant l’appel météo', async () => {
  const { store, sent, show } = await setup();
  const racing = async () => {
    await store.set(KEYS.notify, { enabled: true, userId: 'u1', lastNotifiedDay: '2026-11-27' });
    return okFetch();
  };
  assert.equal(await maybeNotify({ store, show, now: at(27, 7, 30), fetchImpl: racing }), 'not-due');
  assert.equal(sent.length, 0);
});

test('Échec d’affichage : journalisé, pas de nouvelle tentative le même jour', async () => {
  const { store, logger } = await setup();
  let calls = 0;
  const failing = async () => { calls++; throw new Error('refusé'); };
  assert.equal(await maybeNotify({ store, logger, show: failing, now: at(27, 7, 30), fetchImpl: okFetch }), 'error');
  assert.equal(await maybeNotify({ store, logger, show: failing, now: at(27, 7, 31), fetchImpl: okFetch }), 'not-due');
  assert.equal(calls, 1);
  assert.ok((await logger.list()).some((e) => /non affichée/.test(e.message)));
});
