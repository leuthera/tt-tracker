// ─── App Entry Point ────────────────────────────────────────────────────────

import { t, getLang, setLang } from './i18n.js';
import { state, apiFetch, refreshAll, logClientError } from './state.js';
import { showToast, hideLoading, navigateTo, hideModal } from './ui.js';
import {
  setRenderFns,
  renderHome, renderNewMatchTab, renderPlayers, renderHistory, renderStats,
  showAddPlayerModal, renderSetRows, updateResultPreview, submitMatch
} from './render.js';
import { showUsersModal, showChangePasswordModal } from './users.js';
import { showExportModal } from './export.js';
import { renderLocations, showAddLocationModal } from './locations.js';

// ─── Global Error Reporting ─────────────────────────────────────────────────

let _lastErrorMsg = '';
let _lastErrorTime = 0;

function _shouldReport(msg) {
  const now = Date.now();
  if (msg === _lastErrorMsg && now - _lastErrorTime < 5000) return false;
  _lastErrorMsg = msg;
  _lastErrorTime = now;
  return true;
}

window.onerror = (message, source, lineno, colno) => {
  const msg = String(message);
  if (_shouldReport(msg)) {
    logClientError({ message: msg, url: source, line: lineno, col: colno });
  }
};

window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
  if (_shouldReport(msg)) {
    const stack = event.reason instanceof Error ? event.reason.stack : undefined;
    logClientError({ message: msg, stack, url: location.href });
  }
});

// ─── Render function map ────────────────────────────────────────────────────

const renderFns = {
  'home':      renderHome,
  'new-match': renderNewMatchTab,
  'players':   renderPlayers,
  'history':   renderHistory,
  'stats':     renderStats,
  'locations': renderLocations
};

setRenderFns(renderFns);

// ─── THEME ──────────────────────────────────────────────────────────────────

function getEffectiveTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#1e5c1e' : '#2d7a2d');
}

// ─── STATIC LABEL UPDATE (for language toggle) ─────────────────────────────

function updateStaticLabels() {
  const navKeys = ['nav.home', 'nav.new', 'nav.players', 'nav.history', 'nav.stats', 'nav.locations'];
  document.querySelectorAll('.bottom-nav__item').forEach((btn, i) => {
    const label = btn.querySelector('.bottom-nav__label');
    if (label && navKeys[i]) label.textContent = t(navKeys[i]);
  });
  const logoutBtn = document.querySelector('form[action="/logout"] button');
  if (logoutBtn) logoutBtn.textContent = t('header.signOut');
  const playersLabel = document.querySelector('#tab-new-match .form-label');
  if (playersLabel) playersLabel.textContent = t('match.players');
  const setsLabel = document.querySelectorAll('#tab-new-match .form-label')[1];
  if (setsLabel) setsLabel.textContent = t('match.sets');
  const addSetBtn = document.getElementById('add-set-btn');
  if (addSetBtn) addSetBtn.textContent = t('match.addSet');
  const resultLabel = document.querySelector('.result-preview__label');
  if (resultLabel) resultLabel.textContent = t('match.result');
  const noteLabel = document.querySelector('label[for="match-note"]');
  if (noteLabel) noteLabel.textContent = t('match.noteLabel');
  const noteInput = document.getElementById('match-note');
  if (noteInput) noteInput.placeholder = t('match.notePlaceholder');
  const saveMatchBtn = document.getElementById('save-match-btn');
  if (saveMatchBtn && !saveMatchBtn.disabled) saveMatchBtn.textContent = t('match.save');
  const addPlayerBtn = document.getElementById('add-player-btn');
  if (addPlayerBtn) addPlayerBtn.textContent = t('players.addPlayer');
  const addLocBtn = document.getElementById('add-location-btn');
  if (addLocBtn) addLocBtn.textContent = t('locations.addLocation');
  const langBtn = document.getElementById('lang-toggle-btn');
  if (langBtn) langBtn.textContent = getLang().toUpperCase();
}

// ─── EVENT LISTENERS ────────────────────────────────────────────────────────

function attachListeners() {
  // Bottom nav
  document.querySelectorAll('.bottom-nav__item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.tab, renderFns));
  });

  // Modal: close button + backdrop + Escape key
  document.getElementById('modal-close-btn').addEventListener('click', hideModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) hideModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('modal-overlay').classList.contains('active')) {
      hideModal();
    }
  });

  // Add player
  document.getElementById('add-player-btn').addEventListener('click', showAddPlayerModal);

  // Add location
  document.getElementById('add-location-btn').addEventListener('click', showAddLocationModal);

  // Location select
  document.getElementById('location-select').addEventListener('change', e => {
    state.newMatch.locationId = e.target.value;
  });

  // Detect location via GPS
  document.getElementById('detect-location-btn').addEventListener('click', () => {
    const btn = document.getElementById('detect-location-btn');
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { haversineDistance } = await import('./helpers.js');
        const { loadLocations } = await import('./state.js');
        const locations = loadLocations().filter(l => l.lat != null && l.lng != null);
        if (locations.length === 0) { btn.disabled = false; return; }
        let nearest = locations[0], minDist = Infinity;
        for (const l of locations) {
          const d = haversineDistance(pos.coords.latitude, pos.coords.longitude, l.lat, l.lng);
          if (d < minDist) { minDist = d; nearest = l; }
        }
        state.newMatch.locationId = nearest.id;
        const sel = document.getElementById('location-select');
        sel.value = nearest.id;
        const { showToast: toast } = await import('./ui.js');
        toast(t('match.locationDetected', { name: nearest.name }), 'success');
        btn.disabled = false;
      },
      () => {
        showToast(t('addLocation.gpsError'), 'error');
        btn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // Doubles toggle
  document.getElementById('doubles-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.doubles-toggle__btn');
    if (!btn) return;
    const isDoubles = btn.dataset.mode === 'doubles';
    state.newMatch.isDoubles = isDoubles;
    document.getElementById('doubles-extra').style.display = isDoubles ? '' : 'none';
    document.querySelectorAll('.doubles-toggle__btn').forEach(b =>
      b.classList.toggle('doubles-toggle__btn--active', b.dataset.mode === btn.dataset.mode)
    );
    if (!isDoubles) {
      state.newMatch.player3Id = '';
      state.newMatch.player4Id = '';
    }
    updateResultPreview();
  });

  // Player 3/4 selects
  document.getElementById('player3-select').addEventListener('change', e => {
    state.newMatch.player3Id = e.target.value;
    updateResultPreview();
  });
  document.getElementById('player4-select').addEventListener('change', e => {
    state.newMatch.player4Id = e.target.value;
    updateResultPreview();
  });

  // Add set
  document.getElementById('add-set-btn').addEventListener('click', () => {
    state.newMatch.sets.push({ p1: 11, p2: 0 });
    renderSetRows();
    updateResultPreview();
  });

  // Set score inputs (event delegation)
  document.getElementById('sets-container').addEventListener('input', e => {
    const input = e.target;
    if (!input.classList.contains('set-row__score')) return;
    const idx = parseInt(input.dataset.idx);
    const pl = input.dataset.pl;
    const val = Math.max(0, Math.min(99, parseInt(input.value) || 0));
    input.value = val;
    if (state.newMatch.sets[idx]) {
      state.newMatch.sets[idx][pl] = val;
      updateResultPreview();
    }
  });

  // Remove set (event delegation)
  document.getElementById('sets-container').addEventListener('click', e => {
    const btn = e.target.closest('.set-row__remove');
    if (!btn || btn.disabled) return;
    const idx = parseInt(btn.dataset.idx);
    if (state.newMatch.sets.length > 1) {
      state.newMatch.sets.splice(idx, 1);
      renderSetRows();
      updateResultPreview();
    }
  });

  // Player selects
  document.getElementById('player1-select').addEventListener('change', e => {
    state.newMatch.player1Id = e.target.value;
    updateResultPreview();
  });
  document.getElementById('player2-select').addEventListener('change', e => {
    state.newMatch.player2Id = e.target.value;
    updateResultPreview();
  });

  // Match note
  document.getElementById('match-note').addEventListener('input', e => {
    state.newMatch.note = e.target.value;
  });

  // Save match
  document.getElementById('save-match-btn').addEventListener('click', submitMatch);

  // History filter
  document.getElementById('history-filter-select').addEventListener('change', async (e) => {
    state.historyFilter = e.target.value;
    await renderHistory();
  });

  // Stats filter
  document.getElementById('stats-filter-select').addEventListener('change', e => {
    state.statsFilter = e.target.value;
    renderStats();
  });

  // Stats date range filter
  document.getElementById('stats-date-filter').addEventListener('click', e => {
    const btn = e.target.closest('.stats-date-btn');
    if (!btn) return;
    state.statsDateRange = btn.dataset.range;
    renderStats();
  });
}

// ─── INIT ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Theme setup
  applyTheme(getEffectiveTheme());
  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    const current = getEffectiveTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!localStorage.getItem('theme')) applyTheme(getEffectiveTheme());
  });

  // Language toggle
  const langBtn = document.getElementById('lang-toggle-btn');
  langBtn.textContent = getLang().toUpperCase();
  langBtn.addEventListener('click', () => {
    const next = getLang() === 'en' ? 'de' : 'en';
    setLang(next);
    updateStaticLabels();
    renderFns[state.currentTab]?.();
  });

  // ─── Offline/Online Detection ─────────────────────────────────────

  function updateOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (state.isOnline) {
      banner.classList.remove('active');
    } else {
      banner.textContent = t('offline.banner');
      banner.classList.add('active');
    }
  }

  function updateSyncBadge() {
    const badge = document.getElementById('sync-badge');
    if (state.pendingSync > 0) {
      badge.textContent = state.pendingSync;
      badge.classList.add('active');
    } else {
      badge.classList.remove('active');
    }
  }

  window.addEventListener('online', () => {
    state.isOnline = true;
    updateOfflineBanner();
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SYNC_QUEUE' });
    }
  });

  window.addEventListener('offline', () => {
    state.isOnline = false;
    updateOfflineBanner();
  });

  // Service worker message handler
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { data } = event;
      if (data.type === 'QUEUE_COUNT') {
        state.pendingSync = data.count;
        updateSyncBadge();
      } else if (data.type === 'QUEUED_OFFLINE') {
        state.pendingSync++;
        updateSyncBadge();
        showToast(t('offline.queued'), 'info');
      } else if (data.type === 'SYNC_COMPLETE') {
        const { results } = data;
        state.pendingSync = Math.max(0, state.pendingSync - results.synced - results.failed);
        updateSyncBadge();
        if (results.synced > 0 && results.failed === 0) {
          showToast(t('offline.syncOk', { n: results.synced }), 'success');
        } else if (results.synced === 0 && results.failed > 0) {
          showToast(t('offline.syncFail', { n: results.failed }), 'error');
        } else if (results.synced > 0 && results.failed > 0) {
          showToast(t('offline.syncMixed', { ok: results.synced, fail: results.failed }), 'info');
        }
        refreshAll().then(() => {
          renderFns[state.currentTab]?.();
        }).catch(() => {});
      }
    });
  }

  updateOfflineBanner();
  updateSyncBadge();

  document.getElementById('export-btn').addEventListener('click', showExportModal);
  attachListeners();
  try {
    const [, me, ver] = await Promise.all([
      refreshAll().catch(() => {}),
      apiFetch('/api/me').catch(() => null),
      fetch('/api/version').then(r => r.json()).catch(() => null),
    ]);
    if (me) {
      state.me = me;
      if (me.role === 'admin') {
        document.getElementById('users-btn').style.display = '';
        document.getElementById('users-btn').addEventListener('click', showUsersModal);
      }
      document.getElementById('change-pw-header-btn').style.display = '';
      document.getElementById('change-pw-header-btn').addEventListener('click', showChangePasswordModal);
    }
    if (ver && ver.sha && ver.sha !== 'dev') {
      const badge = document.getElementById('version-badge');
      badge.textContent = ver.sha.slice(0, 7);
      badge.style.display = '';
    }
  } catch(e) {
    showToast(t('toast.dataError'), 'error');
  }
  renderHome();
  updateStaticLabels();
  hideLoading();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
    navigator.serviceWorker.ready.then(reg => {
      if (reg.active) reg.active.postMessage({ type: 'GET_QUEUE_COUNT' });
    });
  }
});
