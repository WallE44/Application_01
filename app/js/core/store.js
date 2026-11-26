// Stockage clé/valeur local (IndexedDB dans le navigateur et le service worker, mémoire pour les tests).
// Aucune donnée ne quitte le téléphone.

export function memoryStore(initial = {}) {
  const map = new Map(Object.entries(structuredClone(initial)));
  return {
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : undefined;
    },
    async set(key, value) {
      map.set(key, structuredClone(value));
    },
    async del(key) {
      map.delete(key);
    },
    async keys() {
      return [...map.keys()];
    },
  };
}

const DB_NAME = 'application01';
const STORE = 'kv';

function openDb(indexedDB) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbStore(indexedDB = globalThis.indexedDB) {
  let dbp;
  const db = () => (dbp ??= openDb(indexedDB));
  const run = async (mode, fn) => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    get: (key) => run('readonly', (s) => s.get(key)),
    set: (key, value) => run('readwrite', (s) => s.put(value, key)),
    del: (key) => run('readwrite', (s) => s.delete(key)),
    keys: () => run('readonly', (s) => s.getAllKeys()),
  };
}

export const KEYS = Object.freeze({
  accounts: 'accounts',
  settings: 'settings',
  logs: 'logs',
  session: 'session',
  notify: 'notify',
  trip: (userId) => `trip:${userId}`,
  forecast: (userId) => `forecast:${userId}`,
  loginGuard: 'loginGuard',
});
