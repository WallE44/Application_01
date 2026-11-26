import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  atTime,
  dayVerdict,
  durationMinutes,
  effectiveSpeedKmh,
  formatHHMM,
  glovesAdvice,
  hourKey,
  isStale,
  isWorkingDay,
  nearestFullHour,
  passageTimes,
  pointLevel,
  sameDay,
  shouldNotify,
  validateTrip,
  STALE_AFTER_MS,
} from '../../app/js/core/rules.js';
import { DEFAULT_SETTINGS as S } from '../../app/js/core/settings.js';

const A = { lat: 47.2184, lon: -1.5536 };
const B = { lat: 47.25, lon: -1.5 };
const trip = (over = {}) => ({ a: A, b: B, morning: '08:00', evening: '17:30', workdays: [1, 2, 3, 4, 5], mode: 'bike', manualSpeed: null, ...over });

test('EXG-05/06/07 validation du trajet', () => {
  assert.deepEqual(validateTrip(trip()), { ok: true, errors: [] });
  const bad = validateTrip({ a: null, b: { lat: 999, lon: 0 }, morning: '8h', evening: '24:00', workdays: [7], mode: 'auto', manualSpeed: 41 });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 7);
  assert.equal(validateTrip(trip({ manualSpeed: 0.5 })).ok, false);
  assert.equal(validateTrip(trip({ manualSpeed: 1 })).ok, true);
  assert.equal(validateTrip(trip({ manualSpeed: 40 })).ok, true);
  assert.equal(validateTrip(trip({ workdays: 'lun' })).ok, false);
  assert.equal(validateTrip(undefined).ok, false);
});

test('EXG-07 vitesse : mode par défaut, manuelle prioritaire', () => {
  assert.equal(effectiveSpeedKmh(trip({ mode: 'walk' }), S), 5);
  assert.equal(effectiveSpeedKmh(trip({ mode: 'scooter' }), S), 15);
  assert.equal(effectiveSpeedKmh(trip({ mode: 'bike' }), S), 18);
  assert.equal(effectiveSpeedKmh(trip({ mode: 'walk', manualSpeed: 12 }), S), 12);
  assert.equal(effectiveSpeedKmh(trip({ mode: 'bike' }), { ...S, speedBike: 22 }), 22);
  assert.throws(() => effectiveSpeedKmh(trip({ mode: 'x' }), S), /inconnu/);
});

test('RG-02 durée = distance / vitesse', () => {
  assert.equal(durationMinutes(9, 18), 30);
  assert.equal(durationMinutes(0, 5), 0);
  assert.throws(() => durationMinutes(1, 0), /Vitesse/);
  assert.throws(() => durationMinutes(-1, 5), /Distance/);
});

test('RG-02 heures de passage A, mi-parcours, B', () => {
  const dep = atTime(new Date(2026, 10, 27), '08:00');
  const [a, m, b] = passageTimes(dep, 40);
  assert.equal(formatHHMM(a), '08:00');
  assert.equal(formatHHMM(m), '08:20');
  assert.equal(formatHHMM(b), '08:40');
});

test('RG-02 trajet du soir qui passe minuit', () => {
  const dep = atTime(new Date(2026, 10, 27), '23:40');
  const [, , b] = passageTimes(dep, 40);
  assert.equal(hourKey(nearestFullHour(b)), '2026-11-28T00:00');
});

test('RG-03 heure pleine la plus proche', () => {
  const d = (h, m, s = 0) => new Date(2026, 10, 27, h, m, s);
  assert.equal(hourKey(nearestFullHour(d(8, 0))), '2026-11-27T08:00');
  assert.equal(hourKey(nearestFullHour(d(8, 29, 59))), '2026-11-27T08:00');
  assert.equal(hourKey(nearestFullHour(d(8, 30))), '2026-11-27T09:00');
  assert.equal(hourKey(nearestFullHour(d(23, 45))), '2026-11-28T00:00');
});

test('RG-04 niveau par point (seuils par défaut, bornes)', () => {
  const lvl = (prob, mm = 0) => pointLevel({ prob, mm }, S);
  assert.equal(lvl(0), 0);
  assert.equal(lvl(29), 0);
  assert.equal(lvl(30), 1);
  assert.equal(lvl(50), 1);
  assert.equal(lvl(51), 2);
  assert.equal(lvl(100), 2);
  assert.equal(lvl(10, 0.5), 0, '0,5 mm pile : pas « supérieur à 0,5 mm »');
  assert.equal(lvl(10, 0.6), 2);
  assert.equal(lvl(35, 0.6), 2);
});

test('RG-04 / EXG-13 seuils modifiés par l’admin', () => {
  const s = { ...S, rainAdvisedPct: 20, rainRequiredPct: 40, rainRequiredMm: 2 };
  assert.equal(pointLevel({ prob: 20, mm: 0 }, s), 1);
  assert.equal(pointLevel({ prob: 41, mm: 0 }, s), 2);
  assert.equal(pointLevel({ prob: 10, mm: 1.5 }, s), 0);
});

test('RG-05 verdict du jour = niveau max des 6 points, risque = proba max', () => {
  const pts = [0, 10, 20, 35, 5, 0].map((prob) => ({ prob, mm: 0, temp: 12 }));
  const v = dayVerdict(pts, S);
  assert.equal(v.level, 1);
  assert.equal(v.maxProb, 35);
  assert.equal(v.levelInfo.label, 'Conseillée');
  assert.equal(v.levelInfo.color, 'orange');
  const v2 = dayVerdict([...pts.slice(0, 5), { prob: 5, mm: 1.2, temp: 12 }], S);
  assert.equal(v2.level, 2);
  assert.equal(v2.maxProb, 35);
  const v0 = dayVerdict(pts.map((p) => ({ ...p, prob: 0 })), S);
  assert.equal(v0.levelInfo.color, 'vert');
  assert.throws(() => dayVerdict([], S), /Aucun/);
});

test('RG-06 gants hiver si température min < 10 °C', () => {
  const pts = (temps) => temps.map((temp) => ({ prob: 0, mm: 0, temp }));
  assert.equal(glovesAdvice(pts([12, 15, 9.9]), S).code, 'winter');
  assert.equal(glovesAdvice(pts([10, 15, 20]), S).code, 'summer');
  assert.equal(glovesAdvice(pts([10, 15, 20]), S).label, 'Gants été');
  assert.equal(glovesAdvice(pts([-2]), S).minTemp, -2);
  assert.equal(glovesAdvice(pts([12]), { ...S, glovesWinterBelowC: 15 }).label, 'Gants hiver');
  assert.throws(() => glovesAdvice([], S), /Aucun/);
});

test('RG-07 prévision périmée au-delà de 3 h', () => {
  const t = Date.UTC(2026, 10, 27, 6);
  assert.equal(isStale(t, t + STALE_AFTER_MS), false);
  assert.equal(isStale(t, t + STALE_AFTER_MS + 1), true);
  assert.equal(isStale(undefined, t), true);
});

test('RG-08 / EXG-06 jours travaillés', () => {
  const fri = new Date(2026, 10, 27); // vendredi
  const sat = new Date(2026, 10, 28);
  assert.equal(isWorkingDay(fri, [1, 2, 3, 4, 5]), true);
  assert.equal(isWorkingDay(sat, [1, 2, 3, 4, 5]), false);
  assert.equal(isWorkingDay(sat, [6]), true);
  assert.equal(isWorkingDay(fri, null), false);
  assert.equal(sameDay(fri, new Date(2026, 10, 27, 23, 59)), true);
  assert.equal(sameDay(fri, sat), false);
});

test('EXG-11 / RG-08 fenêtre de notification', () => {
  const at = (d, h, m) => new Date(2026, 10, d, h, m);
  const t = trip();
  assert.equal(shouldNotify({ now: at(27, 7, 29), trip: t, settings: S }), false);
  assert.equal(shouldNotify({ now: at(27, 7, 30), trip: t, settings: S }), true);
  assert.equal(shouldNotify({ now: at(27, 7, 45), trip: t, settings: S }), true);
  assert.equal(shouldNotify({ now: at(27, 7, 45), trip: t, settings: S, lastNotifiedDay: '2026-11-27' }), false);
  assert.equal(shouldNotify({ now: at(27, 7, 45), trip: t, settings: S, lastNotifiedDay: '2026-11-26' }), true);
  assert.equal(shouldNotify({ now: at(27, 17, 30), trip: t, settings: S }), false, 'après le départ du soir');
  assert.equal(shouldNotify({ now: at(28, 7, 45), trip: t, settings: S }), false, 'samedi non travaillé');
  assert.equal(shouldNotify({ now: at(27, 7, 45), trip: null, settings: S }), false);
  // départ du soir avant l'heure de notification : fenêtre de 12 h
  assert.equal(shouldNotify({ now: at(27, 18, 0), trip: trip({ evening: '06:00' }), settings: S }), true);
});
