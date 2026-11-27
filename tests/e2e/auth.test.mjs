// Tests fonctionnels : connexion, profils, sécurité (EXG-02, EXG-03, ENF-01, ENF-02).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dumpDb, FRIDAY_0700, login, setClock, setupAdmin, shot, startEnv } from './helpers.mjs';

test('EXG-02 premier lancement, déconnexion, mauvais mot de passe refusé, connexion', async () => {
  const env = await startEnv();
  const { page, base } = env;
  try {
    await setClock(env, FRIDAY_0700);
    await page.goto(base);
    await page.waitForSelector('#setup-user');
    await shot(page, '01-premier-lancement');
    await setupAdmin(page, base);
    await page.goto(base + '#/preferences');
    await page.click('#logout');
    await page.waitForSelector('#login-user');
    await login(page, 'user_01', 'mauvais-mdp');
    await page.waitForSelector('[role=alert]');
    assert.match(await page.textContent('[role=alert]'), /Identifiant ou mot de passe incorrect/);
    await shot(page, '02-connexion-refusee');
    await login(page, 'user_01', 'Secret#2026');
    await page.waitForSelector('#nav a:has-text("Accueil")');
    assert.equal(new URL(page.url()).hash, '#/accueil');
  } finally {
    await env.close();
  }
});

test('EXG-02 « rester connecté » : pas de nouvelle saisie après redémarrage ; sans l’option, saisie requise', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pluie-persist-'));
  let env = await startEnv({ persistent: true, userDataDir: dir });
  const base = env.base;
  try {
    await setupAdmin(env.page, base); // la création connecte avec « rester connecté »
  } finally {
    await env.context.close();
  }
  // Redémarrage du navigateur (même profil, nouveau serveur → même origine requise : on réutilise le port)
  env.server.close();
  const { serve } = await import('../../scripts/serve.mjs');
  const port = new URL(base).port;
  const { chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright');
  const restart = async () => {
    const server = await serve(join(import.meta.dirname, '..', '..', 'app'), Number(port));
    const context = await chromium.launchPersistentContext(dir, { viewport: { width: 384, height: 854 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    await context.route('https://**', (r) => r.abort());
    const page = context.pages()[0] ?? (await context.newPage());
    return { server, context, page };
  };
  let r = await restart();
  try {
    await r.page.goto(base);
    await r.page.waitForSelector('#nav a:has-text("Accueil")');
    assert.equal(await r.page.isVisible('#login-user'), false, 'toujours connecté après redémarrage');
    // Déconnexion puis connexion SANS l'option
    await r.page.goto(base + '#/preferences');
    await r.page.click('#logout');
    await login(r.page, 'user_01', 'Secret#2026', false);
    await r.page.waitForSelector('#nav a:has-text("Accueil")');
  } finally {
    await r.context.close();
    r.server.close();
  }
  r = await restart();
  try {
    await r.page.goto(base);
    await r.page.waitForSelector('#login-user');
    assert.ok(await r.page.isVisible('#login-user'), 'sans l’option : identifiants redemandés');
  } finally {
    await r.context.close();
    r.server.close();
  }
});

test('EXG-03 / ENF-02 gestion des comptes ; un compte utilisateur ne voit ni n’ouvre les écrans admin', async () => {
  const env = await startEnv();
  const { page, base } = env;
  try {
    await setupAdmin(page, base);
    await page.goto(base + '#/admin/comptes');
    await page.fill('#new-user', 'marie');
    await page.fill('#new-pw', 'Password1');
    await page.selectOption('#new-role', 'user');
    await page.click('#create-account');
    await page.waitForSelector('text=Compte « marie » créé.');
    await page.fill('#new-user', 'paul');
    await page.fill('#new-pw', 'Password2');
    await page.click('#create-account');
    await page.waitForSelector('text=Compte « paul » créé.');
    assert.equal(await page.locator('#accounts li').count(), 3);
    await shot(page, '03-admin-comptes');

    // Modification du profil et suppression (avec confirmation)
    await page.selectOption('#role-paul', 'admin');
    await page.click('li[data-username=paul] button:has-text("Enregistrer")');
    await page.waitForSelector('text=Compte « paul » modifié.');
    assert.equal(await page.inputValue('#role-paul'), 'admin');
    await page.click('#del-paul');
    await page.click('#del-paul'); // confirmation
    await page.waitForSelector('text=Compte « paul » supprimé.');
    assert.equal(await page.locator('#accounts li').count(), 2);
    // Pas de bouton de suppression sur son propre compte
    assert.equal(await page.locator('#del-user_01').count(), 0);

    // Connexion en utilisateur
    await page.goto(base + '#/preferences');
    await page.click('#logout');
    await login(page, 'marie', 'Password1');
    await page.waitForSelector('#nav a:has-text("Accueil")');
    assert.equal(await page.locator('#nav a:has-text("Admin")').count(), 0, 'menu Admin absent');
    for (const p of ['/admin/parametres', '/admin/comptes', '/admin/journaux']) {
      await page.goto(base + '#' + p);
      await page.waitForSelector('h2:has-text("Accès refusé")');
      assert.equal(await page.locator('#accounts, #save-params, #logs').count(), 0);
    }
    await shot(page, '04-acces-admin-refuse');
  } finally {
    await env.close();
  }
});

test('ENF-01 mots de passe hachés (PBKDF2 + sel), jamais en clair dans le stockage ni les journaux', async () => {
  const env = await startEnv();
  const { page, base } = env;
  try {
    await setupAdmin(page, base, 'user_01', 'Secret#2026');
    await page.goto(base + '#/admin/comptes');
    await page.fill('#new-user', 'marie');
    await page.fill('#new-pw', 'MotDePasseMarie');
    await page.click('#create-account');
    await page.waitForSelector('text=Compte « marie » créé.');
    await page.goto(base + '#/preferences');
    await page.click('#logout');
    await login(page, 'marie', 'EssaiFaux123');
    await page.waitForSelector('[role=alert]');
    const db = await dumpDb(page);
    const all = JSON.stringify(db) + (await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })));
    for (const secret of ['Secret#2026', 'MotDePasseMarie', 'EssaiFaux123']) assert.equal(all.includes(secret), false, `${secret} trouvé en clair`);
    for (const acc of db.accounts) {
      assert.equal(acc.password.algo, 'PBKDF2-SHA256');
      assert.ok(acc.password.iterations >= 300000);
      assert.equal(acc.password.salt.length, 32);
      assert.equal(acc.password.hash.length, 64);
    }
    assert.notEqual(db.accounts[0].password.salt, db.accounts[1].password.salt);
  } finally {
    await env.close();
  }
});
