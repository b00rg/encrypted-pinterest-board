import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../toast.js';
import { loadMyShelves, loadActiveShelfBooks, loadAllShelvesBooks } from '../data.js';
import { refreshPageBody, switchToMyShelves } from '../app.js';
import { renderDiscoverResults } from './shelves.js';
import { openMembersPanel } from './shelves-members.js';
import { openReviewModal } from './shelves-reviews.js';
import { openAddToShelfPopup } from './shelf-popup.js';
import { toggleReadLater } from '../readLater.js';
import { openLibraryUrl } from '../utils.js';

export function bindShelvesEvents() {
  // Find a Shelf button — opens popup
  document.getElementById('find-shelf-btn')?.addEventListener('click', () => {
    const popup = document.getElementById('find-shelf-popup');
    if (popup) {
      popup.classList.remove('hidden');
      document.getElementById('discover-input')?.focus();
    }
  });

  // Close popup
  document.getElementById('find-shelf-popup-close')?.addEventListener('click', closeDiscoverPopup);
  document.getElementById('find-shelf-popup')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDiscoverPopup();
  });

  // Discover search input inside popup
  const discoverInput = document.getElementById('discover-input');
  if (discoverInput) {
    let debounce;
    discoverInput.addEventListener('input', e => {
      clearTimeout(debounce);
      const q = e.target.value.trim();
      state.shelfDiscoverQuery = q;
      if (!q) {
        state.shelfDiscoverResults = [];
        updateDiscoverResults();
        return;
      }
      debounce = setTimeout(() => doDiscoverSearch(q), 400);
    });
  }

  // Request to join / cancel request (in discover results)
  document.querySelectorAll('.request-join-btn').forEach(btn => {
    btn.addEventListener('click', () => doJoinRequest(
      parseInt(btn.dataset.shelfId, 10), btn.dataset.shelfName
    ));
  });
  document.querySelectorAll('.cancel-request-btn').forEach(btn => {
    btn.addEventListener('click', () => doCancelJoinRequest(
      parseInt(btn.dataset.shelfId, 10), btn.dataset.shelfName
    ));
  });

  // Invitation accept / decline
  document.querySelectorAll('.accept-invite-btn').forEach(btn => {
    btn.addEventListener('click', () => doAcceptInvitation(
      parseInt(btn.dataset.invId, 10), btn.dataset.shelfName
    ));
  });
  document.querySelectorAll('.decline-invite-btn').forEach(btn => {
    btn.addEventListener('click', () => doDeclineInvitation(
      parseInt(btn.dataset.invId, 10), btn.dataset.shelfName
    ));
  });

  // Create shelf toggle
  document.getElementById('create-shelf-btn')?.addEventListener('click', () => {
    document.getElementById('create-shelf-form').classList.remove('hidden');
    document.getElementById('new-shelf-name').focus();
  });
  document.getElementById('create-shelf-cancel')?.addEventListener('click', () => {
    document.getElementById('create-shelf-form').classList.add('hidden');
    document.getElementById('new-shelf-name').value = '';
  });
  document.getElementById('create-shelf-submit')?.addEventListener('click', doCreateShelf);
  document.getElementById('new-shelf-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doCreateShelf();
  });

  // All Books tab
  document.getElementById('tab-all-books')?.addEventListener('click', async () => {
    state.shelvesTab = 'all';
    if (state.allShelvesBooks.length === 0 && !state.loadingAllBooks) {
      state.loadingAllBooks = true;
      refreshPageBody();
      bindShelvesEvents();
      await loadAllShelvesBooks();
    }
    refreshPageBody();
    bindShelvesEvents();
  });

  // Read Later tab
  document.getElementById('tab-read-later')?.addEventListener('click', async () => {
    state.shelvesTab = 'readLater';
    if (state.allShelvesBooks.length === 0 && !state.loadingAllBooks) {
      state.loadingAllBooks = true;
      refreshPageBody();
      bindShelvesEvents();
      await loadAllShelvesBooks();
    }
    refreshPageBody();
    bindShelvesEvents();
  });

  // Shelf tabs
  document.querySelectorAll('[data-tab-shelf-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.tabShelfId, 10);
      state.shelvesTab = 'shelf';
      state.activeShelfId = id;
      state.activeShelfBooks = [];
      state.loadingShelfBooks = true;
      refreshPageBody();
      await loadActiveShelfBooks();
      refreshPageBody();
      bindShelvesEvents();
    });
  });

  // Settings gear toggle
  document.getElementById('shelf-settings-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('shelf-settings-dropdown')?.classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    document.getElementById('shelf-settings-dropdown')?.classList.add('hidden');
  }, { once: true });

  // Members button (inside settings dropdown)
  document.getElementById('manage-members-btn')?.addEventListener('click', () => {
    document.getElementById('shelf-settings-dropdown')?.classList.add('hidden');
    const shelfId = parseInt(
      document.getElementById('manage-members-btn').dataset.shelfId, 10
    );
    openMembersPanel(shelfId);
  });

  // Delete shelf (inside settings dropdown)
  document.getElementById('delete-shelf-btn')?.addEventListener('click', () => {
    document.getElementById('shelf-settings-dropdown')?.classList.add('hidden');
    const btn = document.getElementById('delete-shelf-btn');
    const shelfId = parseInt(btn.dataset.shelfId, 10);
    const shelfName = btn.dataset.shelfName;
    doDeleteShelf(shelfId, shelfName);
  });

  // Add to Shelf popup from Read Later cards
  document.querySelectorAll('.group-add-shelf-popup-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openAddToShelfPopup({
        workId:  btn.dataset.workId,
        title:   btn.dataset.title,
        author:  btn.dataset.author,
        coverId: btn.dataset.coverId,
        year:    btn.dataset.year,
      });
    });
  });

  // Book grid: reviews, rl, link, delete
  const grid = document.getElementById('group-shelf-grid');
  if (grid) {
    grid.addEventListener('click', e => {
      const reviewBtn   = e.target.closest('.group-review-btn');
      const rlBtn       = e.target.closest('.group-rl-btn');
      const goLinkBtn   = e.target.closest('.group-go-link-btn');
      const deleteBtn   = e.target.closest('.group-delete-btn');
      const addShelfBtn = e.target.closest('.group-add-shelf-popup-btn');

      if (addShelfBtn) {
        e.stopPropagation();
        openAddToShelfPopup({
          workId:  addShelfBtn.dataset.workId,
          title:   addShelfBtn.dataset.title,
          author:  addShelfBtn.dataset.author,
          coverId: addShelfBtn.dataset.coverId,
          year:    addShelfBtn.dataset.year,
        });
        return;
      }
      if (reviewBtn) {
        e.stopPropagation();
        openReviewModal({
          workId:  reviewBtn.dataset.workId,
          title:   reviewBtn.dataset.title,
          shelfId: parseInt(reviewBtn.dataset.shelfId, 10),
        });
        return;
      }
      if (rlBtn) {
        e.stopPropagation();
        const workId = rlBtn.dataset.workId;
        // Find the book in state so we can persist metadata for the Read Later panel
        const book = [...state.activeShelfBooks, ...state.allShelvesBooks]
          .find(b => b.work_id === workId);
        const meta = book ? {
          title: book.title, author: book.author, cover_id: book.cover_id, year: book.year,
        } : null;
        const nowSaved = toggleReadLater(workId, meta);
        showToast(nowSaved ? 'Added to Read Later.' : 'Removed from Read Later.', 'success');
        refreshPageBody();
        bindShelvesEvents();
        return;
      }
      if (goLinkBtn) {
        e.stopPropagation();
        window.open(openLibraryUrl(goLinkBtn.dataset.workId), '_blank', 'noopener');
        return;
      }
      if (deleteBtn) {
        e.stopPropagation();
        doDeleteBook(
          parseInt(deleteBtn.dataset.bookId, 10),
          parseInt(deleteBtn.dataset.shelfId, 10),
          deleteBtn.dataset.title
        );
      }
    });
  }
}

function closeDiscoverPopup() {
  document.getElementById('find-shelf-popup')?.classList.add('hidden');
}

function updateDiscoverResults() {
  const container = document.getElementById('discover-results-container');
  if (!container) return;
  container.innerHTML = renderDiscoverResults();
  container.querySelectorAll('.request-join-btn').forEach(btn => {
    btn.addEventListener('click', () => doJoinRequest(
      parseInt(btn.dataset.shelfId, 10), btn.dataset.shelfName
    ));
  });
  container.querySelectorAll('.cancel-request-btn').forEach(btn => {
    btn.addEventListener('click', () => doCancelJoinRequest(
      parseInt(btn.dataset.shelfId, 10), btn.dataset.shelfName
    ));
  });
}

async function doDiscoverSearch(q) {
  state.shelfDiscoverLoading = true;
  updateDiscoverResults();
  const { ok, data } = await api(`/shelves/discover?q=${encodeURIComponent(q)}`);
  state.shelfDiscoverLoading = false;
  state.shelfDiscoverResults = ok ? (data.shelves || []) : [];
  updateDiscoverResults();
}

async function doJoinRequest(shelfId, shelfName) {
  const { ok, data } = await api(`/shelves/${shelfId}/join-requests`, { method: 'POST' });
  if (ok) {
    showToast(`Request sent to join "${shelfName}".`, 'success');
    state.shelfDiscoverResults = state.shelfDiscoverResults.map(s =>
      s.id === shelfId ? { ...s, has_pending_request: true } : s
    );
    updateDiscoverResults();
  } else {
    showToast(data?.error || 'Failed to send request', 'error');
  }
}

async function doCancelJoinRequest(shelfId, shelfName) {
  const { ok, data } = await api(`/shelves/${shelfId}/join-requests/mine`, { method: 'DELETE' });
  if (ok) {
    showToast(`Request to join "${shelfName}" cancelled.`, 'success');
    state.shelfDiscoverResults = state.shelfDiscoverResults.map(s =>
      s.id === shelfId ? { ...s, has_pending_request: false } : s
    );
    updateDiscoverResults();
  } else {
    showToast(data?.error || 'Failed to cancel request', 'error');
  }
}

async function doAcceptInvitation(invId, shelfName) {
  const password = window.prompt(`Enter your password to accept the invitation to "${shelfName}":`);
  if (!password) return;

  const { ok, data } = await api(`/user/invitations/${invId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  if (ok) {
    showToast(`Joined "${shelfName}"!`, 'success');
    await switchToMyShelves();
  } else {
    showToast(data?.error || 'Failed to accept invitation', 'error');
  }
}

async function doDeclineInvitation(invId, shelfName) {
  if (!confirm(`Decline the invitation to "${shelfName}"?`)) return;
  const { ok, data } = await api(`/user/invitations/${invId}`, { method: 'DELETE' });
  if (ok) {
    showToast(`Invitation to "${shelfName}" declined.`, 'success');
    state.pendingInvitations = state.pendingInvitations.filter(i => i.id !== invId);
    refreshPageBody();
    bindShelvesEvents();
  } else {
    showToast(data?.error || 'Failed to decline invitation', 'error');
  }
}

async function doCreateShelf() {
  const input = document.getElementById('new-shelf-name');
  const name = input?.value.trim();
  if (!name) { showToast('Shelf name required', 'error'); return; }

  const { ok, data } = await api('/shelves', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  if (ok) {
    showToast(`Shelf "${name}" created!`, 'success');
    input.value = '';
    document.getElementById('create-shelf-form').classList.add('hidden');
    state.shelvesTab = 'shelf';
    state.activeShelfId = data.id;
    state.activeShelfBooks = [];
    await loadMyShelves();
    refreshPageBody();
    bindShelvesEvents();
  } else {
    showToast(data.error || 'Failed to create shelf', 'error');
  }
}

async function doDeleteShelf(shelfId, shelfName) {
  if (!confirm(`Delete shelf "${shelfName}"? This will permanently remove all its books and reviews.`)) return;

  const { ok, data } = await api(`/shelves/${shelfId}`, { method: 'DELETE' });
  if (ok) {
    showToast(`Shelf "${shelfName}" deleted.`, 'success');
    state.myShelves = state.myShelves.filter(s => s.id !== shelfId);
    state.allShelvesBooks = state.allShelvesBooks.filter(b => b.shelf_id !== shelfId);
    state.shelvesTab = 'shelf';
    if (state.activeShelfId === shelfId) {
      state.activeShelfId = state.myShelves[0]?.id ?? null;
      state.activeShelfBooks = [];
    }
    refreshPageBody();
    bindShelvesEvents();
    if (state.activeShelfId && state.myShelves.length > 0) {
      state.loadingShelfBooks = true;
      refreshPageBody();
      await loadActiveShelfBooks();
      refreshPageBody();
      bindShelvesEvents();
    }
  } else {
    showToast(data?.error || 'Failed to delete shelf', 'error');
  }
}

async function doDeleteBook(bookId, shelfId, title) {
  if (!confirm(`Remove "${title}" from this shelf?`)) return;

  const { ok, data } = await api(`/shelves/${shelfId}/books/${bookId}`, { method: 'DELETE' });
  if (ok) {
    showToast(`"${title}" removed from shelf.`, 'success');
    state.activeShelfBooks = state.activeShelfBooks.filter(b => b.id !== bookId);
    state.allShelvesBooks = state.allShelvesBooks.filter(
      b => !(b.id === bookId && b.shelf_id === shelfId)
    );
    refreshPageBody();
    bindShelvesEvents();
  } else {
    showToast(data.error || 'Failed to remove book', 'error');
  }
}
