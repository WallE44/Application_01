// Accueil : verdict du jour (EXG-08 à EXG-10, EXG-12, RG-07).
import { getDayReport, loadSettings, stamp } from '../../core/service.js';
import { MODES, pointLevel, sameDay } from '../../core/rules.js';
import { KEYS } from '../../core/store.js';
import { alertBox, fmtNum, fmtTime, h, mount } from '../dom.js';

const ADVICE = [
  'Pas besoin de vêtements de pluie aujourd’hui.',
  'Vêtements de pluie conseillés.',
  'Prenez vos vêtements de pluie.',
];

/** EXG-12 / ANO-04 : la date est ajoutée quand la prévision n'est pas du jour. */
function updatedLabel(fetchedAt) {
  return sameDay(new Date(fetchedAt), new Date()) ? `Mis à jour à ${fmtTime(fetchedAt)}` : `Mis à jour le ${stamp(fetchedAt)}`;
}

function verdictCard(report) {
  const { verdict, gloves } = report.result;
  return h(
    'section',
    { class: `card verdict level-${verdict.level}`, id: 'verdict', dataset: { level: String(verdict.level) }, 'aria-label': 'Verdict du jour' },
    h('p', { class: 'label' }, 'Vêtements de pluie'),
    h('p', { class: 'value' }, verdict.levelInfo.label),
    h('p', { class: 'risk' }, `Risque de pluie max : ${verdict.maxProb} %`),
    h('p', {}, ADVICE[verdict.level]),
    h(
      'div',
      { class: 'chips' },
      h('span', { class: 'chip', id: 'gloves' }, `🧤 ${gloves.label} (min ${fmtNum(gloves.minTemp)} °C)`),
      h('span', { class: 'chip', id: 'updated' }, updatedLabel(report.fetchedAt)),
    ),
  );
}

function legTable(leg, settings) {
  return h(
    'div',
    { class: 'card' },
    h('h3', {}, leg.label),
    h(
      'table',
      { class: 'points', dataset: { leg: leg.id } },
      h('thead', {}, h('tr', {}, h('th', {}, 'Point'), h('th', { class: 'num' }, 'Passage'), h('th', { class: 'num' }, 'Pluie'), h('th', { class: 'num' }, 'mm'), h('th', { class: 'num' }, '°C'))),
      h(
        'tbody',
        {},
        leg.points.map((p) => {
          const lvl = pointLevel(p, settings);
          return h(
            'tr',
            {},
            h('td', {}, h('span', { class: `dot l${lvl}`, 'aria-hidden': 'true' }), p.name),
            h('td', { class: 'num' }, fmtTime(p.passage)),
            h('td', { class: 'num' }, `${p.prob} %`),
            h('td', { class: 'num' }, fmtNum(p.mm)),
            h('td', { class: 'num' }, fmtNum(p.temp)),
          );
        }),
      ),
    ),
  );
}

async function draw(view, ctx, report, { refreshing }) {
  const settings = await loadSettings(ctx.store);
  const trip = await ctx.store.get(KEYS.trip(ctx.user.id));
  const refreshBtn = h('button', { class: 'block', id: 'refresh', disabled: refreshing, onclick: () => renderHome(view, ctx) }, refreshing ? 'Mise à jour…' : 'Actualiser la météo');

  if (report.status === 'no-trip') {
    return mount(
      view,
      h('h2', {}, 'Verdict du jour'),
      h('div', { class: 'card' }, h('p', {}, 'Renseignez d’abord votre trajet (domicile, travail, horaires, mode).'), h('a', { class: 'btn primary', href: '#/trajet' }, 'Configurer mon trajet')),
    );
  }
  if (report.status === 'day-off') {
    return mount(
      view,
      h('h2', {}, 'Verdict du jour'),
      h('div', { class: 'card', id: 'day-off' }, h('p', {}, 'Aujourd’hui n’est pas un jour de travail : pas de verdict.'), h('p', { class: 'muted small' }, 'Modifiez vos jours de travail dans « Mon trajet ».')),
    );
  }
  const parts = [h('h2', {}, 'Verdict du jour')];
  if (report.status === 'error') {
    parts.push(alertBox(`Prévision indisponible : ${report.error}`), refreshBtn);
    return mount(view, parts);
  }
  if (report.error && !refreshing) parts.push(alertBox(`Hors ligne ou service météo indisponible : dernière prévision affichée (${report.error}).`, 'warn'));
  if (report.stale) parts.push(h('div', { class: 'alert', id: 'stale', role: 'status' }, '⚠ Prévision de plus de 3 h : elle peut ne plus être à jour.'));
  parts.push(verdictCard(report));
  const r = report.result;
  parts.push(
    h(
      'p',
      { class: 'muted small', id: 'trip-summary' },
      `${MODES[trip.mode].label}${trip.manualSpeed != null ? ' (vitesse manuelle)' : ''} · ${fmtNum(r.distanceKm)} km · ${fmtNum(r.speedKmh)} km/h · ${Math.round(r.durationMin)} min`,
    ),
  );
  for (const leg of r.legs) parts.push(legTable(leg, settings));
  parts.push(refreshBtn);
  mount(view, parts);
}

export async function renderHome(view, ctx) {
  // 1. Affichage immédiat depuis le cache (rapide et hors-ligne : ENF-04, EXG-12)
  const cached = await getDayReport({ store: ctx.store, logger: ctx.logger, userId: ctx.user.id, refresh: false });
  if (cached.status === 'no-trip' || cached.status === 'day-off') return draw(view, ctx, cached, { refreshing: false });
  if (cached.status === 'ok') await draw(view, ctx, cached, { refreshing: true });
  else mount(view, h('h2', {}, 'Verdict du jour'), h('p', { class: 'muted' }, 'Récupération de la météo…'));
  // 2. Rafraîchissement à l'ouverture (RG-07)
  const fresh = await getDayReport({ store: ctx.store, logger: ctx.logger, userId: ctx.user.id, refresh: true });
  await draw(view, ctx, fresh, { refreshing: false });
}
