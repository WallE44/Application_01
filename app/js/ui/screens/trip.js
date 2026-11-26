// Mon trajet (EXG-04 à EXG-07) : adresses, carte, ma position, horaires, jours, mode/vitesse.
import { reverseLabel, searchAddress } from '../../core/address.js';
import { tripMetrics } from '../../core/forecast.js';
import { MANUAL_SPEED_MAX, MANUAL_SPEED_MIN, MODES, validateTrip, WEEKDAYS } from '../../core/rules.js';
import { loadSettings } from '../../core/service.js';
import { KEYS } from '../../core/store.js';
import { alertBox, fmtNum, h, mount, timeInput } from '../dom.js';

const DEFAULT_TRIP = { a: null, b: null, morning: '08:00', evening: '17:30', workdays: [1, 2, 3, 4, 5], mode: 'bike', manualSpeed: null };

let leafletPromise;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletPromise ??= new Promise((resolve, reject) => {
    const css = h('link', { rel: 'stylesheet', href: 'vendor/leaflet/leaflet.css' });
    const js = h('script', { src: 'vendor/leaflet/leaflet.js' });
    js.onload = () => resolve(window.L);
    js.onerror = () => reject(new Error('Carte indisponible'));
    document.head.append(css, js);
  });
  return leafletPromise;
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Géolocalisation non disponible'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? 'Autorisation de localisation refusée' : 'Position introuvable')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

export async function renderTrip(view, ctx) {
  const settings = await loadSettings(ctx.store);
  const saved = await ctx.store.get(KEYS.trip(ctx.user.id));
  const trip = structuredClone(saved || DEFAULT_TRIP);
  const msg = h('div', { id: 'trip-msg' });
  const metrics = h('p', { class: 'muted small', id: 'trip-metrics' });
  let map;
  const markers = {};
  let target = 'a';

  const pointUi = {};
  function setPoint(which, point) {
    trip[which] = point;
    pointUi[which].label.textContent = point ? `✓ ${point.label}` : 'Non renseigné';
    if (point) pointUi[which].input.value = point.label;
    drawMarkers();
    updateMetrics();
  }

  function drawMarkers() {
    if (!map) return;
    const L = window.L;
    for (const w of ['a', 'b']) {
      markers[w]?.remove();
      markers[w] = null;
      if (trip[w]) {
        markers[w] = L.marker([trip[w].lat, trip[w].lon], { title: w === 'a' ? 'A' : 'B', alt: w === 'a' ? 'Point A' : 'Point B' })
          .addTo(map)
          .bindTooltip(w === 'a' ? 'A · domicile' : 'B · travail', { permanent: true, direction: 'top', offset: [0, -30] });
      }
    }
    const pts = ['a', 'b'].filter((w) => trip[w]).map((w) => [trip[w].lat, trip[w].lon]);
    if (pts.length === 2) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    else if (pts.length === 1) map.setView(pts[0], 14);
  }

  function updateMetrics() {
    if (!trip.a || !trip.b) return (metrics.textContent = 'Renseignez A et B pour estimer la durée.');
    try {
      const m = tripMetrics({ ...trip, manualSpeed: readManualSpeed() ?? null }, settings);
      metrics.textContent = `Distance estimée ${fmtNum(m.distanceKm)} km (vol d’oiseau × ${fmtNum(settings.detourCoef)}) · ${fmtNum(m.speedKmh)} km/h · ${Math.round(m.durationMin)} min`;
    } catch {
      metrics.textContent = '';
    }
  }

  function pointBlock(which, title) {
    const input = h('input', { type: 'text', id: `addr-${which}`, placeholder: 'Tapez une adresse (France)', autocomplete: 'off', 'aria-describedby': `label-${which}` });
    const list = h('ul', { class: 'suggestions', id: `sugg-${which}`, role: 'listbox' });
    const label = h('div', { class: 'point-label', id: `label-${which}` });
    let timer;
    let seq = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value;
      timer = setTimeout(async () => {
        const my = ++seq;
        try {
          const res = await searchAddress(q);
          if (my !== seq) return;
          if (q.trim().length >= 3 && res.length === 0) {
            return mount(list, h('li', {}, h('button', { type: 'button', disabled: true }, 'Adresse introuvable')));
          }
          mount(
            list,
            res.map((r) =>
              h('li', { role: 'option' }, h('button', { type: 'button', onclick: () => { mount(list); input.value = r.label; setPoint(which, r); } }, r.label)),
            ),
          );
        } catch (e) {
          if (my === seq) mount(list, h('li', {}, h('button', { type: 'button', disabled: true }, e.message)));
          await ctx.logger.log('error', `Adresse : ${e.message}`);
        }
      }, 350);
    });
    const geoBtn = h(
      'button',
      {
        type: 'button',
        id: `geo-${which}`,
        onclick: async () => {
          geoBtn.disabled = true;
          try {
            const p = await getPosition();
            setPoint(which, { ...p, label: await reverseLabel(p) });
          } catch (e) {
            mount(msg, alertBox(e.message));
          } finally {
            geoBtn.disabled = false;
          }
        },
      },
      '📍 Ma position',
    );
    pointUi[which] = { input, label };
    return h('div', {}, h('label', { for: `addr-${which}` }, title), input, list, label, h('div', { class: 'actions' }, geoBtn));
  }

  const morning = timeInput('morning', trip.morning, 'Départ du matin');
  const evening = timeInput('evening', trip.evening, 'Départ du soir');
  const dayBoxes = WEEKDAYS.map((d) => ({ id: d.id, box: h('input', { type: 'checkbox', id: `day-${d.id}`, checked: trip.workdays.includes(d.id) }), d }));
  const modeRadios = Object.entries(MODES).map(([code, m]) => ({ code, radio: h('input', { type: 'radio', name: 'mode', id: `mode-${code}`, value: code, checked: trip.mode === code, onchange: updateMetrics }), m }));
  const manualOn = h('input', { type: 'checkbox', id: 'manual-on', checked: trip.manualSpeed != null });
  const manualSpeed = h('input', { type: 'number', id: 'manual-speed', min: MANUAL_SPEED_MIN, max: MANUAL_SPEED_MAX, step: '0.5', inputmode: 'decimal', value: trip.manualSpeed ?? '', disabled: trip.manualSpeed == null });
  manualOn.addEventListener('change', () => {
    manualSpeed.disabled = !manualOn.checked;
    if (manualOn.checked) manualSpeed.focus();
    updateMetrics();
  });
  manualSpeed.addEventListener('input', updateMetrics);
  function readManualSpeed() {
    if (!manualOn.checked) return null;
    const n = Number(String(manualSpeed.value).replace(',', '.'));
    return manualSpeed.value === '' ? NaN : n;
  }

  const targetSeg = h(
    'div',
    { class: 'seg', role: 'radiogroup', 'aria-label': 'Point à placer sur la carte' },
    ['a', 'b'].map((w) =>
      h('label', {}, h('input', { type: 'radio', name: 'map-target', id: `target-${w}`, value: w, checked: w === 'a', onchange: () => (target = w) }), h('span', {}, w === 'a' ? 'Placer A' : 'Placer B')),
    ),
  );

  const saveBtn = h('button', { type: 'submit', class: 'primary block', id: 'save-trip' }, 'Enregistrer mon trajet');
  const form = h(
    'form',
    {
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        const candidate = {
          ...trip,
          morning: morning.value,
          evening: evening.value,
          workdays: dayBoxes.filter((d) => d.box.checked).map((d) => d.id),
          mode: modeRadios.find((m) => m.radio.checked)?.code,
          manualSpeed: readManualSpeed(),
        };
        const v = validateTrip(candidate);
        if (!v.ok) return mount(msg, alertBox(v.errors.join(' · ')));
        await ctx.store.set(KEYS.trip(ctx.user.id), candidate);
        await ctx.store.del(KEYS.forecast(ctx.user.id));
        mount(msg, alertBox('Trajet enregistré.', 'success'));
        setTimeout(() => ctx.go('/accueil'), 600);
      },
    },
    h('div', { class: 'card' }, pointBlock('a', 'A · Domicile'), pointBlock('b', 'B · Travail'), h('h3', {}, 'Ou touchez la carte'), targetSeg, h('div', { id: 'map', role: 'application', 'aria-label': 'Carte du trajet' }), metrics),
    h(
      'div',
      { class: 'card' },
      h('h3', {}, 'Horaires de départ'),
      h('div', { class: 'row' }, h('div', {}, h('label', { for: 'morning-h' }, 'Matin (A → B)'), morning), h('div', {}, h('label', { for: 'evening-h' }, 'Soir (B → A)'), evening)),
      h('h3', {}, 'Jours de travail'),
      h('div', { class: 'days' }, dayBoxes.map(({ box, d }) => h('label', { for: box.id, title: d.label }, d.short, box))),
    ),
    h(
      'div',
      { class: 'card' },
      h('h3', {}, 'Mode de déplacement'),
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Mode de déplacement' }, modeRadios.map(({ radio, m, code }) => h('label', { for: radio.id }, radio, h('span', {}, `${m.label} · ${fmtNum(settings[MODES[code].settingKey])} km/h`)))),
      h('label', { class: 'check', for: 'manual-on' }, manualOn, 'Saisir ma vitesse manuellement'),
      h('label', { for: 'manual-speed' }, `Vitesse manuelle (${MANUAL_SPEED_MIN} à ${MANUAL_SPEED_MAX} km/h)`),
      manualSpeed,
    ),
    msg,
    saveBtn,
  );

  mount(view, h('h2', {}, 'Mon trajet'), form);
  setPoint('a', trip.a);
  setPoint('b', trip.b);

  try {
    const L = await loadLeaflet();
    if (!document.getElementById('map')) return;
    map = L.map('map', { zoomControl: true, attributionControl: true }).setView([46.6, 2.4], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© contributeurs OpenStreetMap',
    }).addTo(map);
    map.on('click', async (e) => {
      const p = { lat: e.latlng.lat, lon: e.latlng.lng };
      const which = target;
      setPoint(which, { ...p, label: `Position ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` });
      const label = await reverseLabel(p);
      if (trip[which]?.lat === p.lat && trip[which]?.lon === p.lon) setPoint(which, { ...p, label });
    });
    drawMarkers();
  } catch (e) {
    mount(document.getElementById('map'), h('p', { class: 'muted small' }, `${e.message} : utilisez la recherche d’adresse ou « Ma position ».`));
  }
}
