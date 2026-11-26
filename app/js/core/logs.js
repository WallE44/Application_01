// Journaux (EXG-14) : 200 derniers événements, datés. Aucune donnée sensible.
import { KEYS } from './store.js';

export const MAX_LOGS = 200;
export const LOG_TYPES = Object.freeze({ auth: 'Connexion', weather: 'Météo', error: 'Erreur', admin: 'Admin' });

export function createLogger(store, { now = () => Date.now(), max = MAX_LOGS } = {}) {
  let chain = Promise.resolve();
  return {
    /** Ajoute un événement (sérialisé pour éviter les pertes en cas d'appels simultanés). */
    log(type, message) {
      chain = chain.then(async () => {
        const list = (await store.get(KEYS.logs)) || [];
        list.push({ at: now(), type, message: String(message).slice(0, 300) });
        await store.set(KEYS.logs, list.slice(-max));
      }).catch(() => {
        /* un échec d'écriture du journal ne doit jamais bloquer l'application */
      });
      return chain;
    },
    /** Du plus récent au plus ancien. */
    async list() {
      await chain;
      return ((await store.get(KEYS.logs)) || []).slice().reverse();
    },
  };
}
