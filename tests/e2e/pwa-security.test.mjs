// Tests fonctionnels : installation PWA, notification, réseau, performance, ergonomie, injection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fillTrip, FRIDAY_0700, ROOT, setClock, setupAdmin, shot, startEnv } from './helpers.mjs';

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
const homeReady = (page) => page.waitForSelector('#refresh:not([disabled])');

test('EXG-01 critères d’installabilité : manifeste, icônes, service worker, plein écran', () =>
  withEnv(async ({ page, base }) => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'app', 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.display, 'standalone', 'plein écran sans barre d’adresse');
    assert.equal(manifest.lang, 'fr');
    assert.ok(manifest.name && manifest.short_name && manifest.start_url);
    const sizes = manifest.icons.map((i) => i.sizes);
    assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
    assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
    for (const i of manifest.icons) {
      const res = await page.request.get(base + i.src);
      assert.equal(res.status(), 200, i.src);
      assert.equal(res.headers()['content-type'], 'image/png');
    }
    await page.goto(base);
    assert.equal(await page.getAttribute('link[rel=manifest]', 'href'), 'manifest.webmanifest');
    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return { active: !!reg.active, scope: reg.scope };
    });
    assert.equal(sw.active, true);
    assert.equal(sw.scope, base);
    await page.reload();
    assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true, 'page contrôlée par le service worker');
  }));

test('EXG-11 notification quotidienne envoyée un jour de travail à l’heure réglée (application ouverte)', () =>
  withEnv(async (env) => {
    const { page, base } = env;
    env.weather = () => ({ prob: 70, mm: 1, temp: 6 });
    await setClock(env, new Date(2026, 10, 27, 7, 20));
    await setupAdmin(page, base);
    await fillTrip(page);
    await homeReady(page);
    await page.goto(base + '#/preferences');
    await page.click('#notif-toggle');
    await page.waitForSelector('text=Notifications activées');
    // Espion sur l'affichage : Chromium sans écran refuse d'afficher les notifications
    await page.evaluate(() => {
      window.__notifs = [];
      ServiceWorkerRegistration.prototype.showNotification = function (title, opts) {
        window.__notifs.push({ title, body: opts.body });
        return Promise.resolve();
      };
    });
    const sent = () => page.evaluate(() => window.__notifs);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(500);
    assert.deepEqual(await sent(), [], '07:20 : pas encore');
    await setClock(env, new Date(2026, 10, 27, 7, 30));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => window.__notifs.length === 1, null, { timeout: 10000 });
    assert.deepEqual(await sent(), [{ title: 'Pluie : indispensable (70 %)', body: 'Prenez vos vêtements de pluie. Gants hiver.' }]);
    // Pas de doublon le même jour
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(800);
    assert.equal((await sent()).length, 1);
    await page.goto(base + '#/admin/journaux');
    await page.waitForSelector('#logs');
    assert.match(await page.textContent('#logs'), /Notification envoyée : Pluie : indispensable/);
  }));

test('ENF-03 / ENF-09 HTTPS uniquement, seules les coordonnées partent vers les services, aucun traceur', () =>
  withEnv(async (env) => {
    const { page, base } = env;
    await setupAdmin(page, base);
    await fillTrip(page);
    await homeReady(page);
    const allowed = ['api.open-meteo.com', 'api-adresse.data.gouv.fr', 'data.geopf.fr', 'tile.openstreetmap.org'];
    assert.ok(env.externalRequests.length > 0);
    for (const u of env.externalRequests) {
      const url = new URL(u);
      assert.equal(url.protocol, 'https:', u);
      assert.ok(allowed.includes(url.host), `hôte non prévu : ${url.host}`);
    }
    for (const u of env.weatherCalls) {
      const keys = [...new URL(u).searchParams.keys()].sort();
      assert.deepEqual(keys, ['forecast_days', 'hourly', 'latitude', 'longitude', 'timezone']);
      assert.equal(u.includes('user_01'), false);
    }
    const csp = await page.getAttribute('meta[http-equiv=Content-Security-Policy]', 'content');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self';/);
    assert.match(csp, /upgrade-insecure-requests/);
    const src = readFileSync(join(ROOT, 'app', 'js', 'core', 'weather.js'), 'utf8') + readFileSync(join(ROOT, 'app', 'js', 'core', 'address.js'), 'utf8');
    assert.equal(/http:\/\//.test(src), false, 'aucune URL http:// dans le code');
  }));

test('ENF-06 / sécurité : un libellé d’adresse malveillant est affiché comme du texte (pas d’injection)', () =>
  withEnv(async (env) => {
    const { page, base, context } = env;
    await context.route('https://api-adresse.data.gouv.fr/search/**', (route) =>
      route.fulfill({ json: { features: [{ geometry: { coordinates: [-1.55, 47.21] }, properties: { label: '<img src=x onerror="window.__pwned=1">Rue piégée' } }] } }),
    );
    await setupAdmin(page, base);
    await page.fill('#addr-a', 'piege');
    await page.click('#sugg-a button');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    assert.match(await page.textContent('#label-a'), /<img src=x/);
    assert.equal(await page.locator('#view img[src=x]').count(), 0);
  }));

test('ENF-04 accueil affiché en moins de 2 s (prévision en cache, environnement local)', () =>
  withEnv(async ({ page, base }) => {
    await setupAdmin(page, base);
    await fillTrip(page);
    await homeReady(page);
    const t0 = Date.now();
    await page.reload();
    await page.waitForSelector('#verdict');
    const ms = Date.now() - t0;
    assert.ok(ms < 2000, `${ms} ms`);
  }));

test('ENF-07 ergonomie : français, cibles tactiles ≥ 44 px, navigation basse au pouce', () =>
  withEnv(async ({ page, base }) => {
    await setupAdmin(page, base);
    await fillTrip(page);
    await homeReady(page);
    assert.equal(await page.getAttribute('html', 'lang'), 'fr');
    for (const path of ['#/accueil', '#/trajet', '#/preferences', '#/admin/parametres']) {
      await page.goto(base + path);
      await page.waitForTimeout(400);
      const small = await page.$$eval('#view button:not([disabled]), #view select, #view input[type=text], #view input[type=password], #view input[type=number], #nav a', (els) =>
        els
          .filter((e) => e.offsetParent !== null && !e.closest('.leaflet-container'))
          .map((e) => ({ id: e.id || e.textContent.trim().slice(0, 20), h: e.getBoundingClientRect().height }))
          .filter((x) => x.h < 44),
      );
      assert.deepEqual(small, [], `${path} : cibles trop petites`);
      const navBottom = await page.$eval('#nav', (n) => Math.round(n.getBoundingClientRect().bottom));
      assert.equal(navBottom, 854, 'navigation en bas de l’écran');
    }
    const body = await page.textContent('body');
    assert.equal(/\b(mph|°F|miles|inch)\b/i.test(body), false, 'unités métriques');
    await page.goto(base + '#/preferences');
    await shot(page, '15-preferences');
  }));
