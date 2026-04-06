import { state } from './state.js';
import { api, setForceLogoutHandler } from './api.js';
import { showToast } from './toast.js';
import { loadShelfBooks, loadAdminUsers, loadMyShelves, loadActiveShelfBooks, loadAllBooksReviews, loadPendingInvitations, loadPendingRequests } from './data.js';
import { renderHeader, bindHeaderEvents } from './views/header.js';
import { renderAuthPage, bindAuthEvents } from './views/auth.js';
import { renderShelfPage } from './views/shelf.js';
import { bindShelfEvents } from './views/shelf-events.js';
import { renderSearchResults, bindSearchResultEvents } from './views/search.js';
import { renderAdminPage, bindAdminEvents } from './views/admin.js';
import { renderPendingPage } from './views/pending.js';
import { closeModal } from './views/modal.js';
import { renderShelvesPage } from './views/shelves.js';
import { bindShelvesEvents } from './views/shelves-events.js';
import { renderPendingAccessPage, bindPendingAccessEvents } from './views/pending-access.js';

// ── App Root ──────────────────────────────────────────────────────────
export function renderApp() {
  const app = document.getElementById('app');

  if (state.view === 'auth') {
    app.innerHTML = renderAuthPage();
    bindAuthEvents();
    return;
  }

  app.innerHTML = `
    ${renderHeader()}
    <main class="main-content">
      <div class="container" id="page-body">
        ${state.view === 'shelf'   ? renderShelfPage()         : ''}
        ${state.view === 'pending' ? renderPendingPage()       : ''}
        ${state.view === 'admin'   ? renderAdminPage()         : ''}
        ${state.view === 'shelves' ? (state.searchQuery ? renderSearchResults() : '') + renderShelvesPage() : ''}
        ${state.view === 'access'  ? renderPendingAccessPage() : ''}
      </div>
    </main>`;

  bindHeaderEvents();
  if (state.view === 'shelf')   { bindShelfEvents(); if (state.searchQuery) bindSearchResultEvents(); }
  if (state.view === 'admin')   bindAdminEvents();
  if (state.view === 'shelves') { bindShelvesEvents(); if (state.searchQuery) bindSearchResultEvents(); }
  if (state.view === 'access')  bindPendingAccessEvents();
  if (state.view === 'pending') {
    document.getElementById('pending-logout')?.addEventListener('click', doLogout);
  }
}

// ── Navigation ────────────────────────────────────────────────────────
export function refreshPageBody() {
  const body = document.getElementById('page-body');
  if (!body) return;

  if (state.view === 'shelf') {
    body.innerHTML = renderShelfPage();
    bindShelfEvents();
    if (state.searchQuery) bindSearchResultEvents();
  } else if (state.view === 'admin') {
    body.innerHTML = renderAdminPage();
    bindAdminEvents();
  } else if (state.view === 'shelves') {
    body.innerHTML = (state.searchQuery ? renderSearchResults() : '') + renderShelvesPage();
    // NOTE: callers of refreshPageBody() are responsible for calling bindShelvesEvents()
    // to avoid double-binding (which causes toggle buttons to fire twice).
  } else if (state.view === 'access') {
    body.innerHTML = renderPendingAccessPage();
    bindPendingAccessEvents();
  }
}

export async function switchToShelf() {
  state.view = 'shelf';
  state.searchQuery = '';
  state.searchResults = [];
  state.readLaterFilter = false;
  state.loadingShelf = true;
  renderApp();

  await Promise.all([loadShelfBooks(), loadMyShelves()]);
  state.loadingShelf = false;
  refreshPageBody();
  loadAllBooksReviews().then(() => refreshPageBody());
}

export async function switchToMyShelves() {
  state.view = 'shelves';
  state.searchQuery = '';
  state.searchResults = [];
  state.shelvesTab = 'shelf';
  state.allShelvesBooks = [];
  renderApp();

  await Promise.all([loadMyShelves(), loadPendingInvitations(), loadPendingRequests()]);

  // Auto-select first shelf and load its books
  if (state.myShelves.length > 0) {
    if (!state.activeShelfId || !state.myShelves.find(s => s.id === state.activeShelfId)) {
      state.activeShelfId = state.myShelves[0].id;
    }
    state.activeShelfBooks = [];
    state.loadingShelfBooks = true;
    refreshPageBody();
    await loadActiveShelfBooks();
  }
  refreshPageBody();
  bindShelvesEvents();
}

export async function switchToAdmin() {
  state.view = 'admin';
  state.adminSearchQuery = '';
  renderApp();
  await loadAdminUsers();
  refreshPageBody();
  bindAdminEvents();
}

export async function switchToAccess() {
  state.view = 'access';
  renderApp();
  await Promise.all([loadPendingInvitations(), loadPendingRequests()]);
  refreshPageBody();
  bindPendingAccessEvents();
}

export async function loadInitialView() {
  const { ok, data: meData } = await api('/me');
  if (!ok || !meData) {
    state.view = 'auth';
    renderApp();
    return;
  }

  state.user = meData;

  const { ok: shelfOk, data: shelfData } = await api('/shelf');
  if (!shelfOk) {
    state.view = 'auth'; renderApp(); return;
  }

  if (!shelfData.is_member) {
    state.view = 'pending'; renderApp(); return;
  }

  await switchToMyShelves();
}

export async function doLogout() {
  await api('/logout');
  state.user = null;
  state.shelfBooks = [];
  state.searchResults = [];
  state.searchQuery = '';
  state.myShelves = [];
  state.activeShelfId = null;
  state.activeShelfBooks = [];
  state.readLaterReviews = {};
  state.pendingInvitations = [];
  state.pendingRequests = [];
  state.view = 'auth';
  renderApp();
}

function forceLogout() {
  state.user = null;
  state.shelfBooks = [];
  state.searchResults = [];
  state.searchQuery = '';
  state.searchLoading = false;
  state.myShelves = [];
  state.activeShelfId = null;
  state.activeShelfBooks = [];
  state.readLaterReviews = {};
  state.pendingInvitations = [];
  state.pendingRequests = [];
  state.view = 'auth';
  showToast('Your session expired. Please sign in again.', 'error');
  renderApp();
}

setForceLogoutHandler(forceLogout);

// ── Init ──────────────────────────────────────────────────────────────
async function init() {
  const loading = document.getElementById('loading-screen');

  await loadInitialView();

  if (loading) {
    loading.style.opacity = '0';
    setTimeout(() => loading.remove(), 400);
  }

  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      document.getElementById('search-input')?.focus();
    }
    if (e.key === 'Escape') closeModal();
  });
}

init();
