/**
 * "Add to Shelf" popup — shown when clicking a book from search or Read Later.
 * Displays:
 *   1. Book title/author
 *   2. Shelf picker (your shelves as buttons)
 *   3. First 3 reviews across all shelves for this book
 */
import { Icons } from '../icons.js';
import { escHtml, coverUrl } from '../utils.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../toast.js';
import { loadActiveShelfBooks } from '../data.js';
import { refreshPageBody } from '../app.js';
import { bindShelvesEvents } from './shelves-events.js';
import { renderStarDisplay } from './shelves-reviews.js';

export async function openAddToShelfPopup({ workId, title, author, coverId, year }) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  const shelves = state.myShelves || [];

  content.innerHTML = `
  <div class="modal-body add-shelf-popup-body">
    <div class="asp-header">
      <div>
        <div class="asp-title">${escHtml(title)}</div>
        ${author ? `<div class="asp-author">${escHtml(author)}</div>` : ''}
      </div>
    </div>

    <div class="asp-section-label">${Icons.shelf} Add to a Shelf</div>
    ${shelves.length === 0
      ? `<p style="font-size:0.85rem;color:var(--text-muted)">You have no shelves yet. Create one first!</p>`
      : `<div class="asp-shelf-list" id="asp-shelf-list">
          ${shelves.map(s => `
            <button class="asp-shelf-btn" data-shelf-id="${s.id}" data-shelf-name="${escHtml(s.name)}">
              ${Icons.shelf} ${escHtml(s.name)}
            </button>`).join('')}
        </div>`}

    <div class="asp-section-label" style="margin-top:20px">${Icons.info} Recent Reviews</div>
    <div id="asp-reviews-loading" style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:var(--text-muted);padding:8px 0">
      <div class="spinner spinner-dark" style="width:16px;height:16px"></div> Loading reviews…
    </div>
    <div id="asp-reviews-container"></div>
  </div>`;

  overlay.classList.remove('hidden');

  // Bind shelf buttons
  content.querySelectorAll('.asp-shelf-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const shelfId   = parseInt(btn.dataset.shelfId, 10);
      const shelfName = btn.dataset.shelfName;
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></div> Adding…`;

      const { ok, data } = await api(`/shelves/${shelfId}/books`, {
        method: 'POST', body: JSON.stringify({ work_id: workId }),
      });
      if (ok) {
        showToast(`"${title}" added to "${shelfName}"!`, 'success');
        btn.innerHTML = `✓ Added to ${escHtml(shelfName)}`;
        btn.classList.add('asp-shelf-btn-added');
        if (state.activeShelfId === shelfId) {
          await loadActiveShelfBooks();
          refreshPageBody();
          bindShelvesEvents();
        }
      } else {
        showToast(data.error || 'Failed to add book.', 'error');
        btn.disabled = false;
        btn.innerHTML = `${Icons.shelf} ${escHtml(shelfName)}`;
      }
    });
  });

  // Load reviews
  const { ok, data } = await api(`/reviews/for-work?work_id=${encodeURIComponent(workId)}`);
  document.getElementById('asp-reviews-loading')?.remove();
  const container = document.getElementById('asp-reviews-container');
  if (!container) return;

  const allReviews = [];
  if (ok) {
    for (const entry of (data.results || [])) {
      if (!entry.is_member) continue;
      for (const r of entry.reviews) {
        if (!r.encrypted && r.review) {
          allReviews.push({ ...r, shelf_name: entry.shelf_name });
        }
      }
    }
  }

  if (allReviews.length === 0) {
    container.innerHTML = `<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0">No reviews yet.</p>`;
    return;
  }

  const preview = allReviews.slice(0, 3);
  container.innerHTML = preview.map(r => `
    <div class="asp-review-card">
      <div class="asp-review-meta">
        <span>${Icons.user} ${escHtml(r.reviewer_username)}</span>
        ${r.rating ? renderStarDisplay(r.rating) : ''}
        <span class="asp-review-shelf">${Icons.shelf} ${escHtml(r.shelf_name)}</span>
      </div>
      <div class="asp-review-text">${escHtml(r.review)}</div>
    </div>`).join('') +
    (allReviews.length > 3
      ? `<p style="font-size:0.78rem;color:var(--text-muted);margin-top:6px">+${allReviews.length - 3} more review${allReviews.length - 3 !== 1 ? 's' : ''}</p>`
      : '');
}
