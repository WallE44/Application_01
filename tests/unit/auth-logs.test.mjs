import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth, canAccess, MAX_FAILED, LOCK_MS, REMEMBER_MS } from '../../app/js/core/auth.js';
import { hashPassword, verifyPassword, DEFAULT_ITERATIONS } from '../../app/js/core/crypto.js';
import { createLogger, MAX_LOGS } from '../../app/js/core/logs.js';
import { memoryStore, KEYS } from '../../app/js/core/store.js';

function setup() {
  let t = Date.UTC(2026, 10, 27, 6);
  const clock = { now: () => t, advance: (ms) => (t += ms) };
  const store = memoryStore();
  const volatile = memoryStore();
  const logger = createLogger(store, { now: clock.now });
  const auth = createAuth({ store, volatile, logger, now: clock.now, iterations: 1000 });
  return { store, volatile, logger, auth, clock };
}

test('ENF-01 PBKDF2 salé, vérification, jamais de clair', async () => {
  assert.ok(DEFAULT_ITERATIONS >= 300000);
  const r1 = await hashPassword('motdepasse1', { iterations: 1000 });
  const r2 = await hashPassword('motdepasse1', { iterations: 1000 });
  assert.equal(r1.algo, 'PBKDF2-SHA256');
  assert.equal(r1.salt.length, 32);
  assert.notEqual(r1.salt, r2.salt);
  assert.notEqual(r1.hash, r2.hash, 'sel différent → hash différent');
  assert.equal(await verifyPassword('motdepasse1', r1), true);
  assert.equal(await verifyPassword('motdepasse2', r1), false);
  assert.equal(await verifyPassword('x', null), false);
  assert.equal(await verifyPassword('x', { ...r1, hash: 'ab' }), false);
});

test('EXG-02 premier lancement, connexion, mauvais mot de passe refusé', async () => {
  const { auth, store } = setup();
  assert.equal(await auth.hasAccounts(), false);
  await assert.rejects(auth.createAccount({ username: 'bob', password: '12345678', role: 'user' }), /administrateur/);
  await auth.setupAdmin('roland', 'Secret#2026');
  await assert.rejects(auth.setupAdmin('autre', 'Secret#2026'), /existe déjà/);
  assert.equal((await auth.login('roland', 'mauvais!!', false)).ok, false);
  const ok = await auth.login('ROLAND', 'Secret#2026', false);
  assert.equal(ok.ok, true);
  assert.equal(ok.user.role, 'admin');
  assert.equal(ok.user.password, undefined, 'le hash n’est jamais exposé');
  const dump = JSON.stringify(await Promise.all((await store.keys()).map((k) => store.get(k))));
  assert.equal(dump.includes('Secret#2026'), false, 'mot de passe jamais en clair (stockage + journaux)');
  assert.equal(dump.includes('mauvais!!'), false);
});

test('EXG-02 « rester connecté » : session persistante vs session volatile', async () => {
  const { auth, store, volatile, clock } = setup();
  await auth.setupAdmin('roland', 'Secret#2026');
  await auth.login('roland', 'Secret#2026', true);
  assert.ok(await store.get(KEYS.session));
  await volatile.del(KEYS.session); // simulateur de redémarrage : la mémoire volatile est perdue
  assert.equal((await auth.currentUser()).username, 'roland', 'toujours connecté après redémarrage');
  clock.advance(REMEMBER_MS + 1);
  assert.equal(await auth.currentUser(), null, 'session expirée');

  await auth.login('roland', 'Secret#2026', false);
  assert.equal(await store.get(KEYS.session), undefined);
  assert.equal((await auth.currentUser()).username, 'roland');
  await volatile.del(KEYS.session); // redémarrage
  assert.equal(await auth.currentUser(), null, 'sans l’option, nouvelle saisie requise');
});

test('Sécurité : blocage après 5 échecs pendant 30 s', async () => {
  const { auth, clock } = setup();
  await auth.setupAdmin('roland', 'Secret#2026');
  for (let i = 0; i < MAX_FAILED; i++) await auth.login('roland', 'faux-faux', false);
  const locked = await auth.login('roland', 'Secret#2026', false);
  assert.equal(locked.ok, false);
  assert.match(locked.error, /Trop d'essais/);
  clock.advance(LOCK_MS + 1);
  assert.equal((await auth.login('roland', 'Secret#2026', false)).ok, true);
});

test('EXG-03 créer, modifier, supprimer un compte et son profil', async () => {
  const { auth, store } = setup();
  const admin = await auth.setupAdmin('roland', 'Secret#2026');
  const u = await auth.createAccount({ username: 'marie', password: 'Password1', role: 'user' });
  await assert.rejects(auth.createAccount({ username: 'Marie', password: 'Password1', role: 'user' }), /existe déjà/);
  await assert.rejects(auth.createAccount({ username: 'x', password: 'Password1', role: 'user' }), /Identifiant/);
  await assert.rejects(auth.createAccount({ username: 'paul', password: 'court', role: 'user' }), /8 caractères/);
  await assert.rejects(auth.createAccount({ username: 'paul', password: 'Password1', role: 'root' }), /Profil/);
  assert.equal((await auth.listAccounts()).length, 2);

  await auth.updateAccount(u.id, { role: 'admin' });
  assert.equal((await auth.listAccounts()).find((a) => a.id === u.id).role, 'admin');
  await auth.updateAccount(u.id, { role: 'user', password: 'NouveauMdp1' });
  assert.equal((await auth.login('marie', 'NouveauMdp1', false)).ok, true);
  await assert.rejects(auth.updateAccount('nope', { role: 'user' }), /introuvable/);
  await assert.rejects(auth.updateAccount(admin.id, { role: 'user' }), /au moins un administrateur/);
  await assert.rejects(auth.updateAccount(u.id, { password: 'court' }), /8 caractères/);
  await auth.updateAccount(u.id, { password: '' }); // vide = inchangé

  await store.set(KEYS.trip(u.id), { x: 1 });
  await assert.rejects(auth.deleteAccount(admin.id, admin.id), /propre compte/);
  await assert.rejects(auth.deleteAccount(admin.id, u.id), /au moins un administrateur/);
  await assert.rejects(auth.deleteAccount('nope', admin.id), /introuvable/);
  await auth.deleteAccount(u.id, admin.id);
  assert.equal((await auth.listAccounts()).length, 1);
  assert.equal(await store.get(KEYS.trip(u.id)), undefined, 'données du compte supprimées');
});

test('ENF-02 un compte utilisateur n’accède pas aux écrans admin ; profil relu à chaque fois', async () => {
  const { auth } = setup();
  await auth.setupAdmin('roland', 'Secret#2026');
  const u = await auth.createAccount({ username: 'marie', password: 'Password1', role: 'user' });
  await auth.login('marie', 'Password1', true);
  const me = await auth.currentUser();
  assert.equal(canAccess(me, 'admin'), false);
  assert.equal(canAccess(me, 'user'), true);
  assert.equal(canAccess(null, 'user'), false);
  await auth.updateAccount(u.id, { role: 'admin' });
  assert.equal(canAccess(await auth.currentUser(), 'admin'), true, 'changement de profil pris en compte');
});

test('Compte supprimé → session invalidée ; déconnexion', async () => {
  const { auth } = setup();
  const admin = await auth.setupAdmin('roland', 'Secret#2026');
  const u = await auth.createAccount({ username: 'marie', password: 'Password1', role: 'user' });
  await auth.login('marie', 'Password1', true);
  await auth.deleteAccount(u.id, admin.id);
  assert.equal(await auth.currentUser(), null);
  await auth.login('roland', 'Secret#2026', true);
  await auth.logout();
  assert.equal(await auth.currentUser(), null);
  await auth.logout(); // sans session : sans erreur
});

test('EXG-14 journaux : 200 derniers, datés, du plus récent au plus ancien', async () => {
  const store = memoryStore();
  let t = 1000;
  const logger = createLogger(store, { now: () => t++ });
  await Promise.all(Array.from({ length: 250 }, (_, i) => logger.log('weather', `evt ${i}`)));
  const list = await logger.list();
  assert.equal(list.length, MAX_LOGS);
  assert.equal(list[0].message, 'evt 249');
  assert.equal(list.at(-1).message, 'evt 50');
  assert.ok(list.every((e) => Number.isFinite(e.at) && e.type === 'weather'));
  await logger.log('error', 'x'.repeat(1000));
  assert.equal((await logger.list())[0].message.length, 300);
});

test('EXG-14 les connexions sont journalisées', async () => {
  const { auth, logger } = setup();
  await auth.setupAdmin('roland', 'Secret#2026');
  await auth.login('roland', 'faux-faux', false);
  await auth.login('roland', 'Secret#2026', false);
  const msgs = (await logger.list()).map((e) => e.message);
  assert.ok(msgs.some((m) => m.startsWith('Échec de connexion')));
  assert.ok(msgs.some((m) => m.startsWith('Connexion de « roland »')));
});
