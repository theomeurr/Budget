'use strict';

const APP_VERSION = '1.0.0';
const STORAGE_KEY = 'budget.v1';

const CATEGORIES = {
  logement: { label: 'Logement', icon: '🏠', color: '#0f766e' },
  energie: { label: 'Énergie & eau', icon: '⚡', color: '#ca8a04' },
  telecom: { label: 'Internet & mobile', icon: '📱', color: '#2563eb' },
  streaming: { label: 'Streaming & abonnements', icon: '🎬', color: '#db2777' },
  assurance: { label: 'Assurances', icon: '🛡️', color: '#7c3aed' },
  transport: { label: 'Transport', icon: '🚗', color: '#ea580c' },
  sante: { label: 'Santé', icon: '🩺', color: '#059669' },
  impots: { label: 'Impôts & taxes', icon: '🏛️', color: '#64748b' },
  banque: { label: 'Banque & crédit', icon: '🏦', color: '#0891b2' },
  loisirs: { label: 'Loisirs & sport', icon: '🎾', color: '#65a30d' },
  autre: { label: 'Autre', icon: '📦', color: '#a8a29e' },
};

// Mots-clés pour pré-remplir la catégorie à partir du nom
const CATEGORY_HINTS = [
  [/netflix|spotify|disney|prime video|amazon prime|canal|deezer|youtube|apple|icloud|google one|crunchyroll|max\b|paramount|xbox|playstation|nintendo|abonnement/i, 'streaming'],
  [/edf|engie|total ?energ|gaz|électricit|electricit|eau\b|veolia|suez/i, 'energie'],
  [/free|orange|sfr|bouygues|sosh|red by|b&you|internet|box|forfait|mobile|téléphone|telephone/i, 'telecom'],
  [/loyer|charges|syndic|copro/i, 'logement'],
  [/mutuelle|médecin|medecin|pharma|dentiste/i, 'sante'],
  [/assurance|maaf|maif|macif|axa|allianz|matmut|gmf/i, 'assurance'],
  [/impôt|impot|taxe|urssaf/i, 'impots'],
  [/crédit|credit|prêt|pret|banque|carte bancaire|frais bancaires/i, 'banque'],
  [/essence|carburant|navigo|sncf|train|parking|péage|peage|contrôle technique|controle technique|garage|voiture|auto\b/i, 'transport'],
  [/salle|sport|club|badminton|basic fit|fitness|licence|cotisation/i, 'loisirs'],
];

const FREQUENCIES = {
  monthly: { label: 'Mensuel', months: 1, dateLabel: 'Premier prélèvement', help: 'Se répète chaque mois à ce jour-là.' },
  quarterly: { label: 'Trimestriel', months: 3, dateLabel: 'Premier prélèvement', help: 'Puis tous les 3 mois à partir de cette date.' },
  semiannual: { label: 'Semestriel', months: 6, dateLabel: 'Premier prélèvement', help: 'Puis tous les 6 mois à partir de cette date.' },
  yearly: { label: 'Annuel', months: 12, dateLabel: 'Premier prélèvement', help: 'Puis chaque année à cette date.' },
  once: { label: 'Ponctuel', months: 0, dateLabel: 'Date', help: 'Une seule fois, à cette date.' },
};

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtMonthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const fmtShortMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const fmtLongDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const round2 = (n) => Math.round(n * 100) / 100;
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
const categoryOf = (e) => CATEGORIES[e.category] || CATEGORIES.autre;

// ---------- Dates (manipulées en 'AAAA-MM-JJ' pour éviter les décalages de fuseau) ----------
const pad = (n) => String(n).padStart(2, '0');
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const monthKey = (y, m) => `${y}-${pad(m + 1)}`;

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
}

function isoToDate(iso) {
  const { y, m, d } = parseISO(iso);
  return new Date(y, m, d);
}

function todayISO() {
  const t = new Date();
  return toISO(t.getFullYear(), t.getMonth(), t.getDate());
}

function currentMonth() {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() };
}

function addMonths({ y, m }, n) {
  const total = y * 12 + m + n;
  return { y: Math.floor(total / 12), m: total % 12 };
}

const dayLabel = (d) => (d === 1 ? '1er' : String(d));

// ---------- Calcul des échéances ----------

// Date de l'échéance de `e` dans le mois (y, m), ou null s'il n'y en a pas.
function occurrenceIn(e, y, m) {
  const start = parseISO(e.date);
  if (e.frequency === 'once') return start.y === y && start.m === m ? e.date : null;

  const step = FREQUENCIES[e.frequency].months;
  const diff = (y - start.y) * 12 + (m - start.m);
  if (diff < 0 || diff % step !== 0) return null;

  const iso = toISO(y, m, Math.min(start.d, daysInMonth(y, m)));
  if (e.end && iso > e.end) return null;
  return iso;
}

// Prochaine échéance à partir de `fromISO` (incluse), ou null si terminée.
function nextOccurrence(e, fromISO) {
  if (e.date >= fromISO) return e.date;
  if (e.frequency === 'once') return null;

  let cur = parseISO(fromISO);
  for (let i = 0; i <= 12; i++) {
    const occ = occurrenceIn(e, cur.y, cur.m);
    if (occ && occ >= fromISO) return occ;
    cur = addMonths(cur, 1);
  }
  return null;
}

function occurrencesIn(y, m) {
  const mk = monthKey(y, m);
  return state.expenses
    .map((e) => {
      const date = occurrenceIn(e, y, m);
      if (!date) return null;
      const key = `${e.id}@${mk}`;
      return { e, date, key, paid: !!state.paid[key] };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || a.e.name.localeCompare(b.e.name, 'fr'));
}

// ---------- Stockage local ----------
function isValidData(data) {
  return !!data && Array.isArray(data.expenses) && data.expenses.every((e) =>
    e && typeof e.id === 'string' && typeof e.name === 'string' && Number.isFinite(e.amount) &&
    FREQUENCIES[e.frequency] && /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
    (!e.end || /^\d{4}-\d{2}-\d{2}$/.test(e.end)));
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isValidData(data)) return { expenses: data.expenses, paid: data.paid || {} };
  } catch (_) { /* stockage indisponible ou corrompu */ }
  return { expenses: [], paid: {} };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {
    toast('Impossible d’enregistrer sur cet appareil');
  }
  // Demande au navigateur de ne pas effacer les données en cas de manque d'espace
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------- État ----------
let state = load();
let view = 'month';
let cursor = currentMonth();
let editingId = null;
let categoryTouched = false;
let deferredInstall = null;

// ---------- Rendu : mois ----------
function renderMonth() {
  const { y, m } = cursor;
  const today = todayISO();
  const now = currentMonth();
  const offset = (y - now.y) * 12 + (m - now.m);

  $('#month-label').textContent = cap(fmtMonthYear.format(new Date(y, m, 1)));
  $('#month-hint').textContent = { '-1': 'Mois dernier', 0: 'Ce mois-ci', 1: 'Mois prochain' }[offset] || '';
  document.querySelectorAll('[data-jump]').forEach((b) => b.classList.toggle('active', Number(b.dataset.jump) === offset));

  const items = occurrencesIn(y, m);
  let total = 0;
  let paid = 0;
  const extras = [];
  for (const it of items) {
    total += it.e.amount;
    if (it.paid) paid += it.e.amount;
    if (it.e.frequency !== 'monthly') extras.push(it);
  }
  total = round2(total);
  paid = round2(paid);

  $('#month-total').textContent = eur.format(total);
  $('#month-paid').textContent = eur.format(paid);
  $('#month-left').textContent = eur.format(round2(total - paid));
  $('#month-progress').style.width = total ? `${(paid / total) * 100}%` : '0';
  $('#month-count').textContent = items.length ? `${items.filter((it) => it.paid).length}/${items.length} payées` : '';

  const extra = $('#month-extra');
  extra.hidden = !extras.length;
  if (extras.length) {
    const sum = round2(extras.reduce((s, it) => s + it.e.amount, 0));
    const names = extras.map((it) => esc(it.e.name)).join(', ');
    extra.innerHTML = `⚠️ À prévoir en plus des mensualités : <b>${eur.format(sum)}</b> (${names})`;
  }

  const list = $('#occ-list');
  if (!items.length) {
    list.innerHTML = state.expenses.length
      ? '<li class="empty">Rien de prévu ce mois-ci 🎉</li>'
      : '<li class="empty">Aucune dépense pour l’instant.<br>Touche <b>+</b> pour ajouter ton premier abonnement.</li>';
  } else {
    list.innerHTML = items.map((it) => {
      const c = categoryOf(it.e);
      const d = parseISO(it.date).d;
      const late = !it.paid && it.date < today;
      const tags = [`${c.icon} ${esc(c.label)}`];
      if (it.e.frequency !== 'monthly') tags.push(`<em class="tag-extra">${FREQUENCIES[it.e.frequency].label}</em>`);
      if (late) tags.push('<em class="tag-late">Date passée</em>');
      return `
        <li class="occ${it.paid ? ' is-paid' : ''}">
          <label class="check">
            <input type="checkbox" data-paid="${it.key}" ${it.paid ? 'checked' : ''} aria-label="${esc(it.e.name)} payé">
            <span></span>
          </label>
          <button type="button" class="row" data-edit="${it.e.id}">
            <span class="date"><b>${d}</b><small>${fmtShortMonth.format(isoToDate(it.date)).replace('.', '')}</small></span>
            <span class="info">
              <span class="name">${esc(it.e.name)}</span>
              <span class="meta">${tags.join(' · ')}</span>
            </span>
            <span class="amount">${eur.format(it.e.amount)}</span>
          </button>
        </li>`;
    }).join('');
  }

  const byCat = {};
  for (const it of items) {
    const k = CATEGORIES[it.e.category] ? it.e.category : 'autre';
    byCat[k] = (byCat[k] || 0) + it.e.amount;
  }
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 1;
  $('#cat-section').hidden = entries.length < 2;
  $('#cat-list').innerHTML = entries.map(([k, v]) => `
    <li>
      <div class="cat-row"><span>${CATEGORIES[k].icon} ${esc(CATEGORIES[k].label)}</span><b>${eur.format(round2(v))}</b></div>
      <div class="bar"><span style="width:${(v / max) * 100}%;background:${CATEGORIES[k].color}"></span></div>
    </li>`).join('');
}

// ---------- Rendu : toutes les dépenses ----------
function subRow({ e, next }) {
  const c = categoryOf(e);
  const f = FREQUENCIES[e.frequency];
  let detail;
  if (e.frequency === 'once') {
    detail = `Le ${fmtLongDate.format(isoToDate(e.date))}`;
  } else if (!next) {
    detail = `${f.label} · terminé`;
  } else if (e.frequency === 'monthly') {
    detail = `Le ${dayLabel(parseISO(e.date).d)} de chaque mois`;
  } else {
    detail = `${f.label} · prochain le ${fmtLongDate.format(isoToDate(next))}`;
  }
  if (e.note) detail += ` · ${esc(e.note)}`;
  const perMonth = f.months > 1 ? `<small>≈ ${eur.format(round2(e.amount / f.months))}/mois</small>` : '';
  return `
    <li${next ? '' : ' class="is-done"'}>
      <button type="button" class="row" data-edit="${e.id}">
        <span class="cat-icon" style="--c:${c.color}">${c.icon}</span>
        <span class="info">
          <span class="name">${esc(e.name)}</span>
          <span class="meta">${detail}</span>
        </span>
        <span class="amount">${eur.format(e.amount)}${perMonth}</span>
      </button>
    </li>`;
}

function group(title, rows, { total, collapsed } = {}) {
  if (!rows.length) return '';
  const right = total != null ? eur.format(round2(total)) : rows.length;
  if (collapsed) {
    return `
      <details class="group">
        <summary><h2 class="section"><span><span class="chev">›</span> ${title}</span><span>${right}</span></h2></summary>
        <ul class="list">${rows.map(subRow).join('')}</ul>
      </details>`;
  }
  return `<h2 class="section"><span>${title}</span><span>${right}</span></h2><ul class="list">${rows.map(subRow).join('')}</ul>`;
}

function renderSubs() {
  const today = todayISO();
  const all = state.expenses.map((e) => ({ e, next: nextOccurrence(e, today) }));
  const recurring = all.filter((x) => x.next && x.e.frequency !== 'once');

  const monthlyAvg = recurring.reduce((s, x) => s + x.e.amount / FREQUENCIES[x.e.frequency].months, 0);
  const yearly = recurring.reduce((s, x) => s + (x.e.amount * 12) / FREQUENCIES[x.e.frequency].months, 0);
  $('#subs-monthly').textContent = eur.format(round2(monthlyAvg));
  $('#subs-yearly').textContent = eur.format(round2(yearly));
  $('#subs-count').textContent = recurring.length;

  const byDay = (a, b) => parseISO(a.e.date).d - parseISO(b.e.date).d || a.e.name.localeCompare(b.e.name, 'fr');
  const byNext = (a, b) => a.next.localeCompare(b.next);
  const sum = (rows) => rows.reduce((s, x) => s + x.e.amount, 0);

  const monthly = recurring.filter((x) => x.e.frequency === 'monthly').sort(byDay);
  const periodic = recurring.filter((x) => x.e.frequency !== 'monthly').sort(byNext);
  const upcoming = all.filter((x) => x.next && x.e.frequency === 'once').sort(byNext);
  const done = all.filter((x) => !x.next).sort((a, b) => b.e.date.localeCompare(a.e.date));

  const html = [
    group('Mensuelles', monthly, { total: sum(monthly) }),
    group('Trimestrielles, semestrielles, annuelles', periodic),
    group('Ponctuelles à venir', upcoming, { total: sum(upcoming) }),
    group('Terminées', done, { collapsed: true }),
  ].join('');

  $('#subs-groups').innerHTML = html ||
    '<h2 class="section"><span>Liste</span></h2><ul class="list"><li class="empty">Aucune dépense pour l’instant.<br>Touche <b>+</b> pour en ajouter une.</li></ul>';
}

function render() {
  if (view === 'month') renderMonth();
  if (view === 'subs') renderSubs();
}

function setView(next) {
  view = next;
  for (const v of ['month', 'subs', 'settings']) $(`#view-${v}`).hidden = v !== view;
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('#add-btn').hidden = view === 'settings';
  window.scrollTo(0, 0);
  render();
}

// ---------- Formulaire ----------
const dialog = $('#form-dialog');
const form = $('#expense-form');

function fillFormOptions() {
  $('#freq-chips').innerHTML = Object.entries(FREQUENCIES).map(([k, f]) =>
    `<label><input type="radio" name="frequency" value="${k}"><span>${f.label}</span></label>`).join('');
  form.elements.category.innerHTML = Object.entries(CATEGORIES).map(([k, c]) =>
    `<option value="${k}">${c.icon} ${esc(c.label)}</option>`).join('');
}

function updateFormMode() {
  const f = FREQUENCIES[form.elements.frequency.value] || FREQUENCIES.monthly;
  $('#date-label').textContent = f.dateLabel;
  $('#date-help').textContent = f.help;
  $('#end-field').hidden = f.months === 0;
}

function defaultDate() {
  const now = currentMonth();
  if (cursor.y === now.y && cursor.m === now.m) return todayISO();
  return toISO(cursor.y, cursor.m, Math.min(new Date().getDate(), daysInMonth(cursor.y, cursor.m)));
}

function openForm(id) {
  const e = id ? state.expenses.find((x) => x.id === id) : null;
  editingId = e ? e.id : null;
  categoryTouched = !!e;
  form.reset();
  $('#form-error').textContent = '';
  $('#form-title').textContent = e ? 'Modifier' : 'Nouvelle dépense';
  $('#delete-btn').hidden = !e;

  const el = form.elements;
  el.name.value = e ? e.name : '';
  el.amount.value = e ? String(e.amount).replace('.', ',') : '';
  el.frequency.value = e ? e.frequency : 'monthly';
  el.date.value = e ? e.date : defaultDate();
  el.end.value = e && e.end ? e.end : '';
  el.category.value = e && CATEGORIES[e.category] ? e.category : 'autre';
  el.note.value = e && e.note ? e.note : '';
  updateFormMode();
  dialog.showModal();
  if (!e) el.name.focus();
}

function closeForm() {
  dialog.close();
  editingId = null;
}

function submitForm(event) {
  event.preventDefault();
  const el = form.elements;
  const name = el.name.value.trim();
  const amount = round2(parseFloat(el.amount.value.replace(/[\s€]/g, '').replace(',', '.')));
  const frequency = el.frequency.value;
  const date = el.date.value;
  const end = frequency !== 'once' && el.end.value ? el.end.value : '';
  const error = $('#form-error');

  if (!name) { error.textContent = 'Donne un nom à cette dépense.'; el.name.focus(); return; }
  if (!Number.isFinite(amount) || amount <= 0) { error.textContent = 'Indique un montant valide (ex : 12,99).'; el.amount.focus(); return; }
  if (!FREQUENCIES[frequency]) { error.textContent = 'Choisis une fréquence.'; return; }
  if (!date) { error.textContent = 'Choisis une date.'; el.date.focus(); return; }
  if (end && end < date) { error.textContent = 'La date de fin doit être après le premier prélèvement.'; el.end.focus(); return; }

  const data = { name, amount, frequency, date, end, category: el.category.value, note: el.note.value.trim() };
  if (editingId) {
    const e = state.expenses.find((x) => x.id === editingId);
    Object.assign(e, data);
    toast('Modifications enregistrées');
  } else {
    state.expenses.push({ id: uid(), ...data });
    toast('Dépense ajoutée');
  }
  save();
  closeForm();
  render();
}

function deleteExpense() {
  const e = state.expenses.find((x) => x.id === editingId);
  if (!e || !confirm(`Supprimer « ${e.name} » ?`)) return;
  state.expenses = state.expenses.filter((x) => x.id !== e.id);
  for (const key of Object.keys(state.paid)) if (key.startsWith(`${e.id}@`)) delete state.paid[key];
  save();
  closeForm();
  render();
  toast('Dépense supprimée');
}

function guessCategory() {
  if (categoryTouched || editingId) return;
  const name = form.elements.name.value;
  const hit = CATEGORY_HINTS.find(([re]) => re.test(name));
  form.elements.category.value = hit ? hit[1] : 'autre';
}

// ---------- Sauvegarde ----------
async function exportData() {
  const json = JSON.stringify({ app: 'budget', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
  const filename = `budget-${todayISO()}.json`;
  const file = new File([json], filename, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Sauvegarde Budget' });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  file.text().then((text) => {
    const data = JSON.parse(text);
    if (!isValidData(data)) throw new Error('invalid');
    if (state.expenses.length && !confirm(`Remplacer tes ${plural(state.expenses.length, 'dépense')} par les ${data.expenses.length} du fichier ?`)) return;
    state = { expenses: data.expenses, paid: data.paid || {} };
    save();
    toast(`${plural(state.expenses.length, 'dépense')} importée${state.expenses.length > 1 ? 's' : ''}`);
  }).catch(() => toast('Fichier invalide'));
}

function resetData() {
  if (!confirm('Effacer toutes tes dépenses de cet appareil ? Cette action est définitive.')) return;
  state = { expenses: [], paid: {} };
  save();
  toast('Toutes les données ont été effacées');
}

// ---------- Divers ----------
let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function updateInstallState() {
  const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  $('#install-done').hidden = !installed;
  $('#install-help').hidden = installed;
}

// ---------- Événements ----------
function bind() {
  $('#prev-month').addEventListener('click', () => { cursor = addMonths(cursor, -1); renderMonth(); });
  $('#next-month').addEventListener('click', () => { cursor = addMonths(cursor, 1); renderMonth(); });
  document.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
    cursor = addMonths(currentMonth(), Number(b.dataset.jump));
    renderMonth();
  }));

  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  $('#occ-list').addEventListener('change', (e) => {
    const key = e.target.dataset.paid;
    if (!key) return;
    if (e.target.checked) state.paid[key] = true;
    else delete state.paid[key];
    save();
    renderMonth();
  });

  document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-edit]');
    if (row) openForm(row.dataset.edit);
  });

  $('#add-btn').addEventListener('click', () => openForm(null));
  form.addEventListener('submit', submitForm);
  form.addEventListener('change', (e) => { if (e.target.name === 'frequency') updateFormMode(); });
  form.elements.name.addEventListener('input', guessCategory);
  form.elements.category.addEventListener('change', () => { categoryTouched = true; });
  dialog.querySelector('[data-close]').addEventListener('click', closeForm);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeForm(); });
  $('#delete-btn').addEventListener('click', deleteExpense);

  $('#export-btn').addEventListener('click', exportData);
  $('#import-input').addEventListener('change', importData);
  $('#reset-btn').addEventListener('click', resetData);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    $('#install-btn').hidden = false;
  });
  $('#install-btn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    $('#install-btn').hidden = true;
  });
  window.addEventListener('appinstalled', updateInstallState);

  // Rafraîchit l'affichage quand on revient sur l'app (changement de jour, etc.)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
}

fillFormOptions();
bind();
updateInstallState();
$('#version').textContent = `Budget v${APP_VERSION}`;
setView('month');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
