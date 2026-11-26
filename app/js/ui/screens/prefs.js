// Préférences (EXG-15, déconnexion) et activation des notifications (EXG-11).
import { KEYS } from '../../core/store.js';
import { alertBox, h, mount } from '../dom.js';
import { disableNotifications, enableNotifications, notificationPermission, notificationSupport } from '../notifications.js';

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem('theme', t);
  } catch {
    /* préférence non mémorisée */
  }
}

export async function renderPrefs(view, ctx) {
  const msg = h('div');
  const dark = h('input', { type: 'checkbox', id: 'theme-dark', checked: currentTheme() === 'dark', onchange: () => setTheme(dark.checked ? 'dark' : 'light') });

  const sup = notificationSupport();
  sup.permission = await notificationPermission();
  const cfg = (await ctx.store.get(KEYS.notify)) || {};
  const enabled = !!cfg.enabled && sup.permission === 'granted';
  const status = h(
    'p',
    { class: 'muted small', id: 'notif-status' },
    !sup.notifications
      ? 'Notifications non prises en charge par ce navigateur.'
      : enabled
        ? 'Notifications activées sur cet appareil.'
        : sup.permission === 'denied'
          ? 'Notifications bloquées : autorisez-les dans les réglages du site (Chrome).'
          : 'Notifications désactivées.',
  );
  const notifBtn = h(
    'button',
    {
      type: 'button',
      id: 'notif-toggle',
      class: enabled ? '' : 'primary',
      disabled: !sup.notifications,
      onclick: async () => {
        notifBtn.disabled = true;
        try {
          if (enabled) {
            await disableNotifications(ctx);
          } else {
            const r = await enableNotifications(ctx);
            if (!r.periodic) {
              mount(msg, alertBox('Notifications activées. Chrome n’a pas autorisé la vérification en arrière-plan : la notification arrivera si l’application est ouverte ou récemment utilisée.', 'warn'));
              return;
            }
          }
          renderPrefs(view, ctx);
        } catch (e) {
          mount(msg, alertBox(e.message));
        } finally {
          notifBtn.disabled = false;
        }
      },
    },
    enabled ? 'Désactiver les notifications' : 'Activer les notifications',
  );

  mount(
    view,
    h('h2', {}, 'Préférences'),
    h('div', { class: 'card' }, h('h3', {}, 'Affichage'), h('label', { class: 'check', for: 'theme-dark' }, dark, 'Thème sombre')),
    h('div', { class: 'card' }, h('h3', {}, 'Notification quotidienne'), h('p', { class: 'small' }, 'Le verdict du jour est envoyé à l’heure réglée par l’administrateur, les jours de travail.'), status, notifBtn),
    msg,
    h(
      'div',
      { class: 'card' },
      h('h3', {}, 'Compte'),
      h('p', { class: 'small' }, `Connecté en tant que ${ctx.user.username} (${ctx.user.role === 'admin' ? 'administrateur' : 'utilisateur'}).`),
      h('button', { type: 'button', class: 'danger block', id: 'logout', onclick: async () => { await ctx.auth.logout(); ctx.go('/connexion'); } }, 'Se déconnecter'),
    ),
    h('p', { class: 'muted small' }, `Pluie Trajet v${ctx.version} · météo Open-Meteo · adresses API Adresse · carte © OpenStreetMap`),
  );
}
