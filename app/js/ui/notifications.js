// Notification quotidienne côté page (EXG-11).
// Sans serveur, deux mécanismes complémentaires :
//  1. page ouverte ou en arrière-plan récent : vérification chaque minute ;
//  2. application fermée : Periodic Background Sync de Chrome (le navigateur choisit le moment).
import { maybeNotify } from '../core/notifier.js';
import { KEYS } from '../core/store.js';

export const PERIODIC_TAG = 'verdict-quotidien';

export function notificationSupport() {
  return {
    notifications: 'Notification' in window,
    serviceWorker: 'serviceWorker' in navigator,
    periodicSync: 'serviceWorker' in navigator && 'periodicSync' in ServiceWorkerRegistration.prototype,
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
  };
}

/**
 * État de l'autorisation. On consulte aussi l'API Permissions : certains Chromium
 * (mode sans écran notamment) laissent Notification.permission en retard sur l'état réel.
 */
export async function notificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    const st = await navigator.permissions.query({ name: 'notifications' });
    if (st.state === 'granted') return 'granted';
  } catch {
    /* API Permissions indisponible */
  }
  return Notification.permission;
}

async function show(title, options) {
  const reg = await navigator.serviceWorker.ready;
  return reg.showNotification(title, options);
}

let inFlight = null;
/** Vérifie si la notification est due ; un seul contrôle à la fois (pas de doublon). */
export function checkNow(ctx) {
  inFlight ??= (async () => {
    if ((await notificationPermission()) !== 'granted') return 'disabled';
    try {
      return await maybeNotify({ store: ctx.store, logger: ctx.logger, show });
    } catch (e) {
      await ctx.logger.log('error', `Notification : ${e.message}`);
      return 'error';
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export async function enableNotifications(ctx) {
  if (!('Notification' in window)) throw new Error('Notifications non prises en charge par ce navigateur');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Autorisation de notification refusée');
  const prev = (await ctx.store.get(KEYS.notify)) || {};
  await ctx.store.set(KEYS.notify, { ...prev, enabled: true, userId: ctx.user.id });
  let periodic = false;
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await reg.periodicSync.register(PERIODIC_TAG, { minInterval: 60 * 60 * 1000 });
        periodic = true;
      }
    }
  } catch (e) {
    await ctx.logger.log('error', `Synchronisation périodique : ${e.message}`);
  }
  await ctx.logger.log('admin', `Notifications activées${periodic ? ' (synchronisation périodique)' : ' (page ouverte uniquement)'}`);
  return { periodic };
}

export async function disableNotifications(ctx) {
  const prev = (await ctx.store.get(KEYS.notify)) || {};
  await ctx.store.set(KEYS.notify, { ...prev, enabled: false });
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) await reg.periodicSync.unregister(PERIODIC_TAG);
  } catch {
    /* rien à faire */
  }
  await ctx.logger.log('admin', 'Notifications désactivées');
}

export function startNotificationScheduler(ctx) {
  const tick = () => checkNow(ctx);
  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());
  tick();
}
