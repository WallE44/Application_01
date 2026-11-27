// Outils des tests fonctionnels : serveur local, navigateur Chromium, services externes simulés.
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../../scripts/serve.mjs';
import { openMeteoJson } from '../helpers/fake-weather.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SHOTS = join(ROOT, 'docs', 'captures');
mkdirSync(SHOTS, { recursive: true });

// Samsung Galaxy S21 Ultra (Chrome Android) : viewport CSS 384 × 854
export const S21_ULTRA = {
  viewport: { width: 384, height: 854 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  locale: 'fr-FR',
  timezoneId: 'Europe/Paris',
};

export const NANTES_HOME = { label: '1 Place Royale 44000 Nantes', lat: 47.2153, lon: -1.5585 };
export const NANTES_WORK = { label: '2 Rue de la Géraudière 44300 Nantes', lat: 47.2557, lon: -1.5276 };
export const FRIDAY_0700 = new Date(2026, 10, 27, 7, 0); // vendredi 27/11/2026 07:00 (Paris)
export const SATURDAY_0700 = new Date(2026, 10, 28, 7, 0);

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqAcAAIUAgUW0RjgAAAAASUVORK5CYII=', 'base64');

/**
 * Démarre serveur + navigateur. `weather` : (locIndex, key) => {prob, mm, temp}, modifiable via env.weather.
 * Retourne l'environnement de test ; appeler env.close() à la fin.
 */
export async function startEnv({ persistent = false, userDataDir } = {}) {
  const server = await serve(join(ROOT, 'app'), 0);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const env = {
    base,
    server,
    weather: () => ({ prob: 10, mm: 0, temp: 14 }),
    weatherDown: false,
    weatherCalls: [],
    addressCalls: [],
    externalRequests: [],
  };
  const options = { ...S21_ULTRA, permissions: ['geolocation', 'notifications'], geolocation: { latitude: NANTES_HOME.lat, longitude: NANTES_HOME.lon } };
  if (persistent) {
    env.userDataDir = userDataDir ?? mkdtempSync(join(tmpdir(), 'pluie-'));
    env.context = await chromium.launchPersistentContext(env.userDataDir, options);
  } else {
    env.browser = await chromium.launch();
    env.context = await env.browser.newContext(options);
  }
  await env.context.grantPermissions(['geolocation', 'notifications'], { origin: base.replace(/\/$/, '') });
  await installRoutes(env);
  env.page = env.context.pages()[0] ?? (await env.context.newPage());
  env.page.on('pageerror', (e) => (env.pageErrors ??= []).push(e.message));
  env.close = async () => {
    await env.context.close();
    await env.browser?.close();
    server.close();
  };
  return env;
}

export async function installRoutes(env) {
  const ctx = env.context;
  ctx.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(env.base)) env.externalRequests.push(u);
  });
  await ctx.route('https://api.open-meteo.com/**', async (route) => {
    env.weatherCalls.push(route.request().url());
    if (env.weatherDown) return route.abort('internetdisconnected');
    const url = new URL(route.request().url());
    const n = url.searchParams.get('latitude').split(',').length;
    const start = env.weatherStart ?? FRIDAY_0700;
    await route.fulfill({ json: openMeteoJson(start, env.weather, n), headers: { 'access-control-allow-origin': '*' } });
  });
  const addr = async (route) => {
    const url = new URL(route.request().url());
    env.addressCalls.push(url.toString());
    const q = (url.searchParams.get('q') || '').toLowerCase();
    let features = [];
    if (url.pathname.includes('reverse')) features = [NANTES_HOME];
    else if (q.includes('royale')) features = [NANTES_HOME];
    else if (q.includes('raudi')) features = [NANTES_WORK];
    await route.fulfill({
      json: { type: 'FeatureCollection', features: features.map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lon, f.lat] }, properties: { label: f.label } })) },
      headers: { 'access-control-allow-origin': '*' },
    });
  };
  await ctx.route('https://api-adresse.data.gouv.fr/**', addr);
  await ctx.route('https://data.geopf.fr/**', addr);
  await ctx.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ body: PNG_1PX, contentType: 'image/png' }));
}

export async function setClock(env, date) {
  await env.context.clock.setFixedTime(date);
}

export async function shot(page, name) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

/** Premier lancement : crée l'admin (reste connecté) et arrive sur « Mon trajet ». */
export async function setupAdmin(page, base, username = 'user_01', password = 'Secret#2026') {
  await page.goto(base);
  await page.fill('#setup-user', username);
  await page.fill('#setup-pw', password);
  await page.fill('#setup-pw2', password);
  await page.click('text=Créer le compte administrateur');
  await page.waitForSelector('#addr-a');
}

export async function login(page, username, password, remember = false) {
  await page.waitForSelector('#login-user');
  await page.fill('#login-user', username);
  await page.fill('#login-pw', password);
  if (remember) await page.check('#login-remember');
  await page.click('button:has-text("Se connecter")');
}

/** Saisie d'un trajet complet par adresses. */
export async function fillTrip(page, { mode = 'bike', manual = null, workdays = null, morning = '08:00', evening = '17:30' } = {}) {
  if (!page.url().includes('#/trajet')) await page.goto(page.url().replace(/#.*$/, '') + '#/trajet');
  await page.waitForSelector('#addr-a');
  await page.fill('#addr-a', 'place royale');
  await page.click('#sugg-a button:has-text("Place Royale")');
  await page.fill('#addr-b', 'geraudiere');
  await page.click('#sugg-b button:has-text("Géraudière")');
  await setTime(page, 'morning', morning);
  await setTime(page, 'evening', evening);
  await page.check(`#mode-${mode}`, { force: true });
  if (manual != null) {
    await page.check('#manual-on');
    await page.fill('#manual-speed', String(manual));
  }
  if (workdays) {
    for (const d of [0, 1, 2, 3, 4, 5, 6]) {
      if (workdays.includes(d)) await page.check(`#day-${d}`);
      else await page.uncheck(`#day-${d}`);
    }
  }
  await page.click('#save-trip');
  await page.waitForSelector('text=Trajet enregistré.');
}

export async function setTime(page, id, hhmm) {
  const [h, m] = hhmm.split(':');
  await page.selectOption(`#${id}-h`, h);
  await page.selectOption(`#${id}-m`, m);
}

/** Lit toute la base IndexedDB de l'app (pour les contrôles de sécurité). */
export async function dumpDb(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('application01', 1);
        req.onsuccess = () => {
          const tx = req.result.transaction('kv', 'readonly');
          const s = tx.objectStore('kv');
          const out = {};
          const c = s.openCursor();
          c.onsuccess = () => {
            const cur = c.result;
            if (cur) {
              out[cur.key] = cur.value;
              cur.continue();
            } else resolve(out);
          };
        };
        req.onerror = () => reject(req.error);
      }),
  );
}
