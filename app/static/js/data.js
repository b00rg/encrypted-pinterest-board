import { api } from './api.js';
import { state } from './state.js';

export async function loadShelfBooks() {
  const { ok, data } = await api('/shelf');
  if (!ok) return;
  // Metadata (title, author, cover_id, year) is now embedded in the shelf response
  state.shelfBooks = (data.books || []).filter(b => b.work_id).reverse();
}

export async function loadAdminUsers() {
  const { ok, data } = await api('/admin');
  if (ok) state.adminUsers = data.users || [];
}

export async function loadMyShelves() {
  const { ok, data } = await api('/shelves');
  if (ok) state.myShelves = data.shelves || [];
}

export async function loadActiveShelfBooks() {
  if (!state.activeShelfId) return;
  const { ok, data } = await api(`/shelves/${state.activeShelfId}/books`);
  if (!ok) { state.loadingShelfBooks = false; return; }
  // Metadata is embedded in the response — no per-book OpenLibrary calls needed
  state.activeShelfBooks = (data.books || []).filter(b => b.work_id);
  state.loadingShelfBooks = false;
}

export async function loadAllShelvesBooks() {
  state.loadingAllBooks = true;
  const allBooks = [];

  await Promise.all(state.myShelves.map(async shelf => {
    const { ok, data } = await api(`/shelves/${shelf.id}/books`);
    if (!ok) return;
    const books = (data.books || [])
      .filter(b => b.work_id)
      .map(b => ({ ...b, shelf_id: shelf.id, shelf_name: shelf.name }));
    allBooks.push(...books);
  }));

  state.allShelvesBooks = allBooks;
  state.loadingAllBooks = false;
}

export async function loadPendingInvitations() {
  const { ok, data } = await api('/user/invitations');
  if (ok) state.pendingInvitations = data.invitations || [];
}

export async function loadPendingRequests() {
  const { ok, data } = await api('/user/pending-requests-detailed');
  if (ok) state.pendingRequests = data.requests || [];
}

export async function loadAllBooksReviews() {
  const workIds = state.shelfBooks.filter(b => b.work_id).map(b => b.work_id);
  if (workIds.length === 0) return;
  await loadReadLaterReviews(workIds);
}

export async function loadReadLaterReviews(workIds) {
  const results = {};
  await Promise.all(
    workIds.map(async wid => {
      const { ok, data } = await api(`/reviews/for-work?work_id=${encodeURIComponent(wid)}`);
      if (ok) results[wid] = data.results || [];
    })
  );
  state.readLaterReviews = results;
}
