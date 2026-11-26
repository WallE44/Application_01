// Comptes, profils et sessions (EXG-02, EXG-03, ENF-01, ENF-02).
import { hashPassword, randomHex, verifyPassword, DEFAULT_ITERATIONS } from './crypto.js';
import { KEYS } from './store.js';

export const ROLES = Object.freeze({ admin: 'Administrateur', user: 'Utilisateur' });
export const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
export const PASSWORD_MIN = 8;
export const MAX_FAILED = 5;
export const LOCK_MS = 30 * 1000;
export const REMEMBER_MS = 90 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

function checkUsername(u) {
  if (!USERNAME_RE.test(u ?? '')) {
    throw new AuthError('Identifiant : 3 à 32 caractères (lettres, chiffres, point, tiret, souligné)');
  }
}
function checkPassword(p) {
  if (typeof p !== 'string' || p.length < PASSWORD_MIN) {
    throw new AuthError(`Mot de passe : au moins ${PASSWORD_MIN} caractères`);
  }
}
function checkRole(r) {
  if (!Object.hasOwn(ROLES, r ?? '')) throw new AuthError('Profil inconnu');
}
const publicAccount = ({ id, username, role, createdAt }) => ({ id, username, role, createdAt });

/**
 * @param store    stockage persistant (IndexedDB)
 * @param volatile stockage de session non persistant ({get,set,del}), ex. sessionStorage
 */
export function createAuth({ store, volatile, logger, now = () => Date.now(), iterations = DEFAULT_ITERATIONS }) {
  const accounts = async () => (await store.get(KEYS.accounts)) || [];
  const saveAccounts = (list) => store.set(KEYS.accounts, list);
  const log = (type, msg) => logger?.log(type, msg);

  async function adminCount(list) {
    return list.filter((a) => a.role === 'admin').length;
  }

  const api = {
    async hasAccounts() {
      return (await accounts()).length > 0;
    },

    /** Premier lancement : création du compte administrateur. */
    async setupAdmin(username, password) {
      if (await api.hasAccounts()) throw new AuthError('Le compte administrateur existe déjà');
      const acc = await api.createAccount({ username, password, role: 'admin' }, { bootstrap: true });
      await log('admin', `Compte administrateur initial « ${acc.username} » créé`);
      return acc;
    },

    async login(username, password, remember) {
      const guard = (await store.get(KEYS.loginGuard)) || { failed: 0, lockedUntil: 0 };
      if (guard.lockedUntil > now()) {
        const s = Math.ceil((guard.lockedUntil - now()) / 1000);
        await log('auth', `Connexion bloquée (trop d'essais) pour « ${String(username).slice(0, 32)} »`);
        return { ok: false, error: `Trop d'essais. Réessayez dans ${s} s.` };
      }
      const acc = (await accounts()).find((a) => a.username.toLowerCase() === String(username).toLowerCase());
      const good = acc ? await verifyPassword(password, acc.password) : false;
      if (!good) {
        guard.failed += 1;
        if (guard.failed >= MAX_FAILED) {
          guard.failed = 0;
          guard.lockedUntil = now() + LOCK_MS;
        }
        await store.set(KEYS.loginGuard, guard);
        await log('auth', `Échec de connexion pour « ${String(username).slice(0, 32)} »`);
        return { ok: false, error: 'Identifiant ou mot de passe incorrect' };
      }
      await store.set(KEYS.loginGuard, { failed: 0, lockedUntil: 0 });
      const session = { token: randomHex(16), userId: acc.id, createdAt: now(), remember: !!remember };
      if (remember) {
        session.expiresAt = now() + REMEMBER_MS;
        await store.set(KEYS.session, session);
        await volatile.del(KEYS.session);
      } else {
        await store.del(KEYS.session);
        await volatile.set(KEYS.session, session);
      }
      await log('auth', `Connexion de « ${acc.username} » (${ROLES[acc.role]})${remember ? ', rester connecté' : ''}`);
      return { ok: true, user: publicAccount(acc) };
    },

    /** Utilisateur courant, relu dans la liste des comptes (le profil fait foi à chaque appel). */
    async currentUser() {
      let session = await volatile.get(KEYS.session);
      if (!session) {
        session = await store.get(KEYS.session);
        if (session && !(session.expiresAt > now())) {
          await store.del(KEYS.session);
          session = null;
        }
      }
      if (!session) return null;
      const acc = (await accounts()).find((a) => a.id === session.userId);
      if (!acc) {
        await api.logout();
        return null;
      }
      return publicAccount(acc);
    },

    async logout() {
      const user = await api.currentUserRaw();
      await volatile.del(KEYS.session);
      await store.del(KEYS.session);
      if (user) await log('auth', `Déconnexion de « ${user.username} »`);
    },

    async currentUserRaw() {
      const session = (await volatile.get(KEYS.session)) || (await store.get(KEYS.session));
      if (!session) return null;
      return (await accounts()).find((a) => a.id === session.userId) || null;
    },

    async listAccounts() {
      return (await accounts()).map(publicAccount);
    },

    async createAccount({ username, password, role }, { bootstrap = false } = {}) {
      checkUsername(username);
      checkPassword(password);
      checkRole(role);
      const list = await accounts();
      if (!bootstrap && list.length === 0) throw new AuthError('Créez d’abord le compte administrateur');
      if (list.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
        throw new AuthError('Cet identifiant existe déjà');
      }
      const acc = {
        id: randomHex(8),
        username,
        role,
        createdAt: now(),
        password: await hashPassword(password, { iterations }),
      };
      list.push(acc);
      await saveAccounts(list);
      if (!bootstrap) await log('admin', `Compte « ${username} » créé (${ROLES[role]})`);
      return publicAccount(acc);
    },

    async updateAccount(id, { role, password }) {
      const list = await accounts();
      const acc = list.find((a) => a.id === id);
      if (!acc) throw new AuthError('Compte introuvable');
      if (role !== undefined) {
        checkRole(role);
        if (acc.role === 'admin' && role !== 'admin' && (await adminCount(list)) === 1) {
          throw new AuthError('Impossible : il doit rester au moins un administrateur');
        }
        acc.role = role;
      }
      if (password !== undefined && password !== '') {
        checkPassword(password);
        acc.password = await hashPassword(password, { iterations });
      }
      await saveAccounts(list);
      await log('admin', `Compte « ${acc.username} » modifié${role !== undefined ? ` (profil ${ROLES[acc.role]})` : ''}${password ? ', mot de passe changé' : ''}`);
      return publicAccount(acc);
    },

    async deleteAccount(id, actorId) {
      const list = await accounts();
      const acc = list.find((a) => a.id === id);
      if (!acc) throw new AuthError('Compte introuvable');
      if (id === actorId) throw new AuthError('Vous ne pouvez pas supprimer votre propre compte');
      if (acc.role === 'admin' && (await adminCount(list)) === 1) {
        throw new AuthError('Impossible : il doit rester au moins un administrateur');
      }
      await saveAccounts(list.filter((a) => a.id !== id));
      await store.del(KEYS.trip(id));
      await store.del(KEYS.forecast(id));
      await log('admin', `Compte « ${acc.username} » supprimé`);
    },
  };
  return api;
}

/** ENF-02 : garde d'accès aux écrans admin. */
export function canAccess(user, routeRole) {
  if (!user) return false;
  if (routeRole === 'admin') return user.role === 'admin';
  return true;
}
