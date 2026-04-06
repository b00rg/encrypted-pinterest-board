import { Icons } from '../icons.js';
import { escHtml, initials } from '../utils.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../toast.js';
import { loadAdminUsers } from '../data.js';
// refreshPageBody and switchToShelf are imported from app.js.
// The circular reference is safe: only called inside event handlers.
import { refreshPageBody, switchToShelf } from '../app.js';

export function renderAdminPage() {
  const allUsers = state.adminUsers;
  const members = allUsers.filter(u => u.is_member).length;
  const ownedShelves = (state.myShelves || []).filter(s => s.is_owner);

  // Filter users based on search query
  const q = state.adminSearchQuery || '';
  const users = q
    ? allUsers.filter(u => u.username.toLowerCase().includes(q.toLowerCase()))
    : allUsers;

  return `
  <div>
    <div class="section-header">
      <div>
        <h1 class="section-title">Admin Panel</h1>
        <p class="section-subtitle">Manage shelf membership and user access.</p>
      </div>
      <button class="nav-btn nav-btn-ghost" id="back-to-shelf">
        ${Icons.shelf} Back to Shelf
      </button>
    </div>

    <div class="admin-stats">
      <div class="stat-card">
        <div class="stat-value">${allUsers.length}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${members}</div>
        <div class="stat-label">Global Shelf Members</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${allUsers.length - members}</div>
        <div class="stat-label">Not Yet Added</div>
      </div>
    </div>

    <div class="admin-search-bar">
      ${Icons.search.replace('<svg', '<svg class="admin-search-icon"')}
      <input type="search" id="admin-search-input" class="admin-search-input"
        placeholder="Search users by username…" autocomplete="off"
        value="${escHtml(q)}" />
    </div>

    <div class="users-table-wrapper">
      <table class="users-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Status</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users.length === 0
            ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">
                 No users match "${escHtml(q)}".
               </td></tr>`
            : users.map(u => renderUserRow(u, ownedShelves)).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderUserRow(u, ownedShelves) {
  const isSelf = u.username === state.user?.username;
  return `
  <tr data-username="${escHtml(u.username)}">
    <td>
      <div class="user-row-info">
        <div class="table-avatar">${escHtml(initials(u.username))}</div>
        <strong>${escHtml(u.username)}</strong>${isSelf ? ' <span style="font-size:0.75rem;color:var(--text-muted)">(you)</span>' : ''}
      </div>
    </td>
    <td>
      ${u.is_member
        ? `<span class="badge badge-member">${Icons.check} Member</span>`
        : `<span class="badge badge-pending">${Icons.clock} Pending</span>`}
    </td>
    <td>
      ${u.is_admin ? `<span class="badge badge-admin">${Icons.admin} Admin</span>` : '<span style="color:var(--text-muted);font-size:0.8rem">User</span>'}
    </td>
    <td>
      <div class="table-actions">
        ${!u.is_member && !isSelf ? `
          <div class="admin-add-row">
            <select class="admin-shelf-select" id="shelf-select-${escHtml(u.username)}" data-username="${escHtml(u.username)}">
              <option value="global">Global Shelf</option>
              ${ownedShelves.map(s => `
                <option value="shelf-${s.id}">${escHtml(s.name)}</option>`).join('')}
            </select>
            <button class="btn btn-outline btn-sm admin-add-btn" data-username="${escHtml(u.username)}">
              ${Icons.plus} Add
            </button>
          </div>` : ''}
        ${u.is_member && !isSelf ? `
          <button class="btn btn-danger btn-sm admin-remove-btn" data-username="${escHtml(u.username)}">
            ${Icons.trash} Remove from Global
          </button>` : ''}
        ${isSelf ? '<span style="color:var(--text-muted);font-size:0.8rem">—</span>' : ''}
      </div>
    </td>
  </tr>`;
}

export function bindAdminEvents() {
  document.getElementById('back-to-shelf')?.addEventListener('click', () => switchToShelf());

  // Username search filter
  const searchInput = document.getElementById('admin-search-input');
  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', e => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.adminSearchQuery = e.target.value;
        refreshPageBody();
        bindAdminEvents();
      }, 200);
    });
  }

  document.querySelectorAll('.admin-add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = btn.dataset.username;
      const select = document.getElementById(`shelf-select-${username}`);
      const shelfValue = select?.value || 'global';

      btn.disabled = true;
      btn.innerHTML = `<div class="spinner spinner-dark"></div>`;

      let ok, data;
      if (shelfValue === 'global') {
        ({ ok, data } = await api('/admin/add', {
          method: 'POST', body: JSON.stringify({ username }),
        }));
      } else {
        const shelfId = shelfValue.replace('shelf-', '');
        ({ ok, data } = await api(`/shelves/${shelfId}/members`, {
          method: 'POST', body: JSON.stringify({ username }),
        }));
      }

      if (ok) {
        const shelfName = shelfValue === 'global' ? 'global shelf' : select?.options[select.selectedIndex]?.text;
        showToast(`${username} added to ${shelfName}.`, 'success');
        await loadAdminUsers();
        refreshPageBody();
        bindAdminEvents();
      } else {
        showToast(data.error || 'Failed to add user.', 'error');
        btn.disabled = false;
        btn.innerHTML = `${Icons.plus} Add`;
      }
    });
  });

  document.querySelectorAll('.admin-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = btn.dataset.username;
      if (!confirm(`Remove "${username}" from the global shelf? Their access will be revoked and the shelf will be re-keyed.`)) return;
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner"></div>`;
      const { ok, data } = await api('/admin/remove', {
        method: 'POST', body: JSON.stringify({ username }),
      });
      if (ok) {
        showToast(`${username} removed and shelf re-keyed.`, 'success');
        await loadAdminUsers();
        refreshPageBody();
        bindAdminEvents();
      } else {
        showToast(data.error || 'Failed to remove user.', 'error');
        btn.disabled = false;
        btn.innerHTML = `${Icons.trash} Remove from Global`;
      }
    });
  });
}
