import { Icons } from './icons.js';

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export function coverUrl(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null;
}

export function workCoverUrl(workId) {
  return `https://covers.openlibrary.org/b/olid/${workId}-M.jpg`;
}

export function openLibraryUrl(workId) {
  return `https://openlibrary.org/works/${workId}`;
}

export function renderCoverImg(url, title, extraClass = '') {
  if (url) {
    return `<img class="book-cover ${extraClass}" src="${escHtml(url)}" alt="${escHtml(title)}"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
    <div class="book-cover-placeholder" style="display:none">
      ${Icons.book}<span class="cover-initials">${escHtml(initials(title))}</span>
    </div>`;
  }
  return `<div class="book-cover-placeholder">
    ${Icons.book}<span class="cover-initials">${escHtml(initials(title))}</span>
  </div>`;
}

// Colour for books on the original shared shelf (not a group shelf)
export const SHARED_SHELF_COLOR = '#6b5a45';

export function renderColorCover(title, color, extraClass = '', author = '') {
  return `<div class="book-cover-color ${extraClass}" style="background:${escHtml(color)}">
    <span class="cover-book-title">${escHtml(String(title || '').slice(0, 60))}</span>
    ${author ? `<span class="cover-book-author">${escHtml(String(author).slice(0, 50))}</span>` : ''}
  </div>`;
}

export const SHELF_COLORS = [
  '#5a8a7a', // teal
  '#7a5a8a', // purple
  '#b07040', // terracotta
  '#5a6a8a', // slate blue
  '#7a8a5a', // sage green
  '#8a5a5a', // dusty rose
  '#6a7a5a', // moss
  '#8a7a40', // warm amber
];

export function renderSkeletonCards(n = 8) {
  return Array.from({ length: n }, () => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-cover"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line" style="width:90%"></div>
        <div class="skeleton skeleton-line" style="width:70%"></div>
        <div class="skeleton skeleton-line-short"></div>
      </div>
    </div>`).join('');
}
