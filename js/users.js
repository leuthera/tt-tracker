// ─── User Management (admin only) ───────────────────────────────────────────

import { t } from './i18n.js';
import { esc } from './helpers.js';
import { state, apiFetch } from './state.js';
import { showModal, hideModal, showConfirmModal, showToast } from './ui.js';

async function showUsersModal() {
  showModal({ title: t('users.title'), bodyHTML: `<p style="color:var(--text-muted)">${esc(t('users.loading'))}</p>`, footerHTML: '' });
  try {
    const users = await apiFetch('/api/users');
    let html = '<div style="display:flex;flex-direction:column;gap:10px">';
    for (const u of users) {
      const isSelf = u.username === state.me.username;
      html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--surface-2);border-radius:var(--radius-md)">
        <div>
          <div style="font-weight:600;font-size:14px">${esc(u.username)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${esc(u.role)}${isSelf ? ' ' + esc(t('users.you')) : ''}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn--secondary" style="padding:6px 10px;font-size:12px;width:auto" data-action="reset-pw" data-user-id="${esc(u.id)}" data-username="${esc(u.username)}">${esc(t('users.resetPw'))}</button>
          ${isSelf ? '' : `<button class="btn btn--danger" style="padding:6px 10px;font-size:12px;width:auto" data-action="delete-user" data-user-id="${esc(u.id)}" data-username="${esc(u.username)}">${esc(t('users.deleteBtn'))}</button>`}
        </div>
      </div>`;
    }
    html += '</div>';
    document.getElementById('modal-body').innerHTML = html;
    // Event delegation for user actions
    document.getElementById('modal-body').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const userId = btn.dataset.userId;
      const username = btn.dataset.username;
      if (btn.dataset.action === 'reset-pw') _resetUserPw(userId, username);
      else if (btn.dataset.action === 'delete-user') _deleteUser(userId, username);
    });
    const footer = document.getElementById('modal-footer');
    footer.innerHTML = `<button class="btn btn--primary" id="add-user-btn">${esc(t('users.addUser'))}</button>`;
    footer.style.display = '';
    document.getElementById('add-user-btn').addEventListener('click', showAddUserModal);
  } catch (e) {
    document.getElementById('modal-body').innerHTML = `<p style="color:var(--danger)">${esc(t('users.failedLoad'))}</p>`;
  }
}

function showAddUserModal() {
  showModal({
    title: t('users.addUser'),
    bodyHTML: `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);margin-bottom:4px">${esc(t('users.username'))}</label>
          <input type="text" id="new-user-name" class="form-input" placeholder="${esc(t('users.username'))}" autocapitalize="off" autocomplete="off">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);margin-bottom:4px">${esc(t('users.password'))}</label>
          <input type="password" id="new-user-pass" class="form-input" placeholder="${esc(t('users.password'))}" autocomplete="new-password">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);margin-bottom:4px">${esc(t('users.role'))}</label>
          <select id="new-user-role" class="form-select">
            <option value="user">${esc(t('users.userRole'))}</option>
            <option value="admin">${esc(t('users.adminRole'))}</option>
          </select>
        </div>
      </div>
    `,
    footerHTML: `
      <button class="btn btn--primary" id="create-user-btn">${esc(t('users.create'))}</button>
      <button class="btn btn--secondary" id="back-to-users-btn">${esc(t('users.back'))}</button>
    `
  });
  document.getElementById('create-user-btn').addEventListener('click', async () => {
    const username = document.getElementById('new-user-name').value.trim();
    const password = document.getElementById('new-user-pass').value;
    const role = document.getElementById('new-user-role').value;
    if (!username || !password) return showToast(t('users.usernameAndPwRequired'), 'error');
    if (password.length < 4) return showToast(t('users.pwMin4'), 'error');
    try {
      await apiFetch('/api/users', { method: 'POST', body: JSON.stringify({ username, password, role }) });
      showToast(t('users.created'), 'success');
      showUsersModal();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
  document.getElementById('back-to-users-btn').addEventListener('click', showUsersModal);
}

function _resetUserPw(userId, username) {
  showModal({
    title: t('resetPw.title'),
    bodyHTML: `
      <p style="font-size:14px;color:var(--text-muted);margin-bottom:12px">${esc(t('resetPw.newPwFor', { name: username }))}</p>
      <input type="password" id="reset-pw-input" class="form-input" placeholder="${esc(t('resetPw.newPwPlaceholder'))}" autocomplete="new-password">
    `,
    footerHTML: `
      <button class="btn btn--primary" id="reset-pw-btn">${esc(t('resetPw.reset'))}</button>
      <button class="btn btn--secondary" id="back-to-users-btn2">${esc(t('users.back'))}</button>
    `
  });
  document.getElementById('reset-pw-btn').addEventListener('click', async () => {
    const password = document.getElementById('reset-pw-input').value;
    if (!password || password.length < 4) return showToast(t('users.pwMin4'), 'error');
    try {
      await apiFetch(`/api/users/${userId}/password`, { method: 'PUT', body: JSON.stringify({ password }) });
      showToast(t('resetPw.done'), 'success');
      showUsersModal();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
  document.getElementById('back-to-users-btn2').addEventListener('click', showUsersModal);
}

function _deleteUser(userId, username) {
  showConfirmModal(t('users.deleteConfirm', { name: username }), async () => {
    try {
      await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
      showToast(t('users.deleted'), 'success');
      showUsersModal();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

function showChangePasswordModal() {
  showModal({
    title: t('changePw.title'),
    bodyHTML: `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);margin-bottom:4px">${esc(t('changePw.current'))}</label>
          <input type="password" id="cur-pw-input" class="form-input" placeholder="${esc(t('changePw.currentPlaceholder'))}" autocomplete="current-password">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);margin-bottom:4px">${esc(t('changePw.new'))}</label>
          <input type="password" id="new-pw-input" class="form-input" placeholder="${esc(t('changePw.newPlaceholder'))}" autocomplete="new-password">
        </div>
      </div>
    `,
    footerHTML: `<button class="btn btn--primary" id="change-pw-btn">${esc(t('changePw.save'))}</button>`
  });
  document.getElementById('change-pw-btn').addEventListener('click', async () => {
    const currentPassword = document.getElementById('cur-pw-input').value;
    const newPassword = document.getElementById('new-pw-input').value;
    if (!currentPassword || !newPassword) return showToast(t('changePw.bothRequired'), 'error');
    if (newPassword.length < 4) return showToast(t('users.pwMin4'), 'error');
    try {
      await apiFetch('/api/me/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) });
      showToast(t('changePw.done'), 'success');
      hideModal();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

export { showUsersModal, showChangePasswordModal };
