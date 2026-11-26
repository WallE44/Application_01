// Petit utilitaire DOM. Tout texte passe par textContent (pas d'injection HTML).

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function mount(container, ...nodes) {
  container.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
}

const pad = (n) => String(n).padStart(2, '0');
export const fmtTime = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fmtDateTime = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${fmtTime(ms)}`;
};
export const fmtNum = (n, digits = 1) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: digits });

export function alertBox(message, kind = 'error') {
  return h('div', { class: `alert ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
}

/** Petit wrapper sessionStorage au format du store (session non persistante). */
export function sessionStore() {
  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return {
    async get(key) {
      return safe(() => JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? undefined, undefined);
    },
    async set(key, value) {
      safe(() => sessionStorage.setItem(key, JSON.stringify(value)));
    },
    async del(key) {
      safe(() => sessionStorage.removeItem(key));
    },
  };
}

/**
 * Saisie d'heure au format 24 h garanti (EXG-05), quel que soit le réglage 12/24 h du téléphone.
 * Retourne un élément avec .value (HH:MM) et des sélecteurs #<id>-h / #<id>-m.
 */
export function timeInput(id, value, labelText) {
  const [hh, mm] = (value || '08:00').split(':');
  const opts = (n, cur) => Array.from({ length: n }, (_, i) => {
    const v = String(i).padStart(2, '0');
    return h('option', { value: v, selected: v === cur }, v);
  });
  const hSel = h('select', { id: `${id}-h`, 'aria-label': `${labelText} : heures` }, opts(24, hh));
  const mSel = h('select', { id: `${id}-m`, 'aria-label': `${labelText} : minutes` }, opts(60, mm));
  const wrap = h('div', { class: 'time24', id, role: 'group', 'aria-label': labelText }, hSel, h('span', { 'aria-hidden': 'true' }, 'h'), mSel);
  Object.defineProperty(wrap, 'value', {
    get: () => `${hSel.value}:${mSel.value}`,
    set: (v) => {
      const [a, b] = String(v).split(':');
      hSel.value = a;
      mSel.value = b;
    },
  });
  return wrap;
}
