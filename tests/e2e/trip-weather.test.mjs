// Tests fonctionnels : trajet, météo, verdict, hors-ligne, paramètres, journaux, thème.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dumpDb, fillTrip, FRIDAY_0700, NANTES_HOME, SATURDAY_0700, setClock, setTime, setupAdmin, shot, startEnv } from './helpers.mjs';

async function withEnv(fn, { clock = FRIDAY_0700 } = {}) {
  const env = await startEnv();
  try {
    await setClock(env, clock);
    await fn(env);
    assert.deepEqual(env.pageErrors ?? [], [], 'aucune erreur JavaScript');
  } finally {
    await env.close();
  }
}
const homeReady = (page) => page.waitForSelector('#refresh:not([disabled])');

test('EXG-04 saisie de A et B par adresse, sur la carte et par « ma position »', () =>
  withEnv(async ({ page, base, addressCalls }) => {
    await setupAdmin(page, base);
    // 1. Adresse
    await page.fill('#addr-a', 'place royale');
    await page.click('#sugg-a button:has-text("Place Royale")');
    assert.match(await page.textContent('#label-a'), /Place Royale/);
    // 2. Carte : placer B en touchant la carte
    await page.waitForSelector('#map.leaflet-container');
    await page.check('#target-b', { force: true });
    const box = await page.locator('#map').boundingBox();
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.3);
    await page.waitForFunction(() => document.querySelectorAll('#map .leaflet-marker-icon').length === 2);
    // 3. Ma position pour A (géolocalisation simulée)
    await page.click('#geo-a');
    await page.waitForFunction(() => /Place Royale/.test(document.querySelector('#label-a').textContent));
    await setTime(page, 'morning', '07:45');
    await setTime(page, 'evening', '18:05');
    await shot(page, '05-mon-trajet');
    await page.click('#save-trip');
    await page.waitForSelector('text=Trajet enregistré.');
    const db = await dumpDb(page);
    const trip = Object.entries(db).find(([k]) => k.startsWith('trip:'))[1];
    assert.ok(Math.abs(trip.a.lat - NANTES_HOME.lat) < 1e-6 && Math.abs(trip.a.lon - NANTES_HOME.lon) < 1e-6);
    assert.ok(Number.isFinite(trip.b.lat) && Number.isFinite(trip.b.lon));
    assert.equal(trip.morning, '07:45', 'EXG-05 format 24 h');
    assert.equal(trip.evening, '18:05');
    assert.ok(addressCalls.some((u) => u.includes('/reverse/')), 'libellé de la position par géocodage inverse');
    // Retour sur l'écran : coordonnées réaffichées sur la carte
    await page.goto(base + '#/accueil');
    await page.goto(base + '#/trajet');
    await page.waitForFunction(() => document.querySelectorAll('#map .leaflet-marker-icon').length === 2);
  }));

test('ENF-06 adresse introuvable : message clair', () =>
  withEnv(async ({ page, base }) => {
    await setupAdmin(page, base);
    await page.fill('#addr-a', 'zzzz inconnue');
    await page.waitForSelector('#sugg-a :text("Adresse introuvable")');
    await page.click('#save-trip');
    assert.match(await page.textContent('#trip-msg'), /Point A \(domicile\) non renseigné/);
  }));

test('EXG-08/09/10 verdict du jour : 6 points, risque max, gants, couleurs', () =>
  withEnv(async (env) => {
    const { page, base } = env;
    env.weather = (i, k) => {
      if (k === '2026-11-27T18:00' && i === 1) return { prob: 65, mm: 0.8, temp: 7 };
      return { prob: 20, mm: 0, temp: 11 };
    };
    await setupAdmin(page, base);
    await fillTrip(page);
    await homeReady(page);
    assert.equal(await page.getAttribute('#verdict', 'data-level'), '2');
    assert.match(await page.textContent('#verdict'), /Indispensable/);
    assert.match(await page.textContent('#verdict'), /Risque de pluie max : 65 %/);
    assert.match(await page.textContent('#gloves'), /Gants hiver/);
    assert.match(await page.textContent('#updated'), /Mis à jour à 07:00/);
    const rows = await page.$$eval('table.points tbody tr', (trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
    assert.equal(rows.length, 6, '6 points : 3 aller + 3 retour');
    assert.deepEqual(rows.map((r) => r[0]), ['A (départ)', 'Mi-parcours', 'B (arrivée)', 'B (départ)', 'Mi-parcours', 'A (arrivée)']);
    assert.equal(rows[0][1], '08:00');
    assert.equal(rows[3][1], '17:30');
    for (const r of rows) assert.match(r[2], /^\d+ %$/);
    // Un seul appel météo pour les 3 points
    const url = new URL(env.weatherCalls.at(-1));
    assert.equal(url.searchParams.get('latitude').split(',').length, 3);
    await shot(page, '06-accueil-indispensable');
    const bg = await page.$eval('#verdict', (e) => getComputedStyle(e).backgroundColor);
    assert.equal(bg, 'rgb(127, 29, 29)', 'rouge');

    env.weather = () => ({ prob: 40, mm: 0, temp: 15 });
    await page.click('#refresh');
    await page.waitForFunction(() => document.querySelector('#verdict')?.dataset.level === '1');
    await homeReady(page);
    assert.match(await page.textContent('#gloves'), /Gants été/);
    assert.equal(await page.$eval('#verdict', (e) => getComputedStyle(e).backgroundColor), 'rgb(113, 63, 18)', 'orange');
    await shot(page, '07-accueil-conseillee');

    env.weather = () => ({ prob: 5, mm: 0, temp: 15 });
    await page.click('#refresh');
    await page.waitForFunction(() => document.querySelector('#verdict')?.dataset.level === '0');
    await homeReady(page);
    assert.equal(await page.$eval('#verdict', (e) => getComputedStyle(e).backgroundColor), 'rgb(20, 83, 45)', 'vert');
    assert.match(await page.textContent('#verdict'), /Pas nécessaire/);
    await shot(page, '08-accueil-pas-necessaire');
  }));

test('EXG-07 vitesse manuelle prioritaire, bornes 1 à 40 km/h', () =>
  withEnv(async ({ page, base }) => {
    await setupAdmin(page, base);
    await fillTrip(page, { mode: 'walk', manual: 12 });
    await homeReady(page);
    const summary = await page.textContent('#trip-summary');
    assert.match(summary, /À pied \(vitesse manuelle\)/);
    assert.match(summary, /12 km\/h/);
    await page.goto(base + '#/trajet');
    await page.waitForSelector('#manual-speed');
    await page.fill('#manual-speed', '41');
    await page.click('#save-trip');
    assert.match(await page.textContent('#trip-msg'), /Vitesse manuelle : entre 1 et 40 km\/h/);
    await page.uncheck('#manual-on');
    await page.check('#mode-scooter', { force: true });
    await page.click('#save-trip');
    await page.waitForSelector('text=Trajet enregistré.');
    await homeReady(page);
    assert.match(await page.textContent('#trip-summary'), /Trottinette · .* · 15 km\/h/);
  }));

test('EXG-06 / RG-08 jour non travaillé : pas de verdict', () =>
  withEnv(
    async ({ page, base }) => {
      await setupAdmin(page, base);
      await fillTrip(page);
      await page.waitForSelector('#day-off');
      assert.equal(await page.locator('#verdict').count(), 0);
      await shot(page, '09-jour-non-travaille');
    },
    { clock: SATURDAY_0700 },
  ));

test('EXG-12 / ENF-05 / RG-07 hors-ligne : dernière prévision horodatée, puis bandeau « périmée »', () =>
  withEnv(async (env) => {
    const { page, base, context } = env;
    env.weather = () => ({ prob: 55, mm: 0, temp: 9 });
    await setupAdmin(page, base);
    await fillTrip(page);
    await homeReady(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // la page est désormais servie par le service worker
    await homeReady(page);
    // Mode avion
    await context.setOffline(true);
    env.weatherDown = true;
    await page.reload();
    await homeReady(page);
    assert.match(await page.textContent('#verdict'), /Indispensable/);
    assert.match(await page.textContent('#updated'), /Mis à jour à 07:00/);
    assert.match(await page.textContent('main'), /dernière prévision affichée/);
    assert.equal(await page.locator('#stale').count(), 0);
    await shot(page, '10-hors-ligne');
    // 4 h plus tard, toujours sans réseau : prévision périmée
    await setClock(env, new Date(2026, 10, 27, 11, 0));
    await page.reload();
    await homeReady(page);
    assert.ok(await page.isVisible('#stale'));
    await shot(page, '11-prevision-perimee');
  }));

test('ENF-06 service météo en erreur sans cache : message clair, pas de plantage', () =>
  withEnv(async (env) => {
    const { page, base } = env;
    env.weatherDown = true;
    await setupAdmin(page, base);
    await fillTrip(page);
    await page.waitForSelector('[role=alert]');
    assert.match(await page.textContent('[role=alert]'), /Prévision indisponible : Service météo injoignable/);
    env.weatherDown = false;
    await page.click('#refresh');
    await page.waitForSelector('#verdict');
  }));

test('EXG-13 paramètres admin : bornes contrôlées, modification prise en compte au calcul suivant', () =>
  withEnv(async (env) => {
    const { page, base } = env;
    env.weather = () => ({ prob: 25, mm: 0, temp: 12 });
    await setupAdmin(page, base);
    await fillTrip(page);
    await homeReady(page);
    assert.equal(await page.getAttribute('#verdict', 'data-level'), '0');
    await page.goto(base + '#/admin/parametres');
    await page.fill('#p-speedBike', '45');
    await page.click('#save-params');
    assert.match(await page.textContent('#params-msg'), /Vitesse vélo : valeur attendue entre 5 et 40/);
    await page.fill('#p-speedBike', '18');
    await page.fill('#p-rainAdvisedPct', '60');
    await page.click('#save-params');
    assert.match(await page.textContent('#params-msg'), /inférieur au seuil « indispensable »/);
    await page.fill('#p-rainAdvisedPct', '20');
    await page.click('#save-params');
    await page.waitForSelector('text=Paramètres enregistrés.');
    await shot(page, '12-admin-parametres');
    await page.goto(base + '#/accueil');
    await homeReady(page);
    assert.equal(await page.getAttribute('#verdict', 'data-level'), '1', 'seuil abaissé à 20 % → « conseillée »');
  }));

test('EXG-14 journaux : connexions, appels météo, erreurs, datés', () =>
  withEnv(async (env) => {
    const { page, base } = env;
    await setupAdmin(page, base);
    await fillTrip(page);
    await homeReady(page);
    env.weatherDown = true;
    await page.click('#refresh');
    await homeReady(page);
    await page.waitForSelector('text=dernière prévision affichée');
    await page.goto(base + '#/admin/journaux');
    await page.waitForSelector('#logs');
    const text = await page.textContent('#logs');
    assert.match(text, /Connexion/);
    assert.match(text, /Météo.*Prévision Open-Meteo mise à jour/s);
    assert.match(text, /Erreur.*injoignable/s);
    assert.match(text, /27\/11\/2026 07:00/);
    await shot(page, '13-admin-journaux');
  }));

function contrast(rgbA, rgbB) {
  const lum = (s) => {
    const [r, g, b] = s.match(/\d+/g).slice(0, 3).map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [l1, l2] = [lum(rgbA), lum(rgbB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

test('EXG-15 thème sombre par défaut, bascule clair/sombre, écrans lisibles (contraste ≥ 4,5)', () =>
  withEnv(async (env) => {
    const { page, base } = env;
    env.weather = () => ({ prob: 40, mm: 0, temp: 12 });
    await setupAdmin(page, base);
    await fillTrip(page);
    await homeReady(page);
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
    const check = async (label) => {
      for (const sel of ['body', '#verdict .value', '#verdict .risk', 'table.points td', 'table.points th', '.who', '#trip-summary']) {
        const [fg, bg] = await page.$eval(sel, (el) => {
          let b = el;
          let bgc = getComputedStyle(b).backgroundColor;
          while (bgc === 'rgba(0, 0, 0, 0)' && b.parentElement) {
            b = b.parentElement;
            bgc = getComputedStyle(b).backgroundColor;
          }
          return [getComputedStyle(el).color, bgc];
        });
        const ratio = contrast(fg, bg);
        assert.ok(ratio >= 4.5, `${label} ${sel} : contraste ${ratio.toFixed(2)}`);
      }
    };
    await check('sombre');
    await page.goto(base + '#/preferences');
    await page.uncheck('#theme-dark');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
    await page.goto(base + '#/accueil');
    await homeReady(page);
    await check('clair');
    await shot(page, '14-theme-clair');
    await page.reload();
    assert.equal(await page.getAttribute('html', 'data-theme'), 'light', 'choix mémorisé');
  }));
