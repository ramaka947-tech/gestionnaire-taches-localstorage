'use strict';

/* ==========================================
   1. CONSTANTES & AUTHENTIFICATION
   ========================================== */
const USERS_KEY = 'tm_users';
const SESSION_KEY = 'tm_session';
const NOTIF_KEY = 'tm_notifs_read';

const STATUSES = { todo: 'À faire', progress: 'En cours', done: 'Terminé' };
const PRIORITIES = { low: 'Basse', normal: 'Normale', high: 'Haute' };
const CATEGORIES = { work: 'Travail', project: 'Projet', assignment: 'Devoir', research: 'Recherche', other: 'Autre' };

const $ = (id) => document.getElementById(id);
const has = (obj, key) => Object.hasOwn(obj, key);

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function setSession(user) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else localStorage.removeItem(SESSION_KEY);
}
function getTasksKey() {
  const session = getSession();
  return session ? `tasks_${session.email}` : 'tasks_guest';
}

let isRegisterMode = false;

function initAuth() {
  const session = getSession();
  if (session) {
    $('auth-screen').style.display = 'none';
    $('app-screen').style.display = 'block';
    $('user-name').textContent = session.name;
    $('user-avatar').textContent = session.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    
    tasks = loadTasks();
    render();
  } else {
    $('auth-screen').style.display = 'grid';
    $('app-screen').style.display = 'none';
  }
}

$('auth-switch-btn').addEventListener('click', () => {
  isRegisterMode = !isRegisterMode;
  $('name-group').style.display = isRegisterMode ? 'block' : 'none';
  $('auth-submit-btn').textContent = isRegisterMode ? 'Créer mon compte' : 'Se connecter';
  $('auth-switch-btn').textContent = isRegisterMode ? 'Déjà un compte ?' : 'Créer un compte';
  $('auth-error').textContent = '';
});

$('auth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $('auth-email').value.trim().toLowerCase();
  const pass = $('auth-pass').value;
  const name = $('auth-name').value.trim();
  const err = $('auth-error');

  if (!email || !pass) { err.textContent = 'Email et mot de passe requis.'; return; }

  try {
    let users = JSON.parse(localStorage.getItem(USERS_KEY)) || [];

    if (isRegisterMode) {
      if (!name) { err.textContent = 'Le nom complet est requis.'; return; }
      if (users.find(u => u.email === email)) { err.textContent = 'Cet email est déjà utilisé.'; return; }
      
      users.push({ name, email, pass });
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      setSession({ name, email });
    } else {
      const user = users.find(u => u.email === email && u.pass === pass);
      if (!user) { err.textContent = 'Email ou mot de passe incorrect.'; return; }
      setSession({ name: user.name, email: user.email });
    }
    initAuth();
  } catch {
    err.textContent = 'Erreur de stockage local.';
  }
});

$('logout-btn').addEventListener('click', () => {
  setSession(null);
  initAuth();
});

/* ==========================================
   2. UTILITAIRES & LOGIQUE MÉTIER
   ========================================== */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function formatDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function icon(name, cls) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ==========================================
   3. STOCKAGE DES TÂCHES
   ========================================== */
function loadTasks() {
  try {
    const key = getTasksKey();
    const data = JSON.parse(localStorage.getItem(key));
    if (!Array.isArray(data)) return [];
    const seen = new Set();
    const clean = [];
    for (const t of data) {
      if (!t || typeof t !== 'object') continue;
      if (typeof t.id !== 'string' || !t.id || seen.has(t.id)) continue;
      if (typeof t.title !== 'string' || !t.title.trim()) continue;
      if (!isValidDate(t.dueDate)) continue;
      if (!has(STATUSES, t.status) || !has(PRIORITIES, t.priority)) continue;
      seen.add(t.id);
      clean.push({
        id: t.id,
        title: t.title,
        description: typeof t.description === 'string' ? t.description : '',
        dueDate: t.dueDate,
        status: t.status,
        priority: t.priority,
        category: has(CATEGORIES, String(t.category).toLowerCase()) ? String(t.category).toLowerCase() : 'other',
        favorite: t.favorite === true,
        archived: t.archived === true,
      });
    }
    return clean;
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(getTasksKey(), JSON.stringify(tasks));
  } catch {
    alert('Impossible d’enregistrer : le stockage du navigateur est indisponible.');
  }
}

/* ==========================================
   4. ÉTAT GLOBAL
   ========================================== */
let tasks = [];
const DEFAULT_FILTERS = { search: '', status: 'all', priority: 'all', due: 'all', fav: 'all', sort: 'asc' };
const filters = { ...DEFAULT_FILTERS };
let openMenuId = null;

function uid() {
  let id;
  do {
    id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  } while (tasks.some((t) => t.id === id));
  return id;
}

const isLate = (t) => t.status !== 'done' && t.dueDate < todayStr();

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function matchesDue(t) {
  const today = todayStr();
  switch (filters.due) {
    case 'late': return isLate(t);
    case 'today': return t.dueDate === today;
    case 'week': return t.dueDate >= today && t.dueDate <= addDays(today, 7);
    default: return true;
  }
}

const activeFilterCount = () => ['status', 'priority', 'due', 'fav'].filter((k) => filters[k] !== DEFAULT_FILTERS[k]).length;
const isFiltering = () => activeFilterCount() > 0 || filters.search.trim() !== '';

function visibleTasks() {
  const q = filters.search.trim().toLowerCase();
  return tasks
    .filter((t) => (filters.status === 'archived' ? t.archived : !t.archived))
    .filter((t) => filters.status === 'all' || filters.status === 'archived' || t.status === filters.status)
    .filter((t) => filters.fav === 'all' || t.favorite)
    .filter(matchesDue)
    .filter((t) => filters.priority === 'all' || t.priority === filters.priority)
    .filter((t) => !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
    .sort((a, b) => (filters.sort === 'asc' ? a.dueDate.localeCompare(b.dueDate) : b.dueDate.localeCompare(a.dueDate)));
}

function validate(d) {
  if (!d.title) return 'Le titre est obligatoire.';
  if (d.title.length > 100) return 'Le titre ne doit pas dépasser 100 caractères.';
  if (!isValidDate(d.dueDate)) return 'Choisissez une date limite valide.';
  if (!has(PRIORITIES, d.priority)) return 'Priorité invalide.';
  if (!has(STATUSES, d.status)) return 'Statut invalide.';
  if (!has(CATEGORIES, d.category)) return 'Catégorie invalide.';
  return '';
}

function markDone(id) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, status: 'done' } : t));
  saveTasks();
  render();
}

function toggleFavorite(id) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, favorite: !t.favorite } : t));
  saveTasks();
  render();
}

function toggleArchive(id) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, archived: !t.archived } : t));
  saveTasks();
  render();
}

function deleteTask(id) {
  if (!confirm('Supprimer définitivement cette tâche ?')) return;
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  render();
}

/* ==========================================
   5. RENDU
   ========================================== */
function menuButton(iconName, label, onClick, className) {
  const b = el('button', className);
  b.append(icon(iconName), document.createTextNode(label));
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenuId = null;
    onClick();
  });
  return b;
}

function buildCard(t) {
  const card = el('article', 'card' + (t.status === 'done' ? ' is-done' : ''));

  const top = el('div', 'card-top');
  const tags = el('div', 'tags');
  tags.append(el('span', `badge cat-${t.category}`, CATEGORIES[t.category]));
  const prio = el('span', `prio prio-${t.priority}`);
  prio.append(el('i', 'dot'), document.createTextNode(PRIORITIES[t.priority]));
  tags.append(prio);

  const menuBtn = el('button', 'menu-btn', '⋯');
  menuBtn.type = 'button';
  menuBtn.setAttribute('aria-label', 'Actions');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenuId = openMenuId === t.id ? null : t.id;
    render();
  });
  const right = el('div', 'card-right');
  if (t.favorite) right.append(icon('star', 'star'));
  right.append(menuBtn);
  top.append(tags, right);
  card.append(top);

  if (openMenuId === t.id) {
    const menu = el('div', 'menu');
    menu.append(menuButton('edit', 'Modifier la tâche', () => openForm(t), 'm-edit'));
    if (t.status !== 'done') menu.append(menuButton('check', 'Marquer comme terminée', () => markDone(t.id), 'm-done'));
    menu.append(menuButton('star', t.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', () => toggleFavorite(t.id), 'm-fav'));
    menu.append(menuButton('archive', t.archived ? 'Désarchiver' : 'Archiver', () => toggleArchive(t.id), 'm-archive'));
    menu.append(el('hr', 'menu-sep'));
    menu.append(menuButton('trash', 'Supprimer la tâche', () => deleteTask(t.id), 'danger'));
    card.append(menu);
  }

  card.append(el('h3', '', t.title));
  if (t.description) card.append(el('p', 'desc', t.description));

  const late = isLate(t);
  const foot = el('div', 'card-foot' + (late ? ' late' : ''));
  foot.append(icon('clock'), document.createTextNode(`${formatDate(t.dueDate)}${late ? ' (en retard)' : ''}`));
  card.append(foot);
  return card;
}

function renderNotif(lateTasks) {
  const badge = $('bell-count');
  let readState = [];
  try { readState = JSON.parse(localStorage.getItem(NOTIF_KEY)) || []; } catch {}
  
  const unreadTasks = lateTasks.filter(t => !readState.includes(t.id));
  
  badge.hidden = unreadTasks.length === 0;
  badge.textContent = unreadTasks.length;
  
  const box = $('notif');
  box.replaceChildren(el('strong', '', 'Tâches en retard'));
  
  if (lateTasks.length === 0) {
    box.append(el('p', 'empty', 'Aucune tâche en retard.'));
  } else {
    lateTasks.forEach((t) => {
      const p = el('p', 'notif-item', `${t.title} — ${formatDate(t.dueDate)}`);
      if (!readState.includes(t.id)) p.style.fontWeight = 'bold';
      box.append(p);
    });
  }
}

function renderStats() {
  const active = tasks.filter((t) => !t.archived);
  const total = active.length;
  const done = active.filter((t) => t.status === 'done').length;
  const lateTasks = active.filter(isLate);
  const late = lateTasks.length;
  const rate = total === 0 ? 0 : Math.round((done / total) * 100);
  
  $('stat-total').textContent = total;
  $('stat-done').textContent = done;
  $('stat-late').textContent = late;
  $('stat-rate').textContent = `${rate} %`;
  
  renderNotif(lateTasks);
}

function syncFilterUI() {
  $('filter-status').value = filters.status;
  $('filter-priority').value = filters.priority;
  $('filter-due').value = filters.due;
  $('filter-fav').value = filters.fav;
  $('sort').value = filters.sort;
  const n = activeFilterCount();
  $('filter-count').hidden = n === 0;
  $('filter-count').textContent = n;
}

function resetFilters() {
  Object.assign(filters, DEFAULT_FILTERS);
  $('search').value = '';
  render();
}

function render() {
  const list = visibleTasks();
  const board = $('board');
  board.replaceChildren();
  syncFilterUI();

  if (list.length === 0 && isFiltering()) {
    board.classList.remove('single');
    const box = el('div', 'no-result');
    box.setAttribute('role', 'status');
    box.append(icon('search'), el('p', '', 'Aucun résultat : aucune tâche ne correspond à votre recherche ou à vos filtres.'));
    const reset = el('button', 'btn-outline', 'Réinitialiser les filtres');
    reset.type = 'button';
    reset.addEventListener('click', resetFilters);
    box.append(reset);
    board.append(box);
    renderStats();
    return;
  }

  const archivedView = filters.status === 'archived';
  board.classList.toggle('single', filters.status !== 'all');
  const columns = archivedView
    ? [['archived', 'Archivées']]
    : Object.entries(STATUSES).filter(([key]) => filters.status === 'all' || key === filters.status);

  for (const [key, label] of columns) {
    const items = archivedView ? list : list.filter((t) => t.status === key);
    const col = el('section', 'column');
    col.append(el('h2', '', `${label} (${items.length})`));
    if (items.length === 0) col.append(el('p', 'empty', 'Aucune tâche'));
    items.forEach((t) => col.append(buildCard(t)));
    if (!archivedView) {
      const addLink = el('button', 'add-link');
      addLink.append(icon('plus'), document.createTextNode('Ajouter une tâche'));
      addLink.type = 'button';
      addLink.addEventListener('click', () => openForm(null, key));
      col.append(addLink);
    }
    board.append(col);
  }
  renderStats();
}

/* ==========================================
   6. FORMULAIRE
   ========================================== */
function openForm(task, status = 'todo') {
  $('error').textContent = '';
  $('task-id').value = task ? task.id : '';
  $('title').value = task ? task.title : '';
  $('description').value = task ? task.description : '';
  $('dueDate').value = task ? task.dueDate : todayStr();
  $('category').value = task ? task.category : 'work';
  $('priority').value = task ? task.priority : 'normal';
  $('status').value = task ? task.status : status;
  $('dialog-title').textContent = task ? 'Modifier la tâche' : 'Nouvelle tâche';
  $('dialog').showModal();
  $('title').focus();
}

$('add-btn').addEventListener('click', () => openForm(null));
$('cancel-btn').addEventListener('click', () => $('dialog').close());

$('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    title: $('title').value.trim(),
    description: $('description').value.trim(),
    dueDate: $('dueDate').value,
    category: $('category').value,
    priority: $('priority').value,
    status: $('status').value,
  };
  const error = validate(data);
  if (error) {
    $('error').textContent = error;
    return;
  }
  const id = $('task-id').value;
  if (id) {
    tasks = tasks.map((t) => (t.id === id ? { ...t, ...data } : t));
  } else {
    tasks = [...tasks, { id: uid(), ...data }];
  }
  saveTasks();
  $('dialog').close();
  render();
});

/* ==========================================
   7. ÉVÉNEMENTS
   ========================================== */
$('search').addEventListener('input', (e) => { filters.search = e.target.value; render(); });
$('filter-priority').addEventListener('change', (e) => { filters.priority = e.target.value; render(); });
$('sort').addEventListener('change', (e) => { filters.sort = e.target.value; render(); });
$('filter-status').addEventListener('change', (e) => { filters.status = e.target.value; render(); });
$('filter-due').addEventListener('change', (e) => { filters.due = e.target.value; render(); });
$('filter-fav').addEventListener('change', (e) => { filters.fav = e.target.value; render(); });
$('reset-btn').addEventListener('click', resetFilters);

$('filter-btn').addEventListener('click', () => {
  const panel = $('filters');
  panel.hidden = !panel.hidden;
  $('filter-btn').setAttribute('aria-expanded', String(!panel.hidden));
});

$('bell-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const isHidden = $('notif').hidden;
  $('notif').hidden = !isHidden;
  $('bell-btn').setAttribute('aria-expanded', String(!$('notif').hidden));
  
  if (isHidden) {
    const lateTasks = tasks.filter(t => !t.archived && isLate(t));
    const readState = lateTasks.map(t => t.id);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(readState));
    renderNotif(lateTasks);
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.notif-wrap')) {
    $('notif').hidden = true;
    $('bell-btn').setAttribute('aria-expanded', 'false');
  }
  if (openMenuId !== null) {
    openMenuId = null;
    render();
  }
});

document.querySelectorAll('.side-btn[data-target]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.side-btn').forEach((b) => b.classList.toggle('active', b === btn));
    $(btn.dataset.target).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('search').focus();
  }
});

/* ==========================================
   8. THÈME (Dark / Light)
   ========================================== */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('theme-use').setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
}

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch { }
const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : (prefersDark ? 'dark' : 'light'));

$('theme-btn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('theme', next); } catch { }
});

/* ==========================================
   9. DÉMARRAGE
   ========================================== */
$('search').value = filters.search;
$('filter-priority').value = filters.priority;
$('sort').value = filters.sort;

initAuth();