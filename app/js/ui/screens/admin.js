// Écrans administrateur : paramètres (EXG-13), comptes (EXG-03), journaux (EXG-14).
import { ROLES } from '../../core/auth.js';
import { LOG_TYPES } from '../../core/logs.js';
import { loadSettings } from '../../core/service.js';
import { DEFAULT_SETTINGS, validateSettings, WEATHER_SOURCES } from '../../core/settings.js';
import { KEYS } from '../../core/store.js';
import { alertBox, fmtDateTime, h, mount, timeInput } from '../dom.js';

function subnav(current) {
  const items = [
    ['/admin/parametres', 'Paramètres'],
    ['/admin/comptes', 'Comptes'],
    ['/admin/journaux', 'Journaux'],
  ];
  return h('nav', { class: 'subnav', 'aria-label': 'Administration' }, items.map(([p, l]) => h('a', { href: `#${p}`, 'aria-current': p === current ? 'page' : null }, l)));
}

const FIELDS = [
  ['speedWalk', 'Vitesse à pied (km/h)', 1, 10, '0.5'],
  ['speedScooter', 'Vitesse trottinette (km/h)', 5, 30, '0.5'],
  ['speedBike', 'Vitesse vélo (km/h)', 5, 40, '0.5'],
  ['rainAdvisedPct', 'Seuil « conseillée » (%)', 0, 100, '1'],
  ['rainRequiredPct', 'Seuil « indispensable » (%)', 0, 100, '1'],
  ['rainRequiredMm', 'Cumul « indispensable » (mm)', 0, 10, '0.1'],
  ['glovesWinterBelowC', 'Seuil gants hiver (°C)', -10, 25, '0.5'],
  ['detourCoef', 'Coefficient de détour', 1, 2, '0.05'],
];

const LABELS = Object.fromEntries(FIELDS.map(([key, label]) => [key, label]));

export async function renderAdminParams(view, ctx) {
  const s = await loadSettings(ctx.store);
  const msg = h('div', { id: 'params-msg' });
  const inputs = {};
  const fields = FIELDS.map(([key, label, min, max, step]) => {
    inputs[key] = h('input', { type: 'number', id: `p-${key}`, min, max, step, value: s[key], inputmode: 'decimal', required: true, placeholder: `Défaut ${DEFAULT_SETTINGS[key]}` });
    return h('div', {}, h('label', { for: `p-${key}` }, `${label} · ${min} à ${max} · défaut ${String(DEFAULT_SETTINGS[key]).replace('.', ',')}`), inputs[key]);
  });
  inputs.notifyTime = timeInput('p-notifyTime', s.notifyTime, 'Heure de notification');
  inputs.weatherSource = h('select', { id: 'p-weatherSource' }, WEATHER_SOURCES.map((w) => h('option', { value: w, selected: w === s.weatherSource }, 'Open-Meteo')));

  const form = h(
    'form',
    {
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        const before = { ...s };
        const input = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
        const v = validateSettings(input);
        if (!v.ok) return mount(msg, alertBox(v.errors.join(' · ')));
        // ANO-01 : un champ vidé est réaffiché avec sa valeur par défaut avant enregistrement
        for (const k of v.defaulted) inputs[k].value = v.value[k];
        await ctx.store.set(KEYS.settings, v.value);
        Object.assign(s, v.value);
        const changed = Object.keys(v.value).filter((k) => v.value[k] !== before[k]);
        await ctx.logger.log('admin', `Paramètres modifiés : ${changed.join(', ') || 'aucun changement'}`);
        const reset = v.defaulted.map((k) => `${LABELS[k]} : ${String(v.value[k]).replace('.', ',')}`);
        mount(
          msg,
          alertBox(
            reset.length
              ? `Paramètres enregistrés. Champ vide remis à sa valeur par défaut : ${reset.join(' · ')}.`
              : 'Paramètres enregistrés. Ils s’appliquent au prochain calcul.',
            'success',
          ),
        );
      },
    },
    h('div', { class: 'card' }, fields.slice(0, 3), h('h3', {}, 'Pluie'), fields.slice(3, 6), h('h3', {}, 'Gants et trajet'), fields.slice(6)),
    h('div', { class: 'card' }, h('label', { for: 'p-notifyTime-h' }, 'Heure de notification'), inputs.notifyTime, h('label', { for: 'p-weatherSource' }, 'Source météo'), inputs.weatherSource),
    msg,
    h('button', { type: 'submit', class: 'primary block', id: 'save-params' }, 'Enregistrer les paramètres'),
  );
  mount(view, h('h2', {}, 'Administration'), subnav('/admin/parametres'), form);
}

export async function renderAdminAccounts(view, ctx) {
  const msg = h('div', { id: 'accounts-msg' });
  const accounts = await ctx.auth.listAccounts();
  const run = async (fn, okText) => {
    try {
      await fn();
      await renderAdminAccounts(view, ctx);
      const m = document.getElementById('accounts-msg');
      if (m) mount(m, alertBox(okText, 'success'));
    } catch (e) {
      mount(msg, alertBox(e.message));
    }
  };

  const rows = accounts.map((a) => {
    const role = h('select', { 'aria-label': `Profil de ${a.username}`, id: `role-${a.username}` }, Object.entries(ROLES).map(([k, l]) => h('option', { value: k, selected: k === a.role }, l)));
    const pw = h('input', { type: 'password', placeholder: 'Nouveau mot de passe (optionnel)', autocomplete: 'new-password', 'aria-label': `Nouveau mot de passe de ${a.username}`, id: `pw-${a.username}` });
    const isMe = a.id === ctx.user.id;
    return h(
      'li',
      { dataset: { username: a.username } },
      h('strong', {}, a.username),
      isMe ? h('span', { class: 'muted small' }, ' (vous)') : null,
      h('div', { class: 'row', style: 'margin-top:6px' }, role, pw),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'primary', onclick: () => run(() => ctx.auth.updateAccount(a.id, { role: role.value, password: pw.value }), `Compte « ${a.username} » modifié.`) }, 'Enregistrer'),
        isMe
          ? null
          : h(
              'button',
              {
                type: 'button',
                class: 'danger',
                id: `del-${a.username}`,
                onclick: (e) => {
                  const b = e.currentTarget;
                  if (b.dataset.confirm !== '1') {
                    b.dataset.confirm = '1';
                    b.textContent = 'Confirmer la suppression';
                    return;
                  }
                  run(() => ctx.auth.deleteAccount(a.id, ctx.user.id), `Compte « ${a.username} » supprimé.`);
                },
              },
              'Supprimer',
            ),
      ),
    );
  });

  const nu = h('input', { type: 'text', id: 'new-user', autocomplete: 'off', autocapitalize: 'none', required: true });
  const np = h('input', { type: 'password', id: 'new-pw', autocomplete: 'new-password', required: true });
  const nr = h('select', { id: 'new-role' }, Object.entries(ROLES).map(([k, l]) => h('option', { value: k, selected: k === 'user' }, l)));
  const createForm = h(
    'form',
    { onsubmit: (e) => { e.preventDefault(); run(() => ctx.auth.createAccount({ username: nu.value.trim(), password: np.value, role: nr.value }), `Compte « ${nu.value.trim()} » créé.`); } },
    h('h3', {}, 'Créer un compte'),
    h('label', { for: 'new-user' }, 'Identifiant'),
    nu,
    h('label', { for: 'new-pw' }, 'Mot de passe (8 caractères minimum)'),
    np,
    h('label', { for: 'new-role' }, 'Profil'),
    nr,
    h('button', { type: 'submit', class: 'primary block', id: 'create-account' }, 'Créer le compte'),
  );

  mount(view, h('h2', {}, 'Administration'), subnav('/admin/comptes'), msg, h('div', { class: 'card' }, h('h3', {}, `Comptes (${accounts.length})`), h('ul', { class: 'list', id: 'accounts' }, rows)), h('div', { class: 'card' }, createForm));
}

export async function renderAdminLogs(view, ctx) {
  const logs = await ctx.logger.list();
  mount(
    view,
    h('h2', {}, 'Administration'),
    subnav('/admin/journaux'),
    h(
      'div',
      { class: 'card' },
      h('h3', {}, `Journaux (${logs.length} derniers événements, 200 max)`),
      logs.length === 0
        ? h('p', { class: 'muted' }, 'Aucun événement.')
        : h('ul', { class: 'list', id: 'logs' }, logs.map((e) => h('li', {}, h('span', { class: 'log-at' }, fmtDateTime(e.at)), h('span', { class: 'log-type' }, LOG_TYPES[e.type] ?? e.type), e.message))),
    ),
  );
}
