import { Icons } from '../icons.js';
import { escHtml, coverUrl, renderCoverImg } from '../utils.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { toggleReadLater, isReadLater } from '../readLater.js';
import { showToast } from '../toast.js';
import { openAddToShelfPopup } from './shelf-popup.js';
import { openReviewModal } from './shelves-reviews.js';
// refreshPageBody is imported from app.js.
// The circular reference is safe: only called inside async functions/event handlers.
import { refreshPageBody } from '../app.js';

export function renderSearchResults() {
  const results = state.searchResults;
  return `
  <div class="search-section">
    <div class="search-section-header">
      <div class="search-section-title">
        Results for &ldquo;${escHtml(state.searchQuery)}&rdquo;
        ${!state.searchLoading ? `<span class="count-badge" style="margin-left:8px">${results.length}</span>` : ''}
      </div>
      <button class="search-clear" id="search-clear-btn">Clear search</button>
    </div>
    ${state.searchLoading
      ? `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;color:var(--text-muted);font-size:0.875rem">
           <div class="spinner spinner-dark"></div> Searching…
         </div>`
      : results.length === 0
        ? `<p style="color:var(--text-muted);font-size:0.875rem">No results found. Try a different search.</p>`
        : `<div class="book-grid">${results.map(renderSearchCard).join('')}</div>`}
  </div>`;
}

function renderSearchCard(book) {
  const url = coverUrl(book.cover_id);
  const saved = isReadLater(book.work_id);
  const shelves = state.myShelves || [];
  return `
  <div class="book-card" data-work-id="${escHtml(book.work_id)}"
       data-title="${escHtml(book.title)}" data-author="${escHtml(book.author || '')}"
       data-cover="${escHtml(url || '')}" data-year="${escHtml(String(book.year || ''))}">
    ${saved ? `<div class="rl-badge" title="Saved to Read Later">${Icons.bookmarkFill}</div>` : ''}
    <button class="hover-bookmark-btn ${saved ? 'is-saved' : ''}"
            data-work-id="${escHtml(book.work_id)}"
            title="${saved ? 'Remove from Read Later' : 'Save to Read Later'}">
      ${saved ? Icons.bookmarkFill : Icons.bookmark}
    </button>
    ${renderCoverImg(url, book.title)}
    <div class="book-info">
      <div class="book-title">${escHtml(book.title)}</div>
      ${book.author ? `<div class="book-author">${escHtml(book.author)}</div>` : ''}
      <div class="book-meta">
        ${book.year ? `<span class="book-year">${escHtml(String(book.year))}</span>` : '<span></span>'}
      </div>
    </div>
    <div class="card-actions">
      ${shelves.length > 0 ? `
      <button class="btn btn-primary btn-sm search-add-shelf-popup-btn"
        data-work-id="${escHtml(book.work_id)}"
        data-title="${escHtml(book.title)}"
        data-author="${escHtml(book.author || '')}"
        data-cover-id="${escHtml(String(book.cover_id || ''))}"
        data-year="${escHtml(String(book.year || ''))}">
        ${Icons.plus} Add to Shelf
      </button>` : ''}
      <button class="btn btn-outline btn-sm search-review-btn"
              data-work-id="${escHtml(book.work_id)}"
              data-title="${escHtml(book.title)}">
        ${Icons.info} Reviews
      </button>
      <button class="btn ${saved ? 'btn-rl-saved' : 'btn-outline'} btn-sm rl-btn"
              data-work-id="${escHtml(book.work_id)}"
              title="${saved ? 'Remove from Read Later' : 'Save to Read Later'}">
        ${saved ? Icons.bookmarkFill : Icons.bookmark}
      </button>
    </div>
  </div>`;
}

export async function doSearch(query) {
  if (!query) { clearSearch(); return; }
  state.searchQuery = query;
  state.searchResults = [];
  state.searchLoading = true;
  refreshPageBody();

  const { ok, data } = await api('/shelf/search?q=' + encodeURIComponent(query));
  state.searchLoading = false;
  if (ok) state.searchResults = data.results || [];
  refreshPageBody();
  if (ok) bindSearchResultEvents();
}

export function clearSearch() {
  state.searchQuery = '';
  state.searchResults = [];
  state.searchLoading = false;
  const input = document.getElementById('search-input');
  if (input) input.value = '';
  refreshPageBody();
}

export function bindSearchResultEvents() {
  document.getElementById('search-clear-btn')?.addEventListener('click', () => {
    clearSearch();
    const input = document.getElementById('search-input');
    if (input) input.value = '';
  });

  // Reviews button
  document.querySelectorAll('.search-review-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openReviewModal({ workId: btn.dataset.workId, title: btn.dataset.title });
    });
  });

  // Add to Shelf popup button
  document.querySelectorAll('.search-add-shelf-popup-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openAddToShelfPopup({
        workId:   btn.dataset.workId,
        title:    btn.dataset.title,
        author:   btn.dataset.author,
        coverId:  btn.dataset.coverId,
        year:     btn.dataset.year,
      });
    });
  });

  // Hover bookmark button (on cover)
  document.querySelectorAll('.search-section .hover-bookmark-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const workId = btn.dataset.workId;
      const result = (state.searchResults || []).find(r => r.work_id === workId);
      const nowSaved = toggleReadLater(workId, result ? {
        title: result.title, author: result.author, cover_id: result.cover_id, year: result.year,
      } : null);
      showToast(nowSaved ? 'Added to Read Later.' : 'Removed from Read Later.', 'success');
      btn.innerHTML = nowSaved ? Icons.bookmarkFill : Icons.bookmark;
      btn.classList.toggle('is-saved', nowSaved);
      btn.title = nowSaved ? 'Remove from Read Later' : 'Save to Read Later';
      const card = btn.closest('.book-card');
      const badge = card?.querySelector('.rl-badge');
      if (nowSaved && !badge) {
        card.insertAdjacentHTML('afterbegin', `<div class="rl-badge">${Icons.bookmarkFill}</div>`);
      } else if (!nowSaved && badge) {
        badge.remove();
      }
      // Sync the card-actions rl-btn
      const rlBtn = card?.querySelector('.rl-btn');
      if (rlBtn) {
        rlBtn.innerHTML = nowSaved ? Icons.bookmarkFill : Icons.bookmark;
        rlBtn.className = `btn ${nowSaved ? 'btn-rl-saved' : 'btn-outline'} btn-sm rl-btn`;
        rlBtn.title = btn.title;
      }
    });
  });

  // Card-actions rl-btn
  document.querySelectorAll('.search-section .rl-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const workId = btn.dataset.workId;
      const result = (state.searchResults || []).find(r => r.work_id === workId);
      const nowSaved = toggleReadLater(workId, result ? {
        title: result.title, author: result.author, cover_id: result.cover_id, year: result.year,
      } : null);
      showToast(nowSaved ? 'Added to Read Later.' : 'Removed from Read Later.', 'success');
      btn.innerHTML = nowSaved ? Icons.bookmarkFill : Icons.bookmark;
      btn.className = `btn ${nowSaved ? 'btn-rl-saved' : 'btn-outline'} btn-sm rl-btn`;
      btn.title = nowSaved ? 'Remove from Read Later' : 'Save to Read Later';
      const card = btn.closest('.book-card');
      const badge = card?.querySelector('.rl-badge');
      if (nowSaved && !badge) {
        card.insertAdjacentHTML('afterbegin', `<div class="rl-badge">${Icons.bookmarkFill}</div>`);
      } else if (!nowSaved && badge) {
        badge.remove();
      }
      const hoverBtn = card?.querySelector('.hover-bookmark-btn');
      if (hoverBtn) {
        hoverBtn.innerHTML = nowSaved ? Icons.bookmarkFill : Icons.bookmark;
        hoverBtn.classList.toggle('is-saved', nowSaved);
        hoverBtn.title = btn.title;
      }
    });
  });

  document.querySelectorAll('.search-section .book-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.rl-btn') || e.target.closest('.hover-bookmark-btn') ||
          e.target.closest('.search-add-shelf-popup-btn') ||
          e.target.closest('.search-review-btn')) return;
      openAddToShelfPopup({
        workId:  card.dataset.workId,
        title:   card.dataset.title,
        author:  card.dataset.author,
        year:    card.dataset.year,
      });
    });
  });
}
