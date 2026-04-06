import { Icons } from '../icons.js';
import { escHtml, initials } from '../utils.js';
import { state } from '../state.js';
import { closeModal } from './modal.js';
import { doSearch, clearSearch } from './search.js';
// doLogout, switchToAdmin, switchToMyShelves, switchToAccess are imported from app.js.
// The circular reference is safe: these are only called inside event handlers.
import { doLogout, switchToAdmin, switchToMyShelves, switchToAccess } from '../app.js';

export function renderHeader() {
  const u = state.user;
  const pendingCount = (state.pendingInvitations?.length || 0) + (state.pendingRequests?.length || 0);
  return `
  <header class="header">
    <div class="header-logo" role="banner">
      ${Icons.book}
      <span>Bookshelf</span>
    </div>

    ${state.view !== 'pending' ? `
    <div class="header-search">
      ${Icons.search.replace('<svg', '<svg class="search-icon"')}
      <input type="search" id="search-input" placeholder="Search books…"
        value="${escHtml(state.searchQuery)}" autocomplete="off" />
    </div>` : ''}

    <nav class="header-nav">
      ${u ? `
        <button class="nav-btn nav-btn-ghost ${state.view === 'shelves' ? 'nav-active' : ''}"
          id="nav-myshelves" title="My Shelves">
          ${Icons.book}<span>My Shelves</span>
        </button>
        <button class="nav-btn nav-btn-ghost ${state.view === 'access' ? 'nav-active' : ''}"
          id="nav-access" title="Pending Access">
          ${Icons.clock}<span>Pending${pendingCount > 0 ? ` <span class="nav-badge">${pendingCount}</span>` : ''}</span>
        </button>
        ${u.is_admin ? `
          <button class="nav-btn nav-btn-ghost ${state.view === 'admin' ? 'nav-active' : ''}"
            id="nav-admin" title="Admin Panel">
            ${Icons.admin}<span>Admin</span>
          </button>` : ''}` : ''}

      <div class="user-chip">
        <div class="user-avatar">${escHtml(initials(u?.username))}</div>
        <span>${escHtml(u?.username)}</span>
      </div>

      <button class="nav-btn nav-btn-ghost" id="nav-logout" title="Log out">
        ${Icons.logout}<span>Logout</span>
      </button>
    </nav>
  </header>`;
}

export function bindHeaderEvents() {
  document.getElementById('nav-logout')?.addEventListener('click', doLogout);
  document.getElementById('nav-myshelves')?.addEventListener('click', () => switchToMyShelves());
  document.getElementById('nav-access')?.addEventListener('click', () => switchToAccess());
  document.getElementById('nav-admin')?.addEventListener('click', () => switchToAdmin());

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', e => {
      clearTimeout(debounce);
      const q = e.target.value.trim();
      debounce = setTimeout(() => doSearch(q), 420);
    });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.target.value = '';
        clearSearch();
      }
    });
  }

  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
}
