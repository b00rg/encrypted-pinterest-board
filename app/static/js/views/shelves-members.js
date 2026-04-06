import { Icons } from '../icons.js';
import { escHtml } from '../utils.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../toast.js';

export async function openMembersPanel(shelfId) {
  const panel = document.getElementById('members-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.innerHTML = `<div style="padding:20px;text-align:center"><div class="spinner spinner-dark"></div></div>`;

  const membersRes = await api(`/shelves/${shelfId}/members`);

  if (!membersRes.ok) {
    panel.innerHTML = `<p style="padding:16px">Could not load members.</p>`;
    return;
  }

  const members = membersRes.data.members || [];
  const isOwner = membersRes.data.is_owner === true;

  // Only owners fetch join-requests and invitations
  let requests = [];
  let invites = [];
  if (isOwner) {
    const [requestsRes, invitesRes] = await Promise.all([
      api(`/shelves/${shelfId}/join-requests`),
      api(`/shelves/${shelfId}/invitations`),
    ]);
    requests = requestsRes.ok ? (requestsRes.data.requests || []) : [];
    invites  = invitesRes.ok  ? (invitesRes.data.invitations || []) : [];
  }

  panel.innerHTML = `
  <div class="members-panel-header">
    <h3 class="members-panel-title">${Icons.admin} Members</h3>
    <button class="btn btn-outline btn-sm" id="close-members-btn">Close</button>
  </div>

  <div class="members-list">
    ${members.map(m => `
      <div class="member-row">
        <span class="member-name">${Icons.user} ${escHtml(m.username)}</span>
        ${isOwner && m.username !== state.user?.username ? `
          <button class="btn btn-danger btn-sm remove-member-btn"
            data-shelf-id="${shelfId}" data-username="${escHtml(m.username)}">
            ${Icons.trash}
          </button>` : ''}
      </div>`).join('')}
  </div>

  ${isOwner && requests.length > 0 ? `
  <div class="members-section-title">Join Requests</div>
  <div class="members-list">
    ${requests.map(r => `
      <div class="member-row">
        <span class="member-name">${Icons.user} ${escHtml(r.username)}
          <span style="font-size:0.72rem;color:var(--text-muted);margin-left:6px">${escHtml(r.created_at)}</span>
        </span>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary btn-sm approve-request-btn"
            data-shelf-id="${shelfId}" data-req-id="${r.id}" data-username="${escHtml(r.username)}">
            Approve
          </button>
          <button class="btn btn-outline btn-sm reject-request-btn"
            data-shelf-id="${shelfId}" data-req-id="${r.id}" data-username="${escHtml(r.username)}">
            Reject
          </button>
        </div>
      </div>`).join('')}
  </div>` : ''}

  ${isOwner && invites.length > 0 ? `
  <div class="members-section-title">Pending Invitations</div>
  <div class="members-list">
    ${invites.map(i => `
      <div class="member-row">
        <span class="member-name">${Icons.user} ${escHtml(i.username)}
          <span style="font-size:0.72rem;color:var(--text-muted);margin-left:6px">invited ${escHtml(i.created_at)}</span>
        </span>
        <button class="btn btn-outline btn-sm cancel-invite-btn"
          data-shelf-id="${shelfId}" data-inv-id="${i.id}" data-username="${escHtml(i.username)}">
          Cancel
        </button>
      </div>`).join('')}
  </div>` : ''}

  ${isOwner ? `
  <div class="add-member-row">
    <input type="text" id="add-member-input" class="add-member-input"
      placeholder="Username to invite…" />
    <button class="btn btn-primary btn-sm" id="add-member-btn"
      data-shelf-id="${shelfId}" style="width:auto">
      ${Icons.plus} Invite
    </button>
  </div>` : ''}`;

  // Bind close
  document.getElementById('close-members-btn')?.addEventListener('click', () => {
    panel.classList.add('hidden');
  });

  if (!isOwner) return;

  // Invite new member
  document.getElementById('add-member-btn')?.addEventListener('click', async () => {
    const username = document.getElementById('add-member-input')?.value.trim();
    if (!username) return;
    const { ok, data } = await api(`/shelves/${shelfId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    if (ok) {
      showToast(`Invitation sent to ${username}.`, 'success');
      openMembersPanel(shelfId);
    } else {
      showToast(data.error || 'Failed to send invitation', 'error');
    }
  });

  // Approve join request
  panel.querySelectorAll('.approve-request-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { ok, data } = await api(
        `/shelves/${btn.dataset.shelfId}/join-requests/${btn.dataset.reqId}/approve`,
        { method: 'POST' }
      );
      if (ok) {
        showToast(`${btn.dataset.username} approved.`, 'success');
        openMembersPanel(shelfId);
      } else {
        showToast(data.error || 'Failed to approve', 'error');
      }
    });
  });

  // Reject join request
  panel.querySelectorAll('.reject-request-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Reject ${btn.dataset.username}'s request?`)) return;
      const { ok, data } = await api(
        `/shelves/${btn.dataset.shelfId}/join-requests/${btn.dataset.reqId}`,
        { method: 'DELETE' }
      );
      if (ok) {
        showToast(`Request from ${btn.dataset.username} rejected.`, 'success');
        openMembersPanel(shelfId);
      } else {
        showToast(data.error || 'Failed to reject', 'error');
      }
    });
  });

  // Cancel pending invitation
  panel.querySelectorAll('.cancel-invite-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Cancel invitation for ${btn.dataset.username}?`)) return;
      const { ok, data } = await api(
        `/shelves/${btn.dataset.shelfId}/invitations/${btn.dataset.invId}`,
        { method: 'DELETE' }
      );
      if (ok) {
        showToast(`Invitation for ${btn.dataset.username} cancelled.`, 'success');
        openMembersPanel(shelfId);
      } else {
        showToast(data.error || 'Failed to cancel invitation', 'error');
      }
    });
  });

  // Remove existing member
  panel.querySelectorAll('.remove-member-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = btn.dataset.username;
      if (!confirm(`Remove ${username} from this shelf? This will re-encrypt the shelf key.`)) return;
      const { ok, data } = await api(
        `/shelves/${shelfId}/members/${encodeURIComponent(username)}`,
        { method: 'DELETE' }
      );
      if (ok) {
        showToast(`${username} removed and shelf re-keyed.`, 'success');
        openMembersPanel(shelfId);
      } else {
        showToast(data.error || 'Failed to remove member', 'error');
      }
    });
  });
}
