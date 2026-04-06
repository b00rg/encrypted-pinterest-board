import { Icons } from '../icons.js';
import { escHtml, renderCoverImg, coverUrl, workCoverUrl, SHELF_COLORS } from '../utils.js';
import { state } from '../state.js';
import { isReadLater, getReadLater, getReadLaterMeta } from '../readLater.js';

// ── Page render ───────────────────────────────────────────────────────

export function renderShelvesPage() {
  const shelves = state.myShelves;

  return `
  <div>
    ${renderInvitationsBanner()}

    <div class="section-header">
      <div>
        <h1 class="section-title">My Shelves</h1>
        <p class="section-subtitle">Private reading groups with encrypted books and reviews.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-outline btn-sm" id="find-shelf-btn" style="width:auto">
          ${Icons.search} Find a Shelf
        </button>
        <button class="btn btn-primary" id="create-shelf-btn" style="width:auto">
          ${Icons.plus} New Shelf
        </button>
      </div>
    </div>

    <!-- Find a Shelf popup overlay -->
    <div id="find-shelf-popup" class="popup-overlay hidden" role="dialog" aria-modal="true">
      <div class="popup-box">
        <div class="popup-header">
          <span class="popup-title">${Icons.search} Find a Shelf</span>
          <button class="popup-close-btn" id="find-shelf-popup-close" aria-label="Close">&times;</button>
        </div>
        <div class="shelf-add-bar popup-search-bar">
          ${Icons.search.replace('<svg', '<svg class="shelf-add-search-icon"')}
          <input type="search" id="discover-input" class="group-search-input"
            placeholder="Search shelves by name…" autocomplete="off"
            value="${escHtml(state.shelfDiscoverQuery)}" />
        </div>
        <div id="discover-results-container">
          ${renderDiscoverResults()}
        </div>
      </div>
    </div>

    <div id="create-shelf-form" class="create-shelf-form hidden">
      <input type="text" id="new-shelf-name" class="shelf-name-input"
        placeholder="Shelf name…" maxlength="128" />
      <button class="btn btn-primary btn-sm" id="create-shelf-submit" style="width:auto">Create</button>
      <button class="btn btn-outline btn-sm" id="create-shelf-cancel" style="width:auto">Cancel</button>
    </div>

    ${shelves.length === 0
      ? `<div class="empty-state">
           <div class="empty-state-icon">${Icons.shelf}</div>
           <h3>No shelves yet</h3>
           <p>Create a shelf to start a private reading group, or find one to join above.</p>
         </div>`
      : renderShelvesContent(shelves)}
  </div>`;
}

function renderInvitationsBanner() {
  const invites = state.pendingInvitations;
  if (!invites.length) return '';
  return `
  <div class="invitations-banner">
    <div class="invitations-banner-title">
      ${Icons.info} You have ${invites.length} pending shelf invitation${invites.length !== 1 ? 's' : ''}
    </div>
    ${invites.map(inv => `
      <div class="invitation-row">
        <div class="invitation-info">
          <span class="invitation-shelf">${escHtml(inv.shelf_name)}</span>
          <span class="invitation-from">from ${escHtml(inv.owner_username)}</span>
        </div>
        <div class="invitation-actions">
          <button class="btn btn-primary btn-sm accept-invite-btn"
            data-inv-id="${inv.id}" data-shelf-name="${escHtml(inv.shelf_name)}">
            Accept
          </button>
          <button class="btn btn-outline btn-sm decline-invite-btn"
            data-inv-id="${inv.id}" data-shelf-name="${escHtml(inv.shelf_name)}">
            Decline
          </button>
        </div>
      </div>`).join('')}
  </div>`;
}

export function renderDiscoverResults() {
  if (state.shelfDiscoverLoading) {
    return `<div class="group-search-loading"><div class="spinner spinner-dark"></div> Searching…</div>`;
  }
  if (!state.shelfDiscoverQuery) return `<p class="popup-hint">Type a shelf name to search.</p>`;
  if (!state.shelfDiscoverResults.length) {
    return `<div class="group-search-empty">No shelves found matching "${escHtml(state.shelfDiscoverQuery)}".</div>`;
  }
  return `<div class="group-search-list">
    ${state.shelfDiscoverResults.map(s => `
      <div class="group-search-item" style="justify-content:space-between">
        <div>
          <div class="group-search-title">${escHtml(s.name)}</div>
          <div class="group-search-author">${Icons.user.replace('<svg', '<svg style="width:11px;height:11px"')} ${escHtml(s.owner_username)}</div>
        </div>
        ${s.has_pending_request
          ? `<button class="btn btn-outline btn-sm cancel-request-btn"
               data-shelf-id="${s.id}" data-shelf-name="${escHtml(s.name)}" style="white-space:nowrap">
               Pending — Cancel
             </button>`
          : `<button class="btn btn-primary btn-sm request-join-btn"
               data-shelf-id="${s.id}" data-shelf-name="${escHtml(s.name)}" style="white-space:nowrap">
               Request to Join
             </button>`}
      </div>`).join('')}
  </div>`;
}

function renderShelvesContent(shelves) {
  const tab = state.shelvesTab || 'shelf';
  const activeId = state.activeShelfId ?? shelves[0]?.id;
  const activeShelf = shelves.find(s => s.id === activeId) || shelves[0];

  const rlSet = getReadLater();
  const rlCount = state.allShelvesBooks.filter(b => b.work_id && rlSet.has(b.work_id)).length;

  return `
  <div class="shelf-tabs-row">
    <button class="shelf-tab-btn ${tab === 'all' ? 'active' : ''}" id="tab-all-books">
      ${Icons.book} All Books
      ${state.allShelvesBooks.length > 0 ? `<span class="filter-count">${state.allShelvesBooks.length}</span>` : ''}
    </button>
    <button class="shelf-tab-btn ${tab === 'readLater' ? 'active' : ''}" id="tab-read-later">
      ${Icons.bookmark} Read Later
      ${rlCount > 0 ? `<span class="filter-count">${rlCount}</span>` : ''}
    </button>
    <span class="filter-tab-divider" style="margin:6px 8px;align-self:stretch"></span>
    ${shelves.map(s => `
      <button class="shelf-tab-btn ${tab === 'shelf' && s.id === activeId ? 'active' : ''}" data-tab-shelf-id="${s.id}">
        ${Icons.shelf} ${escHtml(s.name)}
        ${s.is_owner ? '<span class="owner-dot" title="You own this shelf"></span>' : ''}
      </button>`).join('')}
  </div>

  <div id="shelf-panel">
    ${tab === 'all'
      ? renderAllBooksPanel()
      : tab === 'readLater'
        ? renderReadLaterPanel(rlSet)
        : activeShelf
          ? renderShelfPanel(activeShelf)
          : ''}
  </div>`;
}

function renderSkeletonCards(n) {
  return `<div class="book-grid">${Array.from({ length: n }, () => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-cover"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line" style="width:90%"></div>
        <div class="skeleton skeleton-line" style="width:70%"></div>
      </div>
    </div>`).join('')}</div>`;
}

function deduplicateByWorkId(books) {
  const seen = new Set();
  return books.filter(b => {
    if (!b.work_id || seen.has(b.work_id)) return false;
    seen.add(b.work_id);
    return true;
  });
}

function renderAllBooksPanel() {
  if (state.loadingAllBooks) return renderSkeletonCards(6);
  if (state.allShelvesBooks.length === 0) {
    return `<div class="empty-state">
      <div class="empty-state-icon">${Icons.book}</div>
      <h3>No books yet</h3>
      <p>Add books to your shelves to see them here.</p>
    </div>`;
  }
  const unique = deduplicateByWorkId(state.allShelvesBooks);
  return `<div class="book-grid" id="group-shelf-grid">
    ${unique.map(book => {
      const shelf = state.myShelves.find(s => s.id === book.shelf_id);
      return shelf ? renderGroupShelfCard(book, shelf) : '';
    }).join('')}
  </div>`;
}

function renderReadLaterPanel(rlSet) {
  if (state.loadingAllBooks) return renderSkeletonCards(6);

  // Books already on a shelf
  const shelfBooks = deduplicateByWorkId(
    state.allShelvesBooks.filter(b => b.work_id && rlSet.has(b.work_id))
  );
  const shelfWorkIds = new Set(shelfBooks.map(b => b.work_id));

  // Books only bookmarked from search (not on any shelf)
  const rlMeta = getReadLaterMeta();
  const searchOnlyBooks = [...rlSet]
    .filter(wid => !shelfWorkIds.has(wid) && rlMeta[wid])
    .map(wid => ({ work_id: wid, ...rlMeta[wid] }));

  const total = shelfBooks.length + searchOnlyBooks.length;

  if (total === 0) {
    return `<div class="empty-state">
      <div class="empty-state-icon">${Icons.bookmark}</div>
      <h3>Nothing saved yet</h3>
      <p>Click "Read Later" on any book to save it here.</p>
    </div>`;
  }

  return `<div class="book-grid" id="group-shelf-grid">
    ${shelfBooks.map(book => {
      const shelf = state.myShelves.find(s => s.id === book.shelf_id);
      return shelf ? renderGroupShelfCard(book, shelf) : '';
    }).join('')}
    ${searchOnlyBooks.map(book => renderSearchOnlyRLCard(book)).join('')}
  </div>`;
}

function renderShelfPanel(shelf) {
  const isOwner = shelf.owner_username === state.user?.username;
  const books = state.activeShelfBooks;

  return `
  <div class="shelf-panel-header">
    <span class="shelf-owner-chip">${Icons.user} ${escHtml(shelf.owner_username)}</span>
    <div class="shelf-settings-wrap">
      <button class="btn btn-outline btn-sm" id="shelf-settings-btn" data-shelf-id="${shelf.id}"
              title="Shelf settings">
        ⚙ Settings
      </button>
      <div id="shelf-settings-dropdown" class="shelf-settings-dropdown hidden">
        <button class="shelf-settings-item" id="manage-members-btn" data-shelf-id="${shelf.id}">
          ${Icons.admin} Manage Members
        </button>
        ${isOwner ? `
        <button class="shelf-settings-item shelf-settings-danger" id="delete-shelf-btn"
          data-shelf-id="${shelf.id}" data-shelf-name="${escHtml(shelf.name)}">
          ${Icons.trash} Delete Shelf
        </button>` : ''}
      </div>
    </div>
  </div>

  <div class="book-grid" id="group-shelf-grid">
    ${state.loadingShelfBooks
      ? renderSkeletonCards(6)
      : books.length === 0
        ? `<div class="empty-state" style="grid-column:1/-1">
             <div class="empty-state-icon">${Icons.book}</div>
             <h3>No books yet</h3>
             <p>Use the search bar above to add the first book to this shelf.</p>
           </div>`
        : books.map(b => renderGroupShelfCard(b, shelf)).join('')}
  </div>

  <div id="members-panel" class="members-panel hidden"></div>`;
}

/** Card for a book bookmarked from search but not yet on any shelf. */
function renderSearchOnlyRLCard(book) {
  const url = book.cover_id ? coverUrl(book.cover_id) : (book.work_id ? workCoverUrl(book.work_id) : null);
  const shelves = state.myShelves || [];
  return `
  <div class="book-card shelf-color-card"
    style="--sc:#888"
    data-work-id="${escHtml(book.work_id || '')}"
    data-title="${escHtml(book.title || '')}">
    ${renderCoverImg(url, book.title || 'Unknown Title')}
    <div class="book-info">
      <div class="book-title">${escHtml(book.title || 'Unknown Title')}</div>
      ${book.author ? `<div class="book-author">${escHtml(book.author)}</div>` : ''}
      <div class="book-meta">
        ${book.year ? `<span class="book-year">${escHtml(String(book.year))}</span>` : ''}
      </div>
    </div>
    <div class="card-actions">
      ${shelves.length > 0 ? `
      <button class="btn btn-primary btn-sm group-add-shelf-popup-btn"
        data-work-id="${escHtml(book.work_id || '')}"
        data-title="${escHtml(book.title || '')}"
        data-author="${escHtml(book.author || '')}"
        data-cover-id="${escHtml(String(book.cover_id || ''))}"
        data-year="${escHtml(String(book.year || ''))}">
        ${Icons.plus} Add to Shelf
      </button>` : ''}
      <button class="btn btn-rl-saved btn-sm group-rl-btn"
        data-work-id="${escHtml(book.work_id || '')}"
        title="Remove from Read Later">
        ${Icons.bookmarkFill} Saved
      </button>
      <button class="btn btn-outline btn-sm group-go-link-btn"
        data-work-id="${escHtml(book.work_id || '')}"
        title="Open on OpenLibrary">
        ${Icons.external} Link
      </button>
    </div>
  </div>`;
}

export function renderGroupShelfCard(book, shelf) {
  const canDelete =
    book.added_by === state.user?.username || shelf.owner_username === state.user?.username;
  const saved = book.work_id && isReadLater(book.work_id);
  const colorIdx = state.myShelves.findIndex(s => s.id === shelf.id);
  const shelfColor = SHELF_COLORS[colorIdx >= 0 ? colorIdx % SHELF_COLORS.length : 0];
  const url = book.cover_id ? coverUrl(book.cover_id) : (book.work_id ? workCoverUrl(book.work_id) : null);

  return `
  <div class="book-card shelf-color-card"
    style="--sc:${shelfColor}"
    data-work-id="${escHtml(book.work_id || '')}"
    data-title="${escHtml(book.title || '')}"
    data-book-id="${book.id}"
    data-shelf-id="${shelf.id}">
    ${renderCoverImg(url, book.title || 'Unknown Title')}
    <div class="book-info">
      <div class="book-title">${escHtml(book.title || 'Unknown Title')}</div>
      ${book.author ? `<div class="book-author">${escHtml(book.author)}</div>` : ''}
      <div class="book-meta">
        <div class="book-added-by">${Icons.user} ${escHtml(book.added_by || '?')}</div>
        ${book.year ? `<span class="book-year">${escHtml(String(book.year))}</span>` : ''}
      </div>
    </div>
    <div class="card-actions">
      <button class="btn btn-outline btn-sm group-review-btn"
        data-book-id="${book.id}" data-shelf-id="${shelf.id}"
        data-work-id="${escHtml(book.work_id || '')}"
        data-title="${escHtml(book.title || '')}">
        ${Icons.info} Reviews
      </button>
      <button class="btn ${saved ? 'btn-rl-saved' : 'btn-outline'} btn-sm group-rl-btn"
        data-work-id="${escHtml(book.work_id || '')}"
        title="${saved ? 'Remove from Read Later' : 'Save to Read Later'}">
        ${saved ? Icons.bookmarkFill : Icons.bookmark} ${saved ? 'Saved' : 'Read Later'}
      </button>
      <button class="btn btn-outline btn-sm group-go-link-btn"
        data-work-id="${escHtml(book.work_id || '')}"
        title="Open on OpenLibrary">
        ${Icons.external} Link
      </button>
      ${canDelete ? `
        <button class="btn btn-danger btn-sm group-delete-btn"
          data-book-id="${book.id}" data-shelf-id="${shelf.id}"
          data-title="${escHtml(book.title || '')}">
          ${Icons.trash} Delete
        </button>` : ''}
    </div>
  </div>`;
}
