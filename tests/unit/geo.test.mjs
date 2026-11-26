import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, midpoint, routeDistanceKm, isValidPoint } from '../../app/js/core/geo.js';

const NANTES = { lat: 47.2184, lon: -1.5536 };
const RENNES = { lat: 48.1173, lon: -1.6778 };
const PARIS = { lat: 48.8566, lon: 2.3522 };
const LYON = { lat: 45.764, lon: 4.8357 };

test('RG-01 haversine : Paris–Lyon ≈ 392 km', () => {
  assert.ok(Math.abs(haversineKm(PARIS, LYON) - 391.5) < 1.5);
});

test('RG-01 haversine : Nantes–Rennes ≈ 100 km et symétrique', () => {
  const d = haversineKm(NANTES, RENNES);
  assert.ok(Math.abs(d - 100.4) < 1);
  assert.equal(d, haversineKm(RENNES, NANTES));
});

test('RG-01 distance nulle pour un même point', () => {
  assert.equal(haversineKm(NANTES, NANTES), 0);
});

test('RG-01 distance trajet = vol d’oiseau × coefficient', () => {
  const d = haversineKm(NANTES, RENNES);
  assert.equal(routeDistanceKm(NANTES, RENNES, 1.3), d * 1.3);
  assert.equal(routeDistanceKm(NANTES, RENNES, 1), d);
  assert.throws(() => routeDistanceKm(NANTES, RENNES, 0), /détour/);
  assert.throws(() => routeDistanceKm(NANTES, RENNES, NaN), /détour/);
});

test('mi-parcours équidistant de A et B', () => {
  const m = midpoint(NANTES, RENNES);
  const d1 = haversineKm(NANTES, m);
  const d2 = haversineKm(m, RENNES);
  assert.ok(Math.abs(d1 - d2) < 0.01);
  assert.ok(Math.abs(d1 + d2 - haversineKm(NANTES, RENNES)) < 0.01);
});

test('mi-parcours de part et d’autre du méridien 180', () => {
  const m = midpoint({ lat: 0, lon: 179 }, { lat: 0, lon: -179 });
  assert.ok(Math.abs(Math.abs(m.lon) - 180) < 1e-9);
});

test('coordonnées invalides refusées', () => {
  assert.equal(isValidPoint(null), false);
  assert.equal(isValidPoint({ lat: 91, lon: 0 }), false);
  assert.equal(isValidPoint({ lat: 0, lon: -181 }), false);
  assert.equal(isValidPoint({ lat: 'a', lon: 0 }), false);
  assert.throws(() => haversineKm(null, NANTES), /invalides/);
  assert.throws(() => midpoint(NANTES, {}), /invalides/);
});
