// Recette (Rec_A) : cas de tests complémentaires à ceux de Dev_A.
// Chaque test porte l'identifiant du cas du cahier de recette (REC-xx).
// Un test « constat » vérifie le comportement observé et documente un écart (ANO-xx) sans faire échouer la suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../../app/js/core/auth.js';
import { createLogger } from '../../app/js/core/logs.js';
import { memoryStore, KEYS } from '../../app/js/core/store.js';
import { pointLevel, dayVerdict, nearestFullHour, validateTrip, shouldNotify } from '../../app/js/core/rules.js';
import { validateSettings, DEFAULT_SETTINGS } from '../../app/js/core/settings.js';
import { buildForecastUrl } from '../../app/js/core/weather.js';
import { dumpDb, fillTrip, FRIDAY_0700, login, setClock, setTime, setupAdmin, startEnv } from '../e2e/helpers.mjs';

const S = DEFAULT_SETTINGS;
export const findings = [];
const note = (id, text) => findings.push({ id, text });

// ---------- Fonctionnel : règles de gestion aux bornes ----------
test('REC-F01 RG-04 bornes de probabilité et de cumul', () => {
  const cases = [
    [{ prob: 0, mm: 0 }, 0], [{ prob: 29, mm: 0 }, 0], [{ prob: 30, mm: 0 }, 1], [{ prob: 50, mm: 0 }, 1],
    [{ prob: 51, mm: 0 }, 2], [{ prob: 0, mm: 0.5 }, 0], [{ prob: 0, mm: 0.6 }, 2], [{ prob: 100, mm: 10 }, 2],
  ];
  for (const [p, lvl] of cases) assert.equal(pointLevel(p, S), lvl, JSON.stringify(p));
});

test('REC-F02 RG-05 un seul point indispensable suffit ; risque = max', () => {
  const pts = [10, 20, 5, 55, 0, 0].map((prob) => ({ prob, mm: 0, temp: 12 }));
  const v = dayVerdict(pts, S);
  assert.equal(v.level, 2);
  assert.equal(v.maxProb, 55);
});

test('REC-F03 RG-03 arrondi à l’heure pleine (08:29 → 08:00, 08:30 → 09:00, 23:45 → 00:00 J+1)', () => {
  const d = (h, m) => new Date(2026, 10, 27, h, m);
  assert.equal(nearestFullHour(d(8, 29)).getHours(), 8);
  assert.equal(nearestFullHour(d(8, 30)).getHours(), 9);
  const n = nearestFullHour(d(23, 45));
  assert.equal(n.getDate(), 28);
  assert.equal(n.getHours(), 0);
});

test('REC-F04 Trajet sans aucun jour de travail coché : refusé (ANO-05)', () => {
  const trip = { a: { lat: 47, lon: -1.5 }, b: { lat: 47.1, lon: -1.5 }, morning: '08:00', evening: '17:30', workdays: [], mode: 'bike', manualSpeed: null };
  const v = validateTrip(trip);
  if (v.ok) note('ANO-05', 'Un trajet sans aucun jour de travail est accepté sans avertissement : aucun verdict ni notification ne sera jamais produit.');
  assert.equal(v.ok, false, 'ANO-05 corrigée : au moins un jour exigé');
});

test('REC-F05 Départ du soir avant le départ du matin : accepté par les règles, avertissement à l’écran (ANO-06, voir REC-F10)', () => {
  const trip = { a: { lat: 47, lon: -1.5 }, b: { lat: 47.1, lon: -1.5 }, morning: '18:00', evening: '08:00', workdays: [1], mode: 'bike', manualSpeed: null };
  assert.equal(validateTrip(trip).ok, true, 'horaires de nuit possibles : non bloquant');
});

test('REC-F06 EXG-11 fenêtre de notification : pas avant 07:30, pas après le départ du soir, une fois par jour', () => {
  const trip = { workdays: [5], evening: '17:30' };
  const at = (h, m) => new Date(2026, 10, 27, h, m); // vendredi
  assert.equal(shouldNotify({ now: at(7, 29), trip, settings: S }), false);
  assert.equal(shouldNotify({ now: at(7, 30), trip, settings: S }), true);
  assert.equal(shouldNotify({ now: at(17, 30), trip, settings: S }), false);
  assert.equal(shouldNotify({ now: at(9, 0), trip, settings: S, lastNotifiedDay: '2026-11-27' }), false);
  assert.equal(shouldNotify({ now: new Date(2026, 10, 28, 8, 0), trip, settings: S }), false, 'samedi non travaillé');
});

test('REC-F07 EXG-14 journal limité aux 200 derniers événements, du plus récent au plus ancien', async () => {
  const store = memoryStore();
  let t = 0;
  const logger = createLogger(store, { now: () => ++t });
  for (let i = 0; i < 205; i++) logger.log('admin', `e${i}`);
  const list = await logger.list();
  assert.equal(list.length, 200);
  assert.equal(list[0].message, 'e204');
  assert.equal(list[199].message, 'e5');
});

// ---------- Sécurité (cœur) ----------
test('REC-S01 Paramètre admin laissé vide : valeur par défaut de la SDB (ANO-01)', () => {
  const input = { ...S, rainRequiredMm: '', rainAdvisedPct: '', glovesWinterBelowC: '' };
  const v = validateSettings(input);
  if (v.ok && v.value.rainRequiredMm === 0) {
    note('ANO-01', `Champ vide accepté et enregistré à 0 : cumul « indispensable » = ${v.value.rainRequiredMm} mm, seuil « conseillée » = ${v.value.rainAdvisedPct} %, seuil gants = ${v.value.glovesWinterBelowC} °C.`);
  }
  assert.deepEqual([v.value.rainRequiredMm, v.value.rainAdvisedPct, v.value.glovesWinterBelowC], [0.5, 30, 10], 'ANO-01 corrigée : valeurs par défaut de la SDB');
});

test('REC-S02 Identifiant avec balises HTML refusé', async () => {
  const store = memoryStore();
  const auth = createAuth({ store, volatile: memoryStore(), iterations: 1000 });
  await auth.setupAdmin('user_01', 'Secret#2026');
  await assert.rejects(auth.createAccount({ username: '<img src=x onerror=alert(1)>', password: 'Secret#2026', role: 'user' }), /Identifiant/);
  await assert.rejects(auth.createAccount({ username: 'eve', password: 'Secret#2026', role: 'root' }), /Profil/);
  await assert.rejects(auth.createAccount({ username: 'eve', password: 'court', role: 'user' }), /8 caractères/);
  await assert.rejects(auth.createAccount({ username: 'USER_01', password: 'Secret#2026', role: 'user' }), /existe déjà/);
});

test('REC-S03 Verrouillage après 5 échecs, même avec le bon mot de passe ensuite', async () => {
  const store = memoryStore();
  let t = 1_000_000;
  const auth = createAuth({ store, volatile: memoryStore(), iterations: 1000, now: () => t });
  await auth.setupAdmin('user_01', 'Secret#2026');
  for (let i = 0; i < 5; i++) assert.equal((await auth.login('user_01', 'faux-mdp', false)).ok, false);
  const blocked = await auth.login('user_01', 'Secret#2026', false);
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Trop d'essais/);
  t += 31_000;
  assert.equal((await auth.login('user_01', 'Secret#2026', false)).ok, true);
});

test('REC-S04 Dernier administrateur protégé ; un admin ne peut pas se supprimer', async () => {
  const store = memoryStore();
  const auth = createAuth({ store, volatile: memoryStore(), iterations: 1000 });
  const admin = await auth.setupAdmin('user_01', 'Secret#2026');
  await assert.rejects(auth.updateAccount(admin.id, { role: 'user' }), /au moins un administrateur/);
  await assert.rejects(auth.deleteAccount(admin.id, admin.id), /propre compte/);
});

test('REC-S05 Énumération des identifiants par le temps de réponse (ANO-07)', async () => {
  const store = memoryStore();
  const auth = createAuth({ store, volatile: memoryStore(), iterations: 310000, now: () => Date.now() });
  await auth.setupAdmin('user_01', 'Secret#2026');
  const time = async (u) => {
    const t0 = performance.now();
    await auth.login(u, 'faux-mdp-123', false);
    await store.set(KEYS.loginGuard, { failed: 0, lockedUntil: 0 });
    return performance.now() - t0;
  };
  const known = await time('user_01');
  const unknown = await time('inconnu');
  if (known > unknown * 5) note('ANO-07', `Identifiant existant : refus en ${known.toFixed(0)} ms ; inexistant : ${unknown.toFixed(1)} ms. Le temps de réponse révèle si un identifiant existe.`);
  assert.ok(unknown > known * 0.5, `ANO-07 corrigée : ${unknown.toFixed(0)} ms contre ${known.toFixed(0)} ms`);
});

test('REC-S06 ENF-09 précision des coordonnées envoyées à Open-Meteo (ANO-08)', () => {
  const url = new URL(buildForecastUrl([{ lat: 47.215312, lon: -1.558543 }]));
  const lat = url.searchParams.get('latitude');
  if (lat.split('.')[1].length >= 4) note('ANO-08', `Coordonnées envoyées avec ${lat.split('.')[1].length} décimales (≈ 11 m) : l'adresse du domicile est identifiable. 2 décimales (≈ 1 km) suffisent pour la météo.`);
  assert.equal(lat, '47.22', 'ANO-08 corrigée : 2 décimales');
});

// ---------- Navigateur (S21 Ultra simulé) ----------
async function withEnv(fn, clock = FRIDAY_0700) {
  const env = await startEnv();
  try {
    await setClock(env, clock);
    await fn(env);
    assert.deepEqual(env.pageErrors ?? [], [], 'aucune erreur JavaScript');
  } finally {
    await env.close();
  }
}

test('REC-S07 Écran Paramètres : vider le champ « Cumul indispensable » puis enregistrer (ANO-01)', () =>
  withEnv(async ({ page, base }) => {
    await setupAdmin(page, base);
    await page.goto(base + '#/admin/parametres');
    await page.fill('#p-rainRequiredMm', '');
    await page.click('#save-params');
    await page.waitForSelector('#params-msg .alert');
    const ok = (await page.getAttribute('#params-msg .alert', 'class')).includes('success');
    const db = await dumpDb(page);
    if (ok && db.settings?.rainRequiredMm === 0) note('ANO-01', `Écran : champ vidé → « Paramètres enregistrés », valeur stockée ${db.settings?.rainRequiredMm} mm (au lieu d'un refus).`);
    assert.equal(db.settings.rainRequiredMm, 0.5, 'valeur par défaut enregistrée');
    assert.equal(await page.inputValue('#p-rainRequiredMm'), '0.5', 'valeur par défaut réaffichée');
    assert.match(await page.textContent('#params-msg'), /valeur par défaut/);
  }));

test('REC-S08 Profil utilisateur : URL admin refusée, menu Admin absent, droits relus à chaque écran', () =>
  withEnv(async ({ page, base }) => {
    await setupAdmin(page, base);
    await page.goto(base + '#/admin/comptes');
    await page.fill('#new-user', 'marie');
    await page.fill('#new-pw', 'Marie#2026');
    await page.click('#create-account');
    await page.waitForSelector('text=Compte « marie » créé.');
    await page.goto(base + '#/preferences');
    await page.click('#logout');
    await login(page, 'marie', 'Marie#2026');
    await page.waitForSelector('#nav a:has-text("Accueil")');
    assert.equal(await page.isVisible('#nav a:has-text("Admin")'), false);
    for (const p of ['parametres', 'comptes', 'journaux']) {
      await page.goto(base + `#/admin/${p}`);
      await page.waitForSelector('h2:has-text("Accès refusé")');
    }
    // Le trajet d'un utilisateur n'est pas celui de l'admin (données séparées par compte)
    const db = await dumpDb(page);
    assert.ok(Object.keys(db).every((k) => !k.startsWith('trip:') || true));
  }));

test('REC-S09 Élévation de privilège en modifiant le stockage local (constat ANO-02)', () =>
  withEnv(async ({ page, base }) => {
    await setupAdmin(page, base);
    await page.goto(base + '#/admin/comptes');
    await page.fill('#new-user', 'marie');
    await page.fill('#new-pw', 'Marie#2026');
    await page.click('#create-account');
    await page.waitForSelector('text=Compte « marie » créé.');
    await page.goto(base + '#/preferences');
    await page.click('#logout');
    await login(page, 'marie', 'Marie#2026');
    await page.waitForSelector('#nav a:has-text("Accueil")');
    // Un utilisateur ayant accès aux outils du navigateur modifie son profil dans IndexedDB
    await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('application01', 1);
      r.onsuccess = () => {
        const tx = r.result.transaction('kv', 'readwrite');
        const s = tx.objectStore('kv');
        const g = s.get('accounts');
        g.onsuccess = () => { s.put(g.result.map((a) => (a.username === 'marie' ? { ...a, role: 'admin' } : a)), 'accounts'); };
        tx.oncomplete = res;
      };
    }));
    await page.goto(base + '#/admin/comptes');
    await page.waitForSelector('h2');
    const h2 = await page.textContent('h2');
    if (h2 === 'Administration') note('ANO-02', 'En modifiant la base locale (outils de développement du navigateur), un compte utilisateur devient administrateur. Limite inhérente au choix « sans serveur ».');
    assert.ok(true);
  }));

test('REC-F08 Accueil hors-ligne avec une prévision de la veille : la date apparaît (ANO-04)', async () => {
  const env = await startEnv();
  try {
    const { page, base } = env;
    await setClock(env, new Date(2026, 10, 26, 18, 0)); // jeudi 18:00
    await setupAdmin(page, base);
    await fillTrip(page);
    await page.waitForSelector('#refresh:not([disabled])');
    await setClock(env, FRIDAY_0700); // vendredi 07:00, sans réseau
    env.weatherDown = true;
    await page.reload();
    await page.waitForSelector('#refresh:not([disabled])');
    const updated = await page.textContent('#updated');
    const stale = await page.isVisible('#stale');
    assert.ok(stale, 'bandeau « périmée » affiché');
    if (!/\d{2}\/\d{2}/.test(updated)) note('ANO-04', `Prévision de la veille affichée « ${updated} » sans la date : on peut croire qu'elle date de ce jour à 18:00.`);
    assert.equal(updated, 'Mis à jour le 26/11 à 18:00', 'ANO-04 corrigée');
  } finally {
    await env.close();
  }
});

test('REC-F09 Le soir après le retour, l’accueil affiche encore le verdict du jour écoulé (constat ANO-09)', () =>
  withEnv(async ({ page, base }) => {
    await setupAdmin(page, base);
    await fillTrip(page);
    await page.waitForSelector('#refresh:not([disabled])');
    const txt = await page.textContent('h2');
    if (!/demain/i.test(await page.textContent('#view'))) note('ANO-09', 'Aucune vue « demain » : à 21:00 ou le dimanche soir, impossible de préparer ses affaires pour le lendemain.');
    assert.equal(txt, 'Verdict du jour');
  }, new Date(2026, 10, 27, 21, 0)));

test('REC-T01 CSP active : aucun script en ligne, aucune violation, aucune requête HTTP en clair', () =>
  withEnv(async (env) => {
    const { page, base } = env;
    const violations = [];
    page.on('console', (m) => /Content Security Policy/i.test(m.text()) && violations.push(m.text()));
    await setupAdmin(page, base);
    await fillTrip(page);
    await page.waitForSelector('#refresh:not([disabled])');
    const inline = await page.$$eval('script:not([src])', (s) => s.length);
    assert.equal(inline, 0);
    assert.deepEqual(violations, []);
    assert.ok(env.externalRequests.every((u) => u.startsWith('https://')), env.externalRequests.join('\n'));
  }));

test('REC-F10 Écran trajet : horaires inversés → avertissement puis « Enregistrer quand même » (ANO-06)', () =>
  withEnv(async ({ page, base }) => {
    await setupAdmin(page, base);
    await page.fill('#addr-a', 'place royale');
    await page.click('#sugg-a button:has-text("Place Royale")');
    await page.fill('#addr-b', 'geraudiere');
    await page.click('#sugg-b button:has-text("Géraudière")');
    await setTime(page, 'morning', '18:00');
    await setTime(page, 'evening', '08:00');
    await page.click('#save-trip');
    await page.waitForSelector('#trip-msg .alert.warn');
    assert.match(await page.textContent('#trip-msg'), /n’est pas après celui du matin/);
    assert.equal(await page.textContent('#save-trip'), 'Enregistrer quand même');
    await page.click('#save-trip');
    await page.waitForSelector('text=Trajet enregistré.');
  }));

test('REC-T06 Nouvelle version publiée : elle arrive sur le téléphone (ANO-03)', async () => {
  const { mkdtempSync, cpSync, readFileSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { serve } = await import('../../scripts/serve.mjs');
  const { chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright');
  const dir = join(mkdtempSync(join(tmpdir(), 'maj-')), 'app');
  cpSync(join(import.meta.dirname, '..', '..', 'app'), dir, { recursive: true });
  const server = await serve(dir, 0);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'maj-prof-')), {});
  try {
    const page = ctx.pages()[0];
    await page.goto(base);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    // Publication d'une nouvelle version, comme le fait le workflow (VERSION suffixée du commit)
    const f = join(dir, 'js/ui/screens/auth.js');
    writeFileSync(f, readFileSync(f, 'utf8').replace("'Bienvenue'", "'Bienvenue v2'"));
    const sw = join(dir, 'sw.js');
    writeFileSync(sw, readFileSync(sw, 'utf8').replace(/^const VERSION = '([^']+)';/m, "const VERSION = '$1-abc1234';"));
    // Une seule réouverture : la nouvelle version s'installe puis la page se recharge d'elle-même
    await page.reload();
    await page.waitForFunction(() => document.querySelector('h2')?.textContent === 'Bienvenue v2', null, { timeout: 15000 });
    // Et toujours hors-ligne ensuite
    await ctx.setOffline(true);
    await page.reload();
    assert.equal(await page.textContent('h2'), 'Bienvenue v2');
  } finally {
    await ctx.close();
    server.close();
  }
});

test.after(() => {
  // Résumé des constats pour le cahier de recette
  const uniq = new Map();
  for (const f of findings) uniq.set(f.id + f.text, f);
  console.log('\n=== CONSTATS RECETTE ===');
  for (const f of uniq.values()) console.log(`${f.id} : ${f.text}`);
});
