// ─── UI Utilities ───────────────────────────────────────────────────────────

import { t } from './i18n.js';
import { esc, relativeTime, formatSets } from './helpers.js';
import { state, getPlayerById, getLocationById, deleteMatch, loadPlayers } from './state.js';
import { countSetWins } from './stats.js';

// ─── MODAL SYSTEM ───────────────────────────────────────────────────────────

function showModal({ title, bodyHTML, footerHTML }) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  const footer = document.getElementById('modal-footer');
  footer.innerHTML = footerHTML || '';
  footer.style.display = footerHTML ? '' : 'none';
  document.getElementById('modal-overlay').classList.add('active');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

function showConfirmModal(message, onConfirm) {
  showModal({
    title: t('confirm.title'),
    bodyHTML: `<p style="font-size:15px;line-height:1.6;color:var(--text-muted)">${esc(message)}</p>`,
    footerHTML: `
      <button class="btn btn--danger" id="confirm-yes">${esc(t('confirm.delete'))}</button>
      <button class="btn btn--secondary" id="confirm-no">${esc(t('confirm.cancel'))}</button>
    `
  });
  document.getElementById('confirm-yes').addEventListener('click', () => { hideModal(); onConfirm(); });
  document.getElementById('confirm-no').addEventListener('click', hideModal);
}

// ─── TOAST ──────────────────────────────────────────────────────────────────

function showToast(message, type) {
  const el = document.createElement('div');
  el.className = `toast toast--${type || 'info'}`;
  el.textContent = message;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 320);
  }, 2500);
}

// ─── LOADING ────────────────────────────────────────────────────────────────

function showLoading() {
  document.getElementById('loading-overlay')?.classList.add('active');
}

function hideLoading() {
  document.getElementById('loading-overlay')?.classList.remove('active');
}

// ─── MATCH CARD ─────────────────────────────────────────────────────────────

function createMatchCard(match, { onDeleteDone, onEdit, onDetail } = {}) {
  const p1 = getPlayerById(match.player1Id);
  const p2 = getPlayerById(match.player2Id);
  const p1Name = p1?.name || 'Unknown';
  const p2Name = p2?.name || 'Unknown';
  const { p1: s1, p2: s2 } = countSetWins(match.sets || []);
  const p1Won = match.winnerId === match.player1Id;
  const p2Won = match.winnerId === match.player2Id;

  let team1Label, team2Label;
  if (match.isDoubles) {
    const p3 = getPlayerById(match.player3Id);
    const p4 = getPlayerById(match.player4Id);
    team1Label = `${esc(p1Name)} & ${esc(p3?.name || 'Unknown')}`;
    team2Label = `${esc(p2Name)} & ${esc(p4?.name || 'Unknown')}`;
  } else {
    team1Label = esc(p1Name);
    team2Label = esc(p2Name);
  }

  const card = document.createElement('div');
  card.className = 'match-card';
  if (onDetail) card.style.cursor = 'pointer';

  card.innerHTML = `
    <div class="match-card__header">
      <div class="match-card__players">
        ${match.isDoubles ? '<span class="match-card__badge">2v2</span>' : ''}
        <span class="match-card__player ${p1Won ? 'match-card__player--winner' : ''}">${team1Label}</span>
        <span class="match-card__vs">vs</span>
        <span class="match-card__player ${p2Won ? 'match-card__player--winner' : ''}">${team2Label}</span>
      </div>
      <span class="match-card__score">${s1}\u2013${s2}</span>
    </div>
    <div class="match-card__sets">${formatSets(match.sets)}</div>
    <div class="match-card__meta">
      <span class="match-card__time">${relativeTime(match.date)}</span>
      ${match.locationId ? `<span class="match-card__location">&#x1F4CD; ${esc((getLocationById(match.locationId) || {}).name || '')}</span>` : ''}
      ${match.note ? `<span class="match-card__note">${esc(match.note)}</span>` : ''}
    </div>
  `;

  if (onDetail) {
    card.addEventListener('click', () => onDetail(match));
  }

  const canEdit = state.me.role === 'admin' || (match.creatorId && match.creatorId === state.me.userId);
  const isAdmin = state.me.role === 'admin';

  if (canEdit && onEdit) {
    const editBtn = document.createElement('button');
    editBtn.className = 'match-card__edit';
    editBtn.setAttribute('aria-label', t('match.edit'));
    editBtn.textContent = '\u270E';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); onEdit(match); });
    card.querySelector('.match-card__header').appendChild(editBtn);
  }

  if (isAdmin) {
    const onConfirmDelete = () => {
      showConfirmModal(t('confirm.deleteMatch'), async () => {
        try {
          await deleteMatch(match.id);
          showToast(t('toast.matchDeleted'), 'success');
          if (onDeleteDone) onDeleteDone();
        } catch(e) {
          showToast(t('toast.matchDeleteError'), 'error');
        }
      });
    };
    initSwipeToDelete(card, onConfirmDelete);
    const delBtn = document.createElement('button');
    delBtn.className = 'match-card__delete';
    delBtn.setAttribute('aria-label', t('confirm.delete'));
    delBtn.textContent = '\u00D7';
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); onConfirmDelete(); });
    card.querySelector('.match-card__header').appendChild(delBtn);
  }

  return card;
}

// ─── SWIPE TO DELETE ────────────────────────────────────────────────────────

function initSwipeToDelete(el, onDelete) {
  let startX = 0, startY = 0, active = false;
  const THRESHOLD = 65;

  el.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    active = true;
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    if (!active) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx)) { active = false; el.style.transform = ''; return; }
    if (dx < 0) el.style.transform = `translateX(${Math.max(dx, -80)}px)`;
  }, { passive: true });

  el.addEventListener('touchend', e => {
    if (!active) return;
    active = false;
    const dx = e.changedTouches[0].clientX - startX;
    el.style.transform = '';
    if (dx < -THRESHOLD) onDelete();
  });
}

// ─── FILTER HELPER ──────────────────────────────────────────────────────────

function populateFilter(sel, currentVal, defaultLabel) {
  const players = loadPlayers();
  sel.innerHTML = `<option value="">${defaultLabel}</option>` +
    players.map(p => `<option value="${esc(p.id)}" ${currentVal===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
  if (currentVal) sel.value = currentVal;
}

// ─── NAVIGATION ─────────────────────────────────────────────────────────────

let _navCounter = 0;

async function navigateTo(tabId, renderFns) {
  const navId = ++_navCounter;

  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.bottom-nav__item').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });

  const panel = document.getElementById('tab-' + tabId);
  if (panel) panel.classList.add('active');
  const btn = document.querySelector(`[data-tab="${tabId}"]`);
  if (btn) {
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
  }

  state.currentTab = tabId;
  document.querySelector('.tab-content').scrollTop = 0;

  showLoading();

  try {
    const { refreshAll } = await import('./state.js');
    await refreshAll();
  } catch(e) {
    if (!state.isOnline) {
      // Offline — use cached state
    } else {
      showToast(t('toast.dataError'), 'error');
      hideLoading();
      return;
    }
  }

  if (navId !== _navCounter) return;

  await renderFns[tabId]?.();

  hideLoading();
}

// ─── PULL TO REFRESH ─────────────────────────────────────────────────────────

function initPullToRefresh(onRefresh) {
  const scrollEl = document.querySelector('.tab-content');
  const ptrEl = document.getElementById('pull-to-refresh');
  if (!scrollEl || !ptrEl) return;

  const THRESHOLD = 60;
  let startY = 0;
  let pulling = false;

  scrollEl.addEventListener('touchstart', e => {
    if (scrollEl.scrollTop === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  scrollEl.addEventListener('touchmove', e => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < 0 || scrollEl.scrollTop > 0) { pulling = false; ptrEl.style.height = ''; ptrEl.classList.remove('pull-to-refresh--pulling'); return; }
    ptrEl.classList.add('pull-to-refresh--pulling');
    ptrEl.style.height = Math.min(dy * 0.4, THRESHOLD) + 'px';
  }, { passive: true });

  scrollEl.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    const h = parseFloat(ptrEl.style.height) || 0;
    ptrEl.classList.remove('pull-to-refresh--pulling');
    ptrEl.style.height = '';
    if (h >= THRESHOLD * 0.8) {
      ptrEl.classList.add('pull-to-refresh--refreshing');
      await onRefresh();
      ptrEl.classList.remove('pull-to-refresh--refreshing');
    }
  });
}

export {
  showModal, hideModal, showConfirmModal, showToast,
  showLoading, hideLoading,
  createMatchCard, initSwipeToDelete,
  populateFilter,
  navigateTo, _navCounter,
  initPullToRefresh
};
