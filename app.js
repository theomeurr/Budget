'use strict';

const APP_VERSION = '1.2.0';
const STORAGE_KEY = 'budget.v1';

// Couleurs proposées pour les catégories créées par l'utilisateur
const PALETTE = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#65a30d', '#059669', '#0891b2', '#64748b', '#a8a29e'];
const NO_CATEGORY = { id: '', name: 'Sans catégorie', icon: '', color: '#a8a29e' };

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
const byName = (a, b) => a.name.localeCompare(b.name, 'fr');
const categoryOf = (e) => state.categories.find((c) => c.id === e.category) || NO_CATEGORY;
const catColor = (c) => (/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : NO_CATEGORY.color);
const catIcon = (c) => c.icon || (c.id ? c.name.charAt(0).toUpperCase() : '•');
const catLabel = (c) => (c.icon ? `${c.icon} ${c.name}` : c.name);

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

// Une échéance est considérée payée automatiquement dès que sa date est arrivée.
// `state.paid[key]` ne garde que les choix manuels qui diffèrent de ce comportement.
const autoPaid = (date) => date <= todayISO();

const isPlanned = (e) => e.frequency === 'once';
const subscriptions = () => state.expenses.filter((e) => !isPlanned(e));
const plannedExpenses = () => state.expenses.filter(isPlanned);
const byDate = (a, b) => a.date.localeCompare(b.date) || a.e.name.localeCompare(b.e.name, 'fr');
const sumAmounts = (rows) => round2(rows.reduce((s, x) => s + x.e.amount, 0));

function toOccurrence(e, date) {
  const { y, m } = parseISO(date);
  const key = `${e.id}@${monthKey(y, m)}`;
  return { e, date, key, paid: key in state.paid ? state.paid[key] : autoPaid(date) };
}

function occurrencesIn(expenses, y, m) {
  return expenses
    .map((e) => {
      const date = occurrenceIn(e, y, m);
      return date && toOccurrence(e, date);
    })
    .filter(Boolean)
    .sort(byDate);
}

// ---------- Stockage local ----------
function isValidData(data) {
  return !!data && Array.isArray(data.expenses) && data.expenses.every((e) =>
    e && typeof e.id === 'string' && typeof e.name === 'string' && Number.isFinite(e.amount) &&
    FREQUENCIES[e.frequency] && /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
    (!e.end || /^\d{4}-\d{2}-\d{2}$/.test(e.end))) &&
    (!data.categories || (Array.isArray(data.categories) && data.categories.every((c) =>
      c && typeof c.id === 'string' && typeof c.name === 'string')));
}

const emptyState = () => ({ expenses: [], categories: [], paid: {} });
const fromData = (data) => ({ expenses: data.expenses, categories: data.categories || [], paid: data.paid || {} });

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isValidData(data)) return fromData(data);
  } catch (_) { /* stockage indisponible ou corrompu */ }
  return emptyState();
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
let view = 'subs';
let subsMode = 'month'; // 'month' : échéances d'un mois, 'all' : liste de tous les abonnements
let cursor = currentMonth();
let editingId = null;
let formKind = 'sub'; // 'sub' : abonnement, 'planned' : dépense à prévoir
let editingCatId = null;
let catFromExpense = false;
let lastCategoryValue = '';
let deferredInstall = null;

// ---------- Rendu commun ----------
function occRow(it) {
  const c = categoryOf(it.e);
  const late = !it.paid && it.date < todayISO();
  const tags = [esc(catLabel(c))];
  if (!isPlanned(it.e) && it.e.frequency !== 'monthly') tags.push(`<em class="tag-extra">${FREQUENCIES[it.e.frequency].label}</em>`);
  if (isPlanned(it.e) && it.e.note) tags.push(esc(it.e.note));
  if (late) tags.push('<em class="tag-late">Non payé</em>');
  return `
    <li class="occ${it.paid ? ' is-paid' : ''}">
      <label class="check">
        <input type="checkbox" data-paid="${it.key}" data-date="${it.date}" ${it.paid ? 'checked' : ''} aria-label="${esc(it.e.name)} payé">
        <span></span>
      </label>
      <button type="button" class="row" data-edit="${it.e.id}">
        <span class="date"><b>${parseISO(it.date).d}</b><small>${fmtShortMonth.format(isoToDate(it.date)).replace('.', '')}</small></span>
        <span class="info">
          <span class="name">${esc(it.e.name)}</span>
          <span class="meta">${tags.join(' · ')}</span>
        </span>
        <span class="amount">${eur.format(it.e.amount)}</span>
      </button>
    </li>`;
}

function section(title, right, rowsHtml, collapsed = false) {
  const head = `<h2 class="section"><span>${collapsed ? '<span class="chev">›</span> ' : ''}${title}</span><span>${right}</span></h2>`;
  const list = `<ul class="list">${rowsHtml}</ul>`;
  return collapsed ? `<details class="group"><summary>${head}</summary>${list}</details>` : head + list;
}

const emptyList = (html) => `<ul class="list"><li class="empty">${html}</li></ul>`;

// ---------- Rendu : abonnements ----------
function renderSubs() {
  const now = currentMonth();
  const offset = (cursor.y - now.y) * 12 + (cursor.m - now.m);
  const all = subsMode === 'all';
  document.querySelectorAll('[data-jump]').forEach((b) => b.classList.toggle('active',
    b.dataset.jump === 'all' ? all : !all && Number(b.dataset.jump) === offset));
  $('#subs-month').hidden = all;
  $('#subs-all').hidden = !all;
  if (all) renderSubsAll();
  else renderSubsMonth(offset);
}

function renderSubsMonth(offset) {
  const { y, m } = cursor;
  $('#month-label').textContent = cap(fmtMonthYear.format(new Date(y, m, 1)));
  $('#month-hint').textContent = { '-1': 'Mois dernier', 0: 'Ce mois-ci', 1: 'Mois prochain' }[offset] || '';

  const items = occurrencesIn(subscriptions(), y, m);
  const total = sumAmounts(items);
  const paid = sumAmounts(items.filter((it) => it.paid));
  $('#month-total').textContent = eur.format(total);
  $('#month-paid').textContent = eur.format(paid);
  $('#month-left').textContent = eur.format(round2(total - paid));
  $('#month-progress').style.width = total ? `${(paid / total) * 100}%` : '0';
  $('#month-count').textContent = items.length ? `${items.filter((it) => it.paid).length}/${items.length} payés` : '';

  // Les abonnements non mensuels (annuel, trimestriel…) sont faciles à oublier : on les signale
  const periodic = items.filter((it) => it.e.frequency !== 'monthly');
  const extra = $('#month-extra');
  extra.hidden = !periodic.length;
  if (periodic.length) {
    const names = periodic.map((it) => esc(it.e.name)).join(', ');
    extra.innerHTML = `⚠️ En plus des mensuels : <b>${eur.format(sumAmounts(periodic))}</b> (${names})`;
  }

  const list = $('#occ-list');
  if (!items.length) {
    list.innerHTML = subscriptions().length
      ? '<li class="empty">Aucun prélèvement ce mois-ci 🎉</li>'
      : '<li class="empty">Aucun abonnement pour l’instant.<br>Touche <b>+</b> pour ajouter le premier.</li>';
  } else {
    list.innerHTML = items.map(occRow).join('');
  }

  const byCat = new Map();
  for (const it of items) {
    const c = categoryOf(it.e);
    byCat.set(c, (byCat.get(c) || 0) + it.e.amount);
  }
  const entries = [...byCat].sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 1;
  $('#cat-section').hidden = entries.length < 2;
  $('#cat-list').innerHTML = entries.map(([c, v]) => `
    <li>
      <div class="cat-row"><span>${esc(catLabel(c))}</span><b>${eur.format(round2(v))}</b></div>
      <div class="bar"><span style="width:${(v / max) * 100}%;background:${catColor(c)}"></span></div>
    </li>`).join('');
}

function subRow({ e, next }) {
  const c = categoryOf(e);
  const f = FREQUENCIES[e.frequency];
  let detail;
  if (!next) detail = `${f.label} · terminé`;
  else if (e.frequency === 'monthly') detail = `Le ${dayLabel(parseISO(e.date).d)} de chaque mois`;
  else detail = `${f.label} · prochain le ${fmtLongDate.format(isoToDate(next))}`;
  if (e.note) detail += ` · ${esc(e.note)}`;
  const perMonth = f.months > 1 ? `<small>≈ ${eur.format(round2(e.amount / f.months))}/mois</small>` : '';
  return `
    <li${next ? '' : ' class="is-done"'}>
      <button type="button" class="row" data-edit="${e.id}">
        <span class="cat-icon" style="--c:${catColor(c)}">${esc(catIcon(c))}</span>
        <span class="info">
          <span class="name">${esc(e.name)}</span>
          <span class="meta">${detail}</span>
        </span>
        <span class="amount">${eur.format(e.amount)}${perMonth}</span>
      </button>
    </li>`;
}

function renderSubsAll() {
  const today = todayISO();
  const all = subscriptions().map((e) => ({ e, next: nextOccurrence(e, today) }));
  const active = all.filter((x) => x.next);

  const monthlyAvg = active.reduce((s, x) => s + x.e.amount / FREQUENCIES[x.e.frequency].months, 0);
  $('#subs-monthly').textContent = eur.format(round2(monthlyAvg));
  $('#subs-yearly').textContent = eur.format(round2(monthlyAvg * 12));
  $('#subs-count').textContent = active.length;

  const byDay = (a, b) => parseISO(a.e.date).d - parseISO(b.e.date).d || a.e.name.localeCompare(b.e.name, 'fr');
  const monthly = active.filter((x) => x.e.frequency === 'monthly').sort(byDay);
  const periodic = active.filter((x) => x.e.frequency !== 'monthly').sort((a, b) => a.next.localeCompare(b.next));
  const done = all.filter((x) => !x.next).sort((a, b) => b.e.date.localeCompare(a.e.date));

  const html = [
    monthly.length ? section('Mensuels', eur.format(sumAmounts(monthly)), monthly.map(subRow).join('')) : '',
    periodic.length ? section('Trimestriels, semestriels, annuels', periodic.length, periodic.map(subRow).join('')) : '',
    done.length ? section('Terminés', done.length, done.map(subRow).join(''), true) : '',
  ].join('');
  $('#subs-groups').innerHTML = html ||
    `<h2 class="section"><span>Liste</span></h2>${emptyList('Aucun abonnement pour l’instant.<br>Touche <b>+</b> pour ajouter le premier.')}`;
}

// ---------- Rendu : dépenses à prévoir ----------
function renderPlanned() {
  const now = currentMonth();
  const thisKey = monthKey(now.y, now.m);
  const next = addMonths(now, 1);
  const nextKey = monthKey(next.y, next.m);
  const items = plannedExpenses().map((e) => toOccurrence(e, e.date)).sort(byDate);
  const inMonth = (k) => items.filter((it) => it.date.slice(0, 7) === k);

  $('#planned-left').textContent = eur.format(sumAmounts(items.filter((it) => !it.paid)));
  $('#planned-this').textContent = eur.format(sumAmounts(inMonth(thisKey)));
  $('#planned-next').textContent = eur.format(sumAmounts(inMonth(nextKey)));

  const months = new Map();
  const past = [];
  for (const it of items) {
    const k = it.date.slice(0, 7);
    if (k < thisKey) past.push(it);
    else months.set(k, [...(months.get(k) || []), it]);
  }

  const html = [...months].map(([k, rows]) => {
    const { y, m } = parseISO(`${k}-01`);
    const hint = { [thisKey]: ' · ce mois-ci', [nextKey]: ' · mois prochain' }[k] || '';
    return section(`${cap(fmtMonthYear.format(new Date(y, m, 1)))}${hint}`, eur.format(sumAmounts(rows)), rows.map(occRow).join(''));
  });
  if (!months.size) {
    html.push(`<h2 class="section"><span>À venir</span></h2>${emptyList(
      'Rien à prévoir pour l’instant.<br>Touche <b>+</b> pour ajouter une dépense<br>(contrôle technique, cadeau, vacances…).')}`);
  }
  if (past.length) html.push(section('Passées', past.length, past.reverse().map(occRow).join(''), true));
  $('#planned-groups').innerHTML = html.join('');
}

function render() {
  if (view === 'subs') renderSubs();
  if (view === 'planned') renderPlanned();
  if (view === 'settings') renderCategories();
}

function setView(next) {
  view = next;
  for (const v of ['subs', 'planned', 'settings']) $(`#view-${v}`).hidden = v !== view;
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  const add = $('#add-btn');
  add.hidden = view === 'settings';
  add.setAttribute('aria-label', view === 'planned' ? 'Ajouter une dépense à prévoir' : 'Ajouter un abonnement');
  window.scrollTo(0, 0);
  render();
}

// ---------- Formulaire ----------
const dialog = $('#form-dialog');
const form = $('#expense-form');

function fillFormOptions() {
  $('#freq-chips').innerHTML = Object.entries(FREQUENCIES).filter(([k]) => k !== 'once').map(([k, f]) =>
    `<label><input type="radio" name="frequency" value="${k}"><span>${f.label}</span></label>`).join('');
  $('#color-swatches').innerHTML = PALETTE.map((c) =>
    `<label><input type="radio" name="color" value="${c}" aria-label="Couleur ${c}"><span style="--c:${c}"></span></label>`).join('');
}

function fillCategorySelect(selected) {
  const select = form.elements.category;
  select.innerHTML = `<option value="">${NO_CATEGORY.name}</option>` +
    [...state.categories].sort(byName).map((c) => `<option value="${esc(c.id)}">${esc(catLabel(c))}</option>`).join('') +
    '<option value="__new">＋ Nouvelle catégorie…</option>';
  lastCategoryValue = state.categories.some((c) => c.id === selected) ? selected : '';
  select.value = lastCategoryValue;
}

function updateFormMode() {
  const planned = formKind === 'planned';
  const f = planned ? FREQUENCIES.once : FREQUENCIES[form.elements.frequency.value] || FREQUENCIES.monthly;
  $('#freq-field').hidden = planned;
  $('#date-label').textContent = planned ? 'Date prévue' : f.dateLabel;
  $('#date-help').textContent = planned ? 'Elle apparaîtra dans le mois correspondant.' : f.help;
  $('#end-field').hidden = planned;
}

function defaultDate() {
  const now = currentMonth();
  const inOtherMonth = view === 'subs' && subsMode === 'month' && (cursor.y !== now.y || cursor.m !== now.m);
  if (!inOtherMonth) return todayISO();
  return toISO(cursor.y, cursor.m, Math.min(new Date().getDate(), daysInMonth(cursor.y, cursor.m)));
}

function openForm(id) {
  const e = id ? state.expenses.find((x) => x.id === id) : null;
  editingId = e ? e.id : null;
  formKind = (e ? isPlanned(e) : view === 'planned') ? 'planned' : 'sub';
  const planned = formKind === 'planned';
  form.reset();
  $('#form-error').textContent = '';
  $('#form-title').textContent = planned
    ? (e ? 'Modifier la dépense' : 'Dépense à prévoir')
    : (e ? 'Modifier l’abonnement' : 'Nouvel abonnement');
  $('#delete-btn').textContent = planned ? 'Supprimer cette dépense' : 'Supprimer cet abonnement';
  $('#delete-btn').hidden = !e;

  const el = form.elements;
  el.name.placeholder = planned ? 'Ex : contrôle technique, cadeau, vacances' : 'Ex : Netflix, loyer, assurance auto';
  el.name.value = e ? e.name : '';
  el.amount.value = e ? String(e.amount).replace('.', ',') : '';
  el.frequency.value = e && !planned ? e.frequency : 'monthly';
  el.date.value = e ? e.date : defaultDate();
  el.end.value = e && e.end ? e.end : '';
  fillCategorySelect(e ? e.category : '');
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
  const frequency = formKind === 'planned' ? 'once' : el.frequency.value;
  const date = el.date.value;
  const end = frequency !== 'once' && el.end.value ? el.end.value : '';
  const error = $('#form-error');

  if (!name) { error.textContent = 'Indique un nom.'; el.name.focus(); return; }
  if (!Number.isFinite(amount) || amount <= 0) { error.textContent = 'Indique un montant valide (ex : 12,99).'; el.amount.focus(); return; }
  if (!FREQUENCIES[frequency]) { error.textContent = 'Choisis une fréquence.'; return; }
  if (!date) { error.textContent = 'Choisis une date.'; el.date.focus(); return; }
  if (end && end < date) { error.textContent = 'La date de fin doit être après le premier prélèvement.'; el.end.focus(); return; }

  const data = { name, amount, frequency, date, end, category: lastCategoryValue, note: el.note.value.trim() };
  if (editingId) {
    const e = state.expenses.find((x) => x.id === editingId);
    Object.assign(e, data);
    toast('Modifications enregistrées');
  } else {
    state.expenses.push({ id: uid(), ...data });
    toast(formKind === 'planned' ? 'Dépense à prévoir ajoutée' : 'Abonnement ajouté');
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
  toast('Supprimé');
}

// ---------- Catégories ----------
const catDialog = $('#cat-dialog');
const catForm = $('#cat-form');

function renderCategories() {
  const counts = {};
  for (const e of state.expenses) counts[e.category] = (counts[e.category] || 0) + 1;
  $('#cat-manage').innerHTML = state.categories.length
    ? [...state.categories].sort(byName).map((c) => `
      <li>
        <button type="button" class="row" data-edit-cat="${esc(c.id)}">
          <span class="cat-icon" style="--c:${catColor(c)}">${esc(catIcon(c))}</span>
          <span class="info">
            <span class="name">${esc(c.name)}</span>
            <span class="meta">${plural(counts[c.id] || 0, 'dépense')}</span>
          </span>
          <span class="chev-right" aria-hidden="true">›</span>
        </button>
      </li>`).join('')
    : '<li class="empty">Aucune catégorie pour l’instant.<br>Crée les tiennes ci-dessous.</li>';
}

// `fromExpense` : ouverte depuis le formulaire de dépense, la nouvelle catégorie y sera sélectionnée
function openCatForm(id, fromExpense = false) {
  const c = id ? state.categories.find((x) => x.id === id) : null;
  editingCatId = c ? c.id : null;
  catFromExpense = fromExpense;
  catForm.reset();
  $('#cat-error').textContent = '';
  $('#cat-title').textContent = c ? 'Modifier la catégorie' : 'Nouvelle catégorie';
  $('#cat-delete-btn').hidden = !c;
  catForm.elements.name.value = c ? c.name : '';
  catForm.elements.icon.value = c ? c.icon : '';
  catForm.elements.color.value = c ? c.color : PALETTE[state.categories.length % PALETTE.length];
  catDialog.showModal();
  if (!c) catForm.elements.name.focus();
}

function onCatFormClosed() {
  if (catFromExpense) fillCategorySelect(lastCategoryValue);
  catFromExpense = false;
  editingCatId = null;
}

function submitCatForm(event) {
  event.preventDefault();
  const name = catForm.elements.name.value.trim();
  const error = $('#cat-error');
  if (!name) { error.textContent = 'Donne un nom à cette catégorie.'; catForm.elements.name.focus(); return; }
  const duplicate = state.categories.some((c) => c.id !== editingCatId && c.name.toLowerCase() === name.toLowerCase());
  if (duplicate) { error.textContent = 'Cette catégorie existe déjà.'; catForm.elements.name.focus(); return; }

  const existing = state.categories.find((c) => c.id === editingCatId);
  const data = {
    name,
    icon: catForm.elements.icon.value.trim(),
    color: catForm.elements.color.value || (existing ? existing.color : PALETTE[0]),
  };
  if (existing) {
    Object.assign(existing, data);
    toast('Catégorie modifiée');
  } else {
    const c = { id: uid(), ...data };
    state.categories.push(c);
    if (catFromExpense) lastCategoryValue = c.id;
    toast('Catégorie créée');
  }
  save();
  catDialog.close();
  render();
}

function deleteCategory() {
  const c = state.categories.find((x) => x.id === editingCatId);
  if (!c) return;
  const used = state.expenses.filter((e) => e.category === c.id).length;
  const message = used
    ? `Supprimer « ${c.name} » ? ${plural(used, 'dépense')} passer${used > 1 ? 'ont' : 'a'} en « ${NO_CATEGORY.name} ».`
    : `Supprimer « ${c.name} » ?`;
  if (!confirm(message)) return;
  state.categories = state.categories.filter((x) => x.id !== c.id);
  for (const e of state.expenses) if (e.category === c.id) e.category = '';
  save();
  catDialog.close();
  render();
  toast('Catégorie supprimée');
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
    state = fromData(data);
    save();
    toast(`${plural(state.expenses.length, 'dépense')} importée${state.expenses.length > 1 ? 's' : ''}`);
    render();
  }).catch(() => toast('Fichier invalide'));
}

function resetData() {
  if (!confirm('Effacer toutes tes dépenses de cet appareil ? Cette action est définitive.')) return;
  state = emptyState();
  save();
  toast('Toutes les données ont été effacées');
  render();
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
  $('#prev-month').addEventListener('click', () => { cursor = addMonths(cursor, -1); renderSubs(); });
  $('#next-month').addEventListener('click', () => { cursor = addMonths(cursor, 1); renderSubs(); });
  document.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.jump === 'all') {
      subsMode = 'all';
    } else {
      subsMode = 'month';
      cursor = addMonths(currentMonth(), Number(b.dataset.jump));
    }
    renderSubs();
  }));

  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  document.addEventListener('change', (e) => {
    const key = e.target.dataset.paid;
    if (!key) return;
    const date = e.target.dataset.date;
    // On ne garde le choix que s'il diffère du cochage automatique
    if (e.target.checked === autoPaid(date)) delete state.paid[key];
    else state.paid[key] = e.target.checked;
    save();
    render();
  });

  document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-edit]');
    if (row) openForm(row.dataset.edit);
    const catRow = e.target.closest('[data-edit-cat]');
    if (catRow) openCatForm(catRow.dataset.editCat);
  });

  $('#add-btn').addEventListener('click', () => openForm(null));
  form.addEventListener('submit', submitForm);
  form.addEventListener('change', (e) => { if (e.target.name === 'frequency') updateFormMode(); });
  form.elements.category.addEventListener('change', (e) => {
    if (e.target.value === '__new') openCatForm(null, true);
    else lastCategoryValue = e.target.value;
  });
  dialog.querySelector('[data-close]').addEventListener('click', closeForm);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeForm(); });
  $('#delete-btn').addEventListener('click', deleteExpense);

  $('#add-cat-btn').addEventListener('click', () => openCatForm(null));
  catForm.addEventListener('submit', submitCatForm);
  catDialog.querySelector('[data-close]').addEventListener('click', () => catDialog.close());
  catDialog.addEventListener('click', (e) => { if (e.target === catDialog) catDialog.close(); });
  catDialog.addEventListener('close', onCatFormClosed);
  $('#cat-delete-btn').addEventListener('click', deleteCategory);

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
setView('subs');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
