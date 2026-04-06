import { Icons } from '../icons.js';
import { escHtml } from '../utils.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../toast.js';
import { loadPendingInvitations, loadPendingRequests } from '../data.js';
import { refreshPageBody, switchToMyShelves } from '../app.js';

export function renderPendingAccessPage() {
  const invites  = state.pendingInvitations || [];
  const requests = state.pendingRequests    || [];
  const hasAny   = invites.length > 0 || requests.length > 0;

  return `
  <div>
    <div class="section-header">
      <div>
        <h1 class="section-title">Pending Access</h1>
        <p class="section-subtitle">Shelf invitations you've received and join requests you've sent.</p>
      </div>
    </div>

    ${!hasAny ? `
    <div class="empty-state">
      <div class="empty-state-icon">${Icons.clock}</div>
      <h3>Nothing pending</h3>
      <p>You have no outstanding invitations or join requests.</p>
    </div>` : ''}

    ${invites.length > 0 ? `
    <h2 class="pending-section-title">${Icons.info} Invitations to Accept</h2>
    <div class="pending-list">
      ${invites.map(inv => `
        <div class="pending-row">
          <div class="pending-info">
            <div class="pending-shelf-name">${escHtml(inv.shelf_name)}</div>
            <div class="pending-meta">Invited by ${escHtml(inv.owner_username)} · ${escHtml(inv.created_at)}</div>
          </div>
          <div class="pending-actions">
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
    </div>` : ''}

    ${requests.length > 0 ? `
    <h2 class="pending-section-title" style="margin-top:${invites.length > 0 ? '32px' : '0'}">${Icons.clock} Join Requests Sent</h2>
    <div class="pending-list">
      ${requests.map(req => `
        <div class="pending-row">
          <div class="pending-info">
            <div class="pending-shelf-name">${escHtml(req.shelf_name)}</div>
            <div class="pending-meta">Owner: ${escHtml(req.owner_username)} · Sent ${escHtml(req.created_at)}</div>
          </div>
          <div class="pending-actions">
            <span class="badge badge-pending">${Icons.clock} Awaiting approval</span>
            <button class="btn btn-outline btn-sm cancel-request-btn"
              data-shelf-id="${req.shelf_id}" data-shelf-name="${escHtml(req.shelf_name)}"
              data-req-id="${req.id}">
              Cancel Request
            </button>
          </div>
        </div>`).join('')}
    </div>` : ''}
  </div>`;
}

export function bindPendingAccessEvents() {
  document.querySelectorAll('.accept-invite-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const invId     = parseInt(btn.dataset.invId, 10);
      const shelfName = btn.dataset.shelfName;
      const password  = window.prompt(`Enter your password to accept the invitation to "${shelfName}":`);
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
    });
  });

  document.querySelectorAll('.decline-invite-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const invId     = parseInt(btn.dataset.invId, 10);
      const shelfName = btn.dataset.shelfName;
      if (!confirm(`Decline the invitation to "${shelfName}"?`)) return;

      const { ok, data } = await api(`/user/invitations/${invId}`, { method: 'DELETE' });
      if (ok) {
        showToast(`Invitation to "${shelfName}" declined.`, 'success');
        state.pendingInvitations = state.pendingInvitations.filter(i => i.id !== invId);
        refreshPageBody();
        bindPendingAccessEvents();
      } else {
        showToast(data?.error || 'Failed to decline', 'error');
      }
    });
  });

  document.querySelectorAll('.cancel-request-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const shelfId   = parseInt(btn.dataset.shelfId, 10);
      const shelfName = btn.dataset.shelfName;
      if (!confirm(`Cancel your request to join "${shelfName}"?`)) return;

      const { ok, data } = await api(`/shelves/${shelfId}/join-requests/mine`, { method: 'DELETE' });
      if (ok) {
        showToast(`Request to join "${shelfName}" cancelled.`, 'success');
        state.pendingRequests = state.pendingRequests.filter(r => r.shelf_id !== shelfId);
        refreshPageBody();
        bindPendingAccessEvents();
      } else {
        showToast(data?.error || 'Failed to cancel request', 'error');
      }
    });
  });
}
