// Notification quotidienne (EXG-11), partagée entre la page et le service worker.
import { hourKey, shouldNotify } from './rules.js';
import { getDayReport, loadSettings, notificationText } from './service.js';
import { KEYS } from './store.js';

/**
 * Envoie la notification du jour si elle est due.
 * @param show (title, options) => Promise — registration.showNotification
 * @returns 'sent' | 'not-due' | 'disabled' | 'no-data'
 */
export async function maybeNotify({ store, logger, show, now = Date.now(), fetchImpl }) {
  const cfg = await store.get(KEYS.notify);
  if (!cfg?.enabled || !cfg.userId) return 'disabled';
  const trip = await store.get(KEYS.trip(cfg.userId));
  const settings = await loadSettings(store);
  const date = new Date(now);
  if (!shouldNotify({ now: date, trip, settings, lastNotifiedDay: cfg.lastNotifiedDay })) return 'not-due';
  // RG-07 : rafraîchissement avant la notification (repli sur le cache si pas de réseau)
  const report = await getDayReport({ store, logger, userId: cfg.userId, refresh: true, fetchImpl, now });
  if (report.status !== 'ok') return 'no-data';
  // Revérification après l'appel réseau : un autre déclencheur (page / service worker) a pu notifier entre-temps.
  const latest = await store.get(KEYS.notify);
  if (latest?.lastNotifiedDay === hourKey(date).slice(0, 10)) return 'not-due';
  const { title, body } = notificationText(report);
  // Le jour est marqué AVANT l'affichage : une seule tentative par jour, jamais de doublon.
  await store.set(KEYS.notify, { ...latest, lastNotifiedDay: hourKey(date).slice(0, 10) });
  try {
    await show(title, { body, tag: 'verdict-du-jour', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './#/accueil' } });
  } catch (e) {
    await logger?.log('error', `Notification non affichée : ${e.message}`);
    return 'error';
  }
  await logger?.log('weather', `Notification envoyée : ${title}`);
  return 'sent';
}

/** Millisecondes jusqu'à la prochaine heure de notification (page ouverte). */
export function msUntilNext(hhmm, now = Date.now()) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(now);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
  if (target.getTime() <= now) target.setDate(target.getDate() + 1);
  return target.getTime() - now;
}
