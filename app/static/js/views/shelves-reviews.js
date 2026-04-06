import { Icons } from '../icons.js';
import { escHtml } from '../utils.js';
import { api } from '../api.js';
import { showToast } from '../toast.js';

/** Render a read-only star display (e.g. ★★★☆☆) */
export function renderStarDisplay(rating) {
  if (!rating) return '';
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<span class="star ${i < rating ? 'star-filled' : 'star-empty'}">${i < rating ? '★' : '☆'}</span>`
  ).join('');
  return `<span class="star-display" title="${rating}/5">${stars}</span>`;
}

/** Render an interactive star-picker widget */
function renderStarInput() {
  return `
  <div class="star-input" id="star-input" role="radiogroup" aria-label="Rating">
    ${Array.from({ length: 5 }, (_, i) =>
      `<button type="button" class="star-input-btn" data-value="${i + 1}" aria-label="${i + 1} star${i > 0 ? 's' : ''}">☆</button>`
    ).join('')}
    <span class="star-input-label" id="star-input-label"></span>
  </div>`;
}

/**
 * Opens the review modal.
 *
 * Behaviour:
 * - If `shelfId` is given: shows only that shelf's reviews (group-chat style).
 * - If no `shelfId` (Read Later / search context): shows a shelf picker first;
 *   once a shelf is selected, shows its reviews.
 *
 * @param {object} opts
 * @param {string} opts.workId
 * @param {string} opts.title
 * @param {number|null} [opts.shelfId]
 */
export async function openReviewModal({ workId, title, shelfId = null }) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  content.innerHTML = `
  <div class="modal-body" style="padding:40px;text-align:center">
    <div class="spinner spinner-dark" style="width:32px;height:32px;margin:0 auto 16px"></div>
    <p style="color:var(--text-muted)">Loading…</p>
  </div>`;
  overlay.classList.remove('hidden');

  const { ok, data } = await api(`/reviews/for-work?work_id=${encodeURIComponent(workId)}`);
  const allEntries = ok ? (data.results || []) : [];

  if (shelfId) {
    // Group-chat mode: single shelf
    const entry = allEntries.find(e => e.shelf_id === shelfId) || null;
    renderShelfChat(entry, shelfId, workId, title, allEntries);
  } else {
    // Read Later / search: shelf picker
    renderShelfPicker(allEntries, workId, title);
  }
}

// ── Encrypted toggle helpers ────────────────────────────────────────────────

function renderEncToggle() {
  return `<button class="enc-toggle-btn" id="enc-toggle">${Icons.lock} Show encrypted</button>`;
}

function bindEncToggle() {
  const btn = document.getElementById('enc-toggle');
  if (!btn) return;
  const modal = btn.closest('.review-modal');
  btn.addEventListener('click', () => {
    const on = modal.classList.toggle('show-encrypted');
    btn.innerHTML = `${Icons.lock} ${on ? 'Hide' : 'Show'} encrypted`;
    btn.classList.toggle('active', on);
  });
}

// ── Shelf chat (single shelf) ────────────────────────────────────────────────

function renderShelfChat(entry, shelfId, workId, title, allEntries) {
  const content = document.getElementById('modal-content');
  const reviews  = entry ? entry.reviews : [];
  const shelfName = entry ? entry.shelf_name : `Shelf #${shelfId}`;
  const canPost   = entry && entry.is_member;
  const avgRating = entry?.avg_rating ?? null;

  content.innerHTML = buildChatHtml(shelfName, title, reviews, canPost, shelfId, entry?.book_id, avgRating, allEntries);
  bindChatEvents(reviews, shelfId, entry?.book_id, workId, title, allEntries);
}

function buildChatHtml(shelfName, title, reviews, canPost, shelfId, bookId, avgRating, allEntries) {
  const preview     = reviews.slice(0, 3);
  const hiddenCount = reviews.length - 3;

  const avgHtml = avgRating != null ? `
    <div class="chat-avg-rating">
      ${renderStarDisplay(Math.round(avgRating))}
      <span class="avg-rating-label">avg ${avgRating}/5 &middot; ${reviews.length} review${reviews.length !== 1 ? 's' : ''}</span>
    </div>` : '';

  // Non-member shelves (excluding the one we're viewing) that have reviews
  const otherEncEntries = (allEntries || []).filter(e => !e.is_member && e.shelf_id !== shelfId && e.reviews.length > 0);
  const otherEncCount   = otherEncEntries.reduce((n, e) => n + e.reviews.length, 0);
  const encSectionHtml  = otherEncEntries.length === 0 ? '' : `
    <div class="enc-shelf-section" style="margin-top:10px">
      <div class="asp-section-label">${Icons.lock} Encrypted reviews from other shelves</div>
      ${otherEncEntries.map(e => `
        <div class="asp-review-card" style="border-left:3px solid var(--success);opacity:0.85">
          <div class="asp-review-meta">
            <span>${Icons.shelf} ${escHtml(e.shelf_name)}</span>
            ${e.avg_rating != null
              ? `${renderStarDisplay(Math.round(e.avg_rating))}<span class="avg-rating-label">avg ${e.avg_rating}/5</span>`
              : `<span class="star-enc">${Icons.lock} ★★★★★</span>`}
          </div>
          ${e.reviews.slice(0, 1).map(r =>
            `<div class="review-enc-text">${escHtml(r.review_enc)}</div>`
          ).join('')}
          ${e.reviews.length > 1
            ? `<p style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">+${e.reviews.length - 1} more encrypted review${e.reviews.length - 1 !== 1 ? 's' : ''}</p>`
            : ''}
        </div>`).join('')}
    </div>`;

  return `
  <div class="modal-body review-modal chat-modal">
    <div class="chat-header">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div class="chat-shelf-name">${Icons.shelf} ${escHtml(shelfName)}</div>
        ${renderEncToggle()}
      </div>
      <div class="chat-book-title">${escHtml(title)}</div>
    </div>

    <div class="chat-messages" id="chat-messages">
      ${reviews.length === 0
        ? `<p class="no-reviews-msg">No reviews yet in this shelf.</p>`
        : preview.map(r => renderMessageBubble(r)).join('')}
      ${hiddenCount > 0
        ? `<button class="btn btn-outline btn-sm show-more-btn" id="show-more-reviews"
                   style="margin:6px auto;display:block">
             Show ${hiddenCount} more review${hiddenCount !== 1 ? 's' : ''}
           </button>`
        : ''}
      ${otherEncCount > 0
        ? `<p class="enc-hidden-count">${Icons.lock} ${otherEncCount} encrypted review${otherEncCount !== 1 ? 's' : ''} from other shelves hidden</p>`
        : ''}
      ${encSectionHtml}
      ${avgHtml}
    </div>

    ${canPost ? `
    <div class="chat-compose" id="chat-compose">
      <div class="review-form-title">Write a Review</div>
      ${renderStarInput()}
      <textarea id="review-textarea" class="review-textarea"
        placeholder="Share your thoughts on this book…" rows="3"></textarea>
      <button class="btn btn-primary" id="post-review-btn"
              data-shelf-id="${shelfId}" data-book-id="${bookId}"
              style="margin-top:8px">
        Post Review
      </button>
    </div>` : `
    <p class="no-reviews-msg" style="font-style:italic;margin-top:12px;border-top:1px solid var(--accent-light);padding-top:12px">
      Add this book to a shelf to write a review.
    </p>`}
  </div>`;
}

function renderMessageBubble(r) {
  const ratingHtml = r.encrypted
    ? `<span class="star-enc" title="Rating encrypted">${Icons.lock} ★★★★★</span>`
    : (r.rating ? renderStarDisplay(r.rating) : '');
  return `
  <div class="chat-bubble ${r.encrypted ? 'chat-bubble-enc' : ''}">
    <div class="chat-bubble-meta">
      <span class="review-author">${Icons.user} ${escHtml(r.reviewer_username)}</span>
      ${ratingHtml}
      <span class="review-date">${escHtml(r.created_at)}</span>
    </div>
    ${r.encrypted
      ? `<div class="review-enc-text">${escHtml(r.review_enc)}</div>`
      : `<div class="review-text">${escHtml(r.review || '[Could not decrypt]')}</div>`}
  </div>`;
}

function bindChatEvents(allReviews, shelfId, bookId, workId, title, allEntries) {
  bindEncToggle();

  // Show more
  const showMoreBtn = document.getElementById('show-more-reviews');
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      const msgs = document.getElementById('chat-messages');
      if (!msgs) return;
      msgs.innerHTML = allReviews.map(r => renderMessageBubble(r)).join('');
    });
  }

  // Star input
  bindStarInput();

  // Post review
  document.getElementById('post-review-btn')?.addEventListener('click', async () => {
    const text = document.getElementById('review-textarea')?.value.trim();
    if (!text) { showToast('Review cannot be empty', 'error'); return; }
    const rating = getSelectedRating();

    const btn = document.getElementById('post-review-btn');
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> Posting…`;

    const { ok, data } = await api(`/shelves/${shelfId}/books/${bookId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ review: text, rating }),
    });

    if (ok) {
      showToast('Review posted!', 'success');
      // Reload this shelf's reviews
      const { ok: ok2, data: data2 } = await api(`/reviews/for-work?work_id=${encodeURIComponent(workId)}`);
      const freshEntries = ok2 ? (data2.results || []) : allEntries;
      const freshEntry = freshEntries.find(e => e.shelf_id === shelfId) || null;
      renderShelfChat(freshEntry, shelfId, workId, title, freshEntries);
    } else {
      showToast(data.error || 'Failed to post review', 'error');
      btn.disabled = false;
      btn.innerHTML = 'Post Review';
    }
  });
}

// ── Shelf picker (Read Later / search context) ───────────────────────────────

function renderShelfPicker(allEntries, workId, title) {
  const content = document.getElementById('modal-content');
  const postable = allEntries.filter(e => e.is_member);

  content.innerHTML = `
  <div class="modal-body review-modal">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div class="modal-title">${escHtml(title)}</div>
      ${renderEncToggle()}
    </div>

    <div class="asp-section-label" style="margin-bottom:10px">${Icons.shelf} Choose a shelf to review in</div>

    ${postable.length === 0
      ? `<p class="no-reviews-msg">Add this book to a shelf first to write a review.</p>`
      : `<div class="asp-shelf-list" id="shelf-picker-list">
          ${postable.map(e => `
            <button class="asp-shelf-btn shelf-chat-pick-btn"
                    data-shelf-id="${e.shelf_id}"
                    data-book-id="${e.book_id}"
                    data-shelf-name="${escHtml(e.shelf_name)}">
              ${Icons.shelf} ${escHtml(e.shelf_name)}
              <span style="font-size:0.75rem;color:var(--text-muted);margin-left:auto">
                ${e.reviews.length} review${e.reviews.length !== 1 ? 's' : ''}
              </span>
            </button>`).join('')}
        </div>`}

    <div class="asp-section-label" style="margin-top:20px">${Icons.info} Recent Reviews</div>
    ${renderAllShelvesPreview(allEntries)}
  </div>`;

  bindEncToggle();

  // Click a shelf → open chat for that shelf
  content.querySelectorAll('.shelf-chat-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openReviewModal({ workId, title, shelfId: parseInt(btn.dataset.shelfId, 10) });
    });
  });
}

function renderAllShelvesPreview(allEntries) {
  const decryptedReviews = [];
  for (const e of allEntries) {
    if (!e.is_member) continue;
    for (const r of e.reviews) {
      if (!r.encrypted && r.review) decryptedReviews.push({ ...r, shelf_name: e.shelf_name });
    }
  }

  const memberHtml = decryptedReviews.length === 0
    ? `<p class="no-reviews-msg">No reviews yet across your shelves for this book.</p>`
    : decryptedReviews.slice(0, 3).map(r => `
        <div class="asp-review-card">
          <div class="asp-review-meta">
            <span>${Icons.user} ${escHtml(r.reviewer_username)}</span>
            ${r.rating ? renderStarDisplay(r.rating) : ''}
            <span class="asp-review-shelf">${Icons.shelf} ${escHtml(r.shelf_name)}</span>
          </div>
          <div class="asp-review-text">${escHtml(r.review)}</div>
        </div>`).join('') +
      (decryptedReviews.length > 3
        ? `<p style="font-size:0.78rem;color:var(--text-muted);margin-top:6px">+${decryptedReviews.length - 3} more</p>`
        : '');

  const nonMemberEntries = allEntries.filter(e => !e.is_member && e.reviews.length > 0);
  const encSectionHtml = nonMemberEntries.length === 0 ? '' : `
    <div class="enc-shelf-section" style="margin-top:14px">
      <div class="asp-section-label">${Icons.lock} Encrypted reviews from other shelves</div>
      ${nonMemberEntries.map(e => `
        <div class="asp-review-card" style="border-left:3px solid var(--success);opacity:0.85">
          <div class="asp-review-meta">
            <span>${Icons.shelf} ${escHtml(e.shelf_name)}</span>
            ${e.avg_rating != null
              ? `${renderStarDisplay(Math.round(e.avg_rating))}<span class="avg-rating-label">avg ${e.avg_rating}/5</span>`
              : `<span class="star-enc">${Icons.lock} ★★★★★</span>`}
          </div>
          ${e.reviews.slice(0, 1).map(r =>
            `<div class="review-enc-text">${escHtml(r.review_enc)}</div>`
          ).join('')}
          ${e.reviews.length > 1
            ? `<p style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">+${e.reviews.length - 1} more encrypted review${e.reviews.length - 1 !== 1 ? 's' : ''}</p>`
            : ''}
        </div>`).join('')}
    </div>`;

  return memberHtml + encSectionHtml;
}

// ── Star input helpers ───────────────────────────────────────────────────────

function bindStarInput() {
  const container = document.getElementById('star-input');
  if (!container) return;
  let selected = 0;

  const btns = container.querySelectorAll('.star-input-btn');
  const label = document.getElementById('star-input-label');
  const labels = ['', '1 — Poor', '2 — Fair', '3 — Good', '4 — Great', '5 — Excellent'];

  function highlight(upTo) {
    btns.forEach((b, i) => { b.textContent = i < upTo ? '★' : '☆'; });
    if (label) label.textContent = upTo ? labels[upTo] : '';
  }

  btns.forEach((btn, i) => {
    btn.addEventListener('mouseenter', () => { if (!selected) highlight(i + 1); });
    btn.addEventListener('mouseleave', () => { if (!selected) highlight(0); });
    btn.addEventListener('click', () => {
      selected = selected === i + 1 ? 0 : i + 1;  // click same star = deselect
      highlight(selected);
      container.dataset.rating = selected;
      btns.forEach((b, j) => b.classList.toggle('star-selected', j < selected));
    });
  });
}

function getSelectedRating() {
  const container = document.getElementById('star-input');
  const val = parseInt(container?.dataset.rating || '0', 10);
  return val > 0 ? val : null;
}
