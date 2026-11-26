// Écrans Connexion (EXG-02) et premier lancement (création du compte administrateur).
import { PASSWORD_MIN } from '../../core/auth.js';
import { alertBox, h, mount } from '../dom.js';

export function renderSetup(view, ctx) {
  const msg = h('div');
  const username = h('input', { type: 'text', id: 'setup-user', autocomplete: 'username', required: true, autocapitalize: 'none' });
  const pw = h('input', { type: 'password', id: 'setup-pw', autocomplete: 'new-password', required: true, minlength: PASSWORD_MIN });
  const pw2 = h('input', { type: 'password', id: 'setup-pw2', autocomplete: 'new-password', required: true });
  const btn = h('button', { type: 'submit', class: 'primary block' }, 'Créer le compte administrateur');
  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        if (pw.value !== pw2.value) return mount(msg, alertBox('Les deux mots de passe ne correspondent pas'));
        btn.disabled = true;
        try {
          await ctx.auth.setupAdmin(username.value.trim(), pw.value);
          await ctx.auth.login(username.value.trim(), pw.value, true);
          ctx.go('/trajet');
        } catch (err) {
          mount(msg, alertBox(err.message));
        } finally {
          btn.disabled = false;
        }
      },
    },
    h('label', { for: 'setup-user' }, 'Identifiant'),
    username,
    h('label', { for: 'setup-pw' }, `Mot de passe (${PASSWORD_MIN} caractères minimum)`),
    pw,
    h('label', { for: 'setup-pw2' }, 'Confirmer le mot de passe'),
    pw2,
    msg,
    btn,
  );
  mount(
    view,
    h('h2', {}, 'Bienvenue'),
    h('p', { class: 'muted' }, 'Premier lancement : créez le compte administrateur de l’application. Il permettra ensuite de créer d’autres comptes.'),
    h('div', { class: 'card' }, form),
  );
  username.focus();
}

export function renderLogin(view, ctx) {
  const msg = h('div');
  const username = h('input', { type: 'text', id: 'login-user', autocomplete: 'username', required: true, autocapitalize: 'none' });
  const pw = h('input', { type: 'password', id: 'login-pw', autocomplete: 'current-password', required: true });
  const remember = h('input', { type: 'checkbox', id: 'login-remember' });
  const btn = h('button', { type: 'submit', class: 'primary block' }, 'Se connecter');
  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        btn.disabled = true;
        try {
          const r = await ctx.auth.login(username.value.trim(), pw.value, remember.checked);
          if (!r.ok) {
            pw.value = '';
            return mount(msg, alertBox(r.error));
          }
          ctx.go('/accueil');
        } finally {
          btn.disabled = false;
        }
      },
    },
    h('label', { for: 'login-user' }, 'Identifiant'),
    username,
    h('label', { for: 'login-pw' }, 'Mot de passe'),
    pw,
    h('label', { class: 'check', for: 'login-remember' }, remember, 'Rester connecté'),
    msg,
    btn,
  );
  mount(view, h('h2', {}, 'Connexion'), h('div', { class: 'card' }, form));
}
