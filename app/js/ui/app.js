// Point d'entrée : routeur par hash, garde des profils (ENF-02), navigation.
import { createAuth, canAccess } from '../core/auth.js';
import { createLogger } from '../core/logs.js';
import { idbStore } from '../core/store.js';
import { h, mount, sessionStore } from './dom.js';
import { renderLogin, renderSetup } from './screens/auth.js';
import { renderHome } from './screens/home.js';
import { renderTrip } from './screens/trip.js';
import { renderPrefs } from './screens/prefs.js';
import { renderAdminAccounts, renderAdminLogs, renderAdminParams } from './screens/admin.js';
import { startNotificationScheduler } from './notifications.js';

export const APP_VERSION = '1.0.1';

const ROUTES = {
  '/accueil': { render: renderHome, role: 'user', title: 'Accueil' },
  '/trajet': { render: renderTrip, role: 'user', title: 'Mon trajet' },
  '/preferences': { render: renderPrefs, role: 'user', title: 'Préférences' },
  '/admin/parametres': { render: renderAdminParams, role: 'admin', title: 'Paramètres admin' },
  '/admin/comptes': { render: renderAdminAccounts, role: 'admin', title: 'Comptes' },
  '/admin/journaux': { render: renderAdminLogs, role: 'admin', title: 'Journaux' },
};

const NAV = [
  { path: '/accueil', label: 'Accueil', ico: '☂' },
  { path: '/trajet', label: 'Trajet', ico: '⇄' },
  { path: '/preferences', label: 'Préférences', ico: '⚙' },
  { path: '/admin/parametres', label: 'Admin', ico: '★', admin: true },
];

const store = idbStore();
const volatile = sessionStore();
const logger = createLogger(store);
const auth = createAuth({ store, volatile, logger });

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const who = document.getElementById('who');
const banner = document.getElementById('banner');

const ctx = {
  store,
  auth,
  logger,
  version: APP_VERSION,
  user: null,
  go(path) {
    if (location.hash === `#${path}`) route();
    else location.hash = `#${path}`;
  },
  setBanner(message) {
    banner.textContent = message || '';
    banner.hidden = !message;
  },
};

function currentPath() {
  const p = location.hash.replace(/^#/, '') || '/accueil';
  return p.split('?')[0];
}

function renderNav(path) {
  if (!ctx.user) {
    nav.hidden = true;
    who.textContent = '';
    return;
  }
  who.textContent = `${ctx.user.username} · ${ctx.user.role === 'admin' ? 'admin' : 'utilisateur'}`;
  nav.hidden = false;
  mount(
    nav,
    NAV.filter((n) => !n.admin || ctx.user.role === 'admin').map((n) =>
      h(
        'a',
        { href: `#${n.path}`, 'aria-current': (n.admin ? path.startsWith('/admin') : path === n.path) ? 'page' : null },
        h('span', { class: 'ico', 'aria-hidden': 'true' }, n.ico),
        n.label,
      ),
    ),
  );
}

let routing = 0;
async function route() {
  const id = ++routing;
  const path = currentPath();
  ctx.setBanner('');
  try {
    if (!(await auth.hasAccounts())) {
      ctx.user = null;
      renderNav(path);
      return renderSetup(view, ctx);
    }
    ctx.user = await auth.currentUser();
    if (id !== routing) return;
    if (!ctx.user) {
      renderNav(path);
      if (path !== '/connexion') history.replaceState(null, '', '#/connexion');
      return renderLogin(view, ctx);
    }
    if (path === '/connexion' || path === '/') return ctx.go('/accueil');
    const r = ROUTES[path];
    renderNav(path);
    if (!r) return ctx.go('/accueil');
    document.title = `${r.title} · Pluie Trajet`;
    if (!canAccess(ctx.user, r.role)) {
      await logger.log('auth', `Accès refusé à ${path} pour « ${ctx.user.username} »`);
      return mount(
        view,
        h('h2', {}, 'Accès refusé'),
        h('p', { class: 'muted' }, 'Cet écran est réservé au profil administrateur.'),
        h('a', { class: 'btn primary', href: '#/accueil' }, 'Retour à l’accueil'),
      );
    }
    // Chaque écran dessine dans son propre conteneur : un rendu asynchrone d'un écran
    // quitté entre-temps écrit dans un nœud détaché et n'écrase pas l'écran courant.
    const screen = h('div', { class: 'screen' });
    mount(view, screen);
    await r.render(screen, ctx);
  } catch (e) {
    console.error(e);
    await logger.log('error', `Écran ${path} : ${e.message}`);
    mount(view, h('h2', {}, 'Une erreur est survenue'), h('p', { class: 'muted' }, e.message), h('button', { class: 'primary', onclick: () => route() }, 'Réessayer'));
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('online', () => ctx.setBanner(''));
window.addEventListener('offline', () => ctx.setBanner('Hors ligne : affichage de la dernière prévision enregistrée.'));
window.addEventListener('error', (e) => logger.log('error', `JS : ${e.message}`));
window.addEventListener('unhandledrejection', (e) => logger.log('error', `JS : ${e.reason?.message ?? e.reason}`));

if ('serviceWorker' in navigator) {
  // ANO-03 : quand une nouvelle version prend la main, on recharge une fois pour l'afficher tout de suite
  // (pas au tout premier lancement, où il n'y avait pas encore de version installée).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { type: 'module' }).catch((e) => logger.log('error', `Service worker : ${e.message}`));
}

route();
startNotificationScheduler(ctx);
