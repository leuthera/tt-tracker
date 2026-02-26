// ─── Render Functions ───────────────────────────────────────────────────────

import { t } from './i18n.js';
import { esc, mkAvatar } from './helpers.js';
import { state, loadPlayers, loadMatches, getPlayerById, loadLocations, addPlayer, deletePlayer, addMatch, updateMatch, getComments, addComment, deleteComment, apiFetch } from './state.js';
import { countSetWins, computeStats, getLeaderboard, computeH2H } from './stats.js';
import { showModal, hideModal, showConfirmModal, showToast, createMatchCard, populateFilter, navigateTo } from './ui.js';

// ─── Render function map (set by app.js via setRenderFns) ───────────────────

let _renderFns = {};

function setRenderFns(fns) {
  _renderFns = fns;
}

// ─── RENDER: HOME ───────────────────────────────────────────────────────────

function renderHome() {
  renderWelcome();
  renderRecentMatches();
  renderTopPlayers();
}

function renderWelcome() {
  document.getElementById('home-welcome').innerHTML = `
    <div class="welcome-card">
      <div class="welcome-card__text">
        <h2>${esc(t('home.ready'))}</h2>
        <p>${esc(t('home.trackResults'))}</p>
      </div>
      <button class="welcome-card__btn" id="welcome-new-btn">${esc(t('home.newMatch'))}</button>
    </div>
  `;
  document.getElementById('welcome-new-btn').addEventListener('click', () => navigateTo('new-match', _renderFns));
}

function renderRecentMatches() {
  const el = document.getElementById('home-recent-matches');
  const matches = loadMatches();

  if (matches.length === 0) {
    el.innerHTML = `
      <div class="section__header"><span class="section__title">${esc(t('home.recentMatches'))}</span></div>
      <div class="empty-state">
        <div class="empty-state__icon">🏓</div>
        <div class="empty-state__title">${esc(t('home.noMatchesTitle'))}</div>
        <div class="empty-state__text">${esc(t('home.noMatchesText'))}</div>
      </div>
    `;
    return;
  }

  const recent = matches.slice(0, 5);
  const frag = document.createDocumentFragment();

  const hdr = document.createElement('div');
  hdr.className = 'section__header';
  hdr.innerHTML = `<span class="section__title">${esc(t('home.recentMatches'))}</span>`;
  if (matches.length > 5) {
    const a = document.createElement('button');
    a.className = 'section__action';
    a.textContent = t('home.viewAll');
    a.addEventListener('click', () => navigateTo('history', _renderFns));
    hdr.appendChild(a);
  }
  frag.appendChild(hdr);
  recent.forEach(m => frag.appendChild(createMatchCard(m, {
    onDeleteDone: () => {
      if (state.currentTab === 'history') renderHistory();
      else renderHome();
    },
    onEdit: (match) => showEditMatchModal(match, () => renderHome()),
    onDetail: (match) => showMatchDetailModal(match),
  })));

  el.textContent = '';
  el.appendChild(frag);
}

function renderTopPlayers() {
  const el = document.getElementById('home-top-players');
  const players = loadPlayers();

  if (players.length === 0) {
    el.innerHTML = `
      <div class="section__header">
        <span class="section__title">${esc(t('home.players'))}</span>
        <button class="section__action" id="home-add-player">${esc(t('home.addPlayers'))}</button>
      </div>
      <div class="empty-state">
        <div class="empty-state__icon">👥</div>
        <div class="empty-state__title">${esc(t('home.noPlayersTitle'))}</div>
        <div class="empty-state__text">${esc(t('home.noPlayersText'))}</div>
      </div>
    `;
    document.getElementById('home-add-player').addEventListener('click', () => navigateTo('players', _renderFns));
    return;
  }

  const lb = getLeaderboard(players, loadMatches()).slice(0, 3);
  if (lb.length === 0) { el.innerHTML = ''; return; }

  const rankClass = ['leaderboard__rank--gold','leaderboard__rank--silver','leaderboard__rank--bronze'];
  let html = `
    <div class="section__header">
      <span class="section__title">${esc(t('home.topPlayers'))}</span>
      <button class="section__action" id="home-see-stats">${esc(t('home.seeAllStats'))}</button>
    </div>
    <div class="leaderboard">
  `;
  lb.forEach(({ player, stats }, i) => {
    html += `
      <div class="leaderboard__row">
        <span class="leaderboard__rank ${rankClass[i]||''}">${i+1}</span>
        <span class="leaderboard__name">${esc(player.name)}</span>
        <span class="leaderboard__record">${stats.wins}W ${stats.losses}L</span>
        <span class="leaderboard__winrate">${stats.winRate}%</span>
      </div>
    `;
  });
  html += `</div>`;
  el.innerHTML = html;
  document.getElementById('home-see-stats')?.addEventListener('click', () => navigateTo('stats', _renderFns));
}

// ─── RENDER: NEW MATCH TAB ──────────────────────────────────────────────────

function renderNewMatchTab() {
  populatePlayerSelects();
  populateLocationSelect();
  renderSetRows();
  updateResultPreview();
  document.getElementById('match-note').value = state.newMatch.note;
  const saveBtn = document.getElementById('save-match-btn');
  saveBtn.disabled = false;
  saveBtn.textContent = t('match.save');
}

function populateLocationSelect() {
  const locations = loadLocations();
  const sel = document.getElementById('location-select');
  if (!sel) return;
  const placeholder = `<option value="">${esc(t('match.noLocation'))}</option>`;
  const opts = locations.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
  sel.innerHTML = placeholder + opts;
  sel.value = state.newMatch.locationId || '';
}

function populatePlayerSelects() {
  const players = loadPlayers();
  const opts = players.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  const placeholder = `<option value="">${esc(t('match.selectPlayer'))}</option>`;

  const s1 = document.getElementById('player1-select');
  const s2 = document.getElementById('player2-select');
  s1.innerHTML = placeholder + opts;
  s2.innerHTML = placeholder + opts;
  s1.value = state.newMatch.player1Id;
  s2.value = state.newMatch.player2Id;
}

function renderSetRows() {
  const container = document.getElementById('sets-container');
  container.innerHTML = '';
  const sets = state.newMatch.sets;

  sets.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
      <span class="set-row__label">S${i+1}</span>
      <input class="set-row__score" type="number" inputmode="numeric" min="0" max="99"
             value="${s.p1}" data-idx="${i}" data-pl="p1">
      <span class="set-row__sep">\u2013</span>
      <input class="set-row__score" type="number" inputmode="numeric" min="0" max="99"
             value="${s.p2}" data-idx="${i}" data-pl="p2">
      <button class="set-row__remove" data-idx="${i}"
              ${sets.length <= 1 ? 'disabled' : ''} aria-label="Remove">\u00D7</button>
    `;
    container.appendChild(row);
  });
}

function updateResultPreview() {
  const p1Id = document.getElementById('player1-select')?.value || '';
  const p2Id = document.getElementById('player2-select')?.value || '';
  const preview = document.getElementById('result-preview');
  const text = document.getElementById('result-preview-text');
  if (!preview) return;

  if (!p1Id || !p2Id) {
    preview.className = 'result-preview result-preview--neutral';
    text.textContent = t('match.selectAndEnter');
    return;
  }
  if (p1Id === p2Id) {
    preview.className = 'result-preview result-preview--neutral';
    text.textContent = t('match.selectDifferent');
    return;
  }

  const { p1: w1, p2: w2 } = countSetWins(state.newMatch.sets);
  const p1 = getPlayerById(p1Id);
  const p2 = getPlayerById(p2Id);
  const n1 = p1?.name || 'P1';
  const n2 = p2?.name || 'P2';

  if (w1 > w2) {
    preview.className = 'result-preview result-preview--winning';
    text.textContent = t('match.leads', { name: n1, score: `${w1}\u2013${w2}` });
  } else if (w2 > w1) {
    preview.className = 'result-preview result-preview--winning';
    text.textContent = t('match.leads', { name: n2, score: `${w2}\u2013${w1}` });
  } else {
    preview.className = 'result-preview result-preview--neutral';
    text.textContent = w1 === 0 ? t('match.enterScores') : t('match.tied', { score: `${w1}\u2013${w2}` });
  }
}

function validateNewMatch() {
  const p1Id = document.getElementById('player1-select').value;
  const p2Id = document.getElementById('player2-select').value;

  if (!p1Id || !p2Id) return t('match.errorBothPlayers');
  if (p1Id === p2Id) return t('match.errorDifferent');
  if (state.newMatch.sets.length === 0) return t('match.errorOneSet');

  for (let i = 0; i < state.newMatch.sets.length; i++) {
    const s = state.newMatch.sets[i];
    const p1s = Number(s.p1), p2s = Number(s.p2);
    if (p1s === p2s) return t('match.errorSetDraw', { n: i + 1 });
  }

  return null;
}

async function submitMatch() {
  const err = validateNewMatch();
  if (err) { showToast(err, 'error'); return; }

  const saveBtn = document.getElementById('save-match-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = t('match.saving');

  try {
    await addMatch({
      player1Id: document.getElementById('player1-select').value,
      player2Id: document.getElementById('player2-select').value,
      sets: [...state.newMatch.sets],
      note: document.getElementById('match-note').value,
      locationId: state.newMatch.locationId || undefined
    });
    state.newMatch = { player1Id: '', player2Id: '', sets: [{p1: 11, p2: 0}], note: '', locationId: '' };
    showToast(t('match.saved'), 'success');
    await navigateTo('home', _renderFns);
  } catch(e) {
    showToast(e.message || t('match.errorSave'), 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = t('match.save');
  }
}

// ─── RENDER: PLAYERS ────────────────────────────────────────────────────────

function renderPlayers() {
  const el = document.getElementById('players-list');
  const players = loadPlayers();

  if (players.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">👥</div>
        <div class="empty-state__title">${esc(t('players.noPlayersTitle'))}</div>
        <div class="empty-state__text">${esc(t('players.noPlayersText'))}</div>
      </div>
    `;
    return;
  }

  el.innerHTML = '';
  [...players].sort((a, b) => a.name.localeCompare(b.name)).forEach(player => {
    const stats = computeStats(player.id, loadMatches());
    const row = document.createElement('div');
    row.className = 'player-row';

    const avatar = mkAvatar(player.name, 'md');
    row.appendChild(avatar);

    const matchLabel = stats.totalMatches === 1 ? t('players.match1') : t('players.matches', { n: stats.totalMatches });
    const info = document.createElement('div');
    info.className = 'player-row__info';
    info.innerHTML = `
      <div class="player-row__name">${esc(player.name)}</div>
      <div class="player-row__record">${stats.wins}W &nbsp;${stats.losses}L &nbsp;&bull;&nbsp;${esc(matchLabel)}</div>
    `;
    row.appendChild(info);

    const chevron = document.createElement('span');
    chevron.className = 'player-row__chevron';
    chevron.textContent = '\u203A';
    row.appendChild(chevron);

    row.addEventListener('click', () => showPlayerDetailModal(player.id));
    el.appendChild(row);
  });
}

function showAddPlayerModal() {
  showModal({
    title: t('addPlayer.title'),
    bodyHTML: `
      <div class="form-group">
        <label class="form-label" for="new-player-name">${esc(t('addPlayer.nameLabel'))}</label>
        <input type="text" class="form-input" id="new-player-name"
               placeholder="${esc(t('addPlayer.namePlaceholder'))}" maxlength="30" autocomplete="off">
      </div>
    `,
    footerHTML: `<button class="btn btn--primary" id="modal-save-player">${esc(t('addPlayer.save'))}</button>`
  });

  const input = document.getElementById('new-player-name');
  setTimeout(() => input.focus(), 50);

  const save = async () => {
    const btn = document.getElementById('modal-save-player');
    btn.disabled = true;
    const res = await addPlayer(input.value);
    btn.disabled = false;
    if (!res.ok) { showToast(res.error, 'error'); return; }
    hideModal();
    showToast(t('addPlayer.added', { name: res.player.name }), 'success');
    renderPlayers();
    if (state.currentTab === 'home') renderHome();
  };

  document.getElementById('modal-save-player').addEventListener('click', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
}

function showPlayerDetailModal(playerId) {
  const player = getPlayerById(playerId);
  if (!player) return;
  const matches = loadMatches();
  const stats = computeStats(playerId, matches);

  const formBadges = stats.recentForm.map(f =>
    `<span class="form-badge form-badge--${f==='W'?'win':f==='L'?'loss':'draw'}">${f}</span>`
  ).join('');

  let streakHTML = '';
  if (stats.streak !== 0) {
    const w = stats.streak > 0;
    const streakKey = w ? 'playerDetail.winStreak' : 'playerDetail.lossStreak';
    streakHTML = `<span class="streak-badge streak-badge--${w?'win':'loss'}" style="margin-top:6px;display:inline-flex">
      ${w?'🔥':'❄️'} ${esc(t(streakKey, { n: Math.abs(stats.streak) }))}
    </span>`;
  }

  const matchesPlayedText = stats.totalMatches === 1 ? t('playerDetail.matchPlayed1') : t('playerDetail.matchesPlayed', { n: stats.totalMatches });

  const opponents = loadPlayers().filter(p => p.id !== playerId);
  const h2hRows = opponents.map(opp => {
    const h = computeH2H(playerId, opp.id, matches);
    if (h.total === 0) return '';
    return `<div class="h2h-row">
      <span class="h2h-row__name">${esc(opp.name)}</span>
      <span class="h2h-row__record">${h.p1Wins}W \u2013 ${h.p2Wins}L</span>
    </div>`;
  }).filter(Boolean).join('');

  const avatarHTML = mkAvatar(player.name, 'lg').outerHTML;

  showModal({
    title: player.name,
    bodyHTML: `
      <div class="player-detail__header">
        ${avatarHTML}
        <div>
          <div class="player-detail__name">${esc(player.name)}</div>
          <div class="player-detail__matches">${esc(matchesPlayedText)}</div>
          ${streakHTML}
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-card__value">${stats.winRate}%</div><div class="stat-card__label">${esc(t('playerDetail.winRate'))}</div></div>
        <div class="stat-card"><div class="stat-card__value">${stats.wins}\u2013${stats.losses}</div><div class="stat-card__label">${esc(t('playerDetail.wl'))}</div></div>
        <div class="stat-card"><div class="stat-card__value">${stats.setsWon}</div><div class="stat-card__label">${esc(t('playerDetail.setsWon'))}</div></div>
        <div class="stat-card"><div class="stat-card__value">${stats.pointsWon}</div><div class="stat-card__label">${esc(t('playerDetail.pointsWon'))}</div></div>
      </div>
      ${formBadges ? `
        <div class="section__title" style="margin-bottom:8px">${esc(t('playerDetail.recentForm'))}</div>
        <div class="form-badges" style="margin-bottom:16px">${formBadges}</div>
      ` : ''}
      ${h2hRows ? `
        <div class="section__title" style="margin-bottom:8px">${esc(t('playerDetail.h2h'))}</div>
        <div class="h2h-section">${h2hRows}</div>
      ` : ''}
    `,
    footerHTML: state.me.role === 'admin' ? `<button class="btn btn--danger" id="modal-delete-player">${esc(t('playerDetail.delete'))}</button>` : ''
  });

  if (state.me.role !== 'admin') return;
  document.getElementById('modal-delete-player').addEventListener('click', () => {
    hideModal();
    const playerMatches = loadMatches().filter(m => m.player1Id === playerId || m.player2Id === playerId);
    const hasMatches = playerMatches.length > 0;
    const msg = hasMatches
      ? t('playerDetail.deleteWithMatches', { n: playerMatches.length, name: player.name })
      : t('playerDetail.deleteConfirm', { name: player.name });
    showConfirmModal(msg, async () => {
      const res = await deletePlayer(playerId, hasMatches);
      if (!res.ok) {
        if (res.status === 409) {
          showConfirmModal(t('playerDetail.deleteNowWithMatches', { name: player.name }), async () => {
            const res2 = await deletePlayer(playerId, true);
            if (!res2.ok) { showToast(res2.error, 'error'); return; }
            showToast(t('playerDetail.deletedWithMatches', { name: player.name }), 'success');
            renderPlayers();
            if (state.currentTab === 'home') renderHome();
            if (state.currentTab === 'history') renderHistory();
          });
          return;
        }
        showToast(res.error, 'error');
        return;
      }
      showToast(hasMatches ? t('playerDetail.deletedWithMatches', { name: player.name }) : t('playerDetail.deleted', { name: player.name }), 'success');
      renderPlayers();
      if (state.currentTab === 'home') renderHome();
      if (state.currentTab === 'history') renderHistory();
    });
  });
}

// ─── RENDER: HISTORY ────────────────────────────────────────────────────────

async function renderHistory() {
  const sel = document.getElementById('history-filter-select');
  populateFilter(sel, state.historyFilter, t('history.allPlayers'));

  const el = document.getElementById('history-list');

  let matches;
  if (state.historyFilter) {
    try {
      matches = await apiFetch(`/api/matches?player=${encodeURIComponent(state.historyFilter)}`);
    } catch(e) {
      showToast(t('history.errorLoad'), 'error');
      matches = [];
    }
  } else {
    matches = loadMatches();
  }

  if (matches.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📋</div>
        <div class="empty-state__title">${esc(t('history.noMatchesTitle'))}</div>
        <div class="empty-state__text">${esc(state.historyFilter ? t('history.noMatchesFiltered') : t('history.noMatchesAll'))}</div>
      </div>
    `;
    return;
  }

  el.innerHTML = '';
  const { dateGroup } = await import('./helpers.js');
  const groups = new Map();
  for (const m of matches) {
    const key = dateGroup(m.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  for (const [label, grpMatches] of groups) {
    const hdr = document.createElement('div');
    hdr.className = 'date-group__header';
    hdr.textContent = label;
    el.appendChild(hdr);
    grpMatches.forEach(m => el.appendChild(createMatchCard(m, {
      onDeleteDone: () => {
        if (state.currentTab === 'history') renderHistory();
        else renderHome();
      },
      onEdit: (match) => showEditMatchModal(match, () => renderHistory()),
      onDetail: (match) => showMatchDetailModal(match),
    })));
  }
}

// ─── RENDER: STATS ──────────────────────────────────────────────────────────

function renderStats() {
  const sel = document.getElementById('stats-filter-select');
  populateFilter(sel, state.statsFilter, t('stats.leaderboard'));

  if (state.statsFilter) {
    document.getElementById('leaderboard-container').innerHTML = '';
    renderPlayerStats(state.statsFilter);
  } else {
    renderLeaderboard();
    document.getElementById('player-stats-container').innerHTML = '';
  }
}

function renderLeaderboard() {
  const el = document.getElementById('leaderboard-container');
  const lb = getLeaderboard(loadPlayers(), loadMatches());

  if (lb.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🏆</div>
        <div class="empty-state__title">${esc(t('stats.noPlayersTitle'))}</div>
        <div class="empty-state__text">${esc(t('stats.noPlayersText'))}</div>
      </div>
    `;
    return;
  }

  const rankClass = ['leaderboard__rank--gold','leaderboard__rank--silver','leaderboard__rank--bronze'];
  let html = `<div class="leaderboard">`;
  lb.forEach(({ player, stats }, i) => {
    html += `
      <div class="leaderboard__row" data-pid="${esc(player.id)}">
        <span class="leaderboard__rank ${rankClass[i]||''}">${i+1}</span>
        <span class="leaderboard__name">${esc(player.name)}</span>
        <span class="leaderboard__record">${stats.wins}W ${stats.losses}L</span>
        <span class="leaderboard__winrate">${stats.winRate}%</span>
      </div>
    `;
  });
  html += `</div>`;
  el.innerHTML = html;

  el.querySelectorAll('.leaderboard__row').forEach(row => {
    row.addEventListener('click', () => {
      state.statsFilter = row.dataset.pid;
      const sel = document.getElementById('stats-filter-select');
      sel.value = state.statsFilter;
      renderStats();
    });
  });
}

function renderPlayerStats(playerId) {
  const el = document.getElementById('player-stats-container');
  const player = getPlayerById(playerId);
  if (!player) { el.innerHTML = ''; return; }

  const matches = loadMatches();
  const stats = computeStats(playerId, matches);

  const formBadges = stats.recentForm.map(f =>
    `<span class="form-badge form-badge--${f==='W'?'win':f==='L'?'loss':'draw'}">${f}</span>`
  ).join('');

  let streakHTML = '';
  if (stats.streak !== 0) {
    const w = stats.streak > 0;
    const streakKey = w ? 'playerDetail.winStreak' : 'playerDetail.lossStreak';
    streakHTML = `<div style="margin-bottom:12px"><span class="streak-badge streak-badge--${w?'win':'loss'}">
      ${w?'🔥':'❄️'} ${esc(t(streakKey, { n: Math.abs(stats.streak) }))}
    </span></div>`;
  }

  const opponents = loadPlayers().filter(p => p.id !== playerId);
  const h2hRows = opponents.map(opp => {
    const h = computeH2H(playerId, opp.id, matches);
    if (h.total === 0) return '';
    return `<div class="h2h-row">
      <span class="h2h-row__name">${esc(opp.name)}</span>
      <span class="h2h-row__record">${h.p1Wins}W \u2013 ${h.p2Wins}L</span>
    </div>`;
  }).filter(Boolean).join('');

  el.innerHTML = `
    <div class="section__header">
      <span class="section__title">${esc(t('stats.playerStats', { name: player.name }))}</span>
      <button class="section__action" id="stats-back">${esc(t('stats.back'))}</button>
    </div>
    ${streakHTML}
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card__value">${stats.winRate}%</div><div class="stat-card__label">${esc(t('playerDetail.winRate'))}</div></div>
      <div class="stat-card"><div class="stat-card__value">${stats.wins}\u2013${stats.losses}</div><div class="stat-card__label">${esc(t('playerDetail.wl'))}</div></div>
      <div class="stat-card"><div class="stat-card__value">${stats.setsWon}</div><div class="stat-card__label">${esc(t('playerDetail.setsWon'))}</div></div>
      <div class="stat-card"><div class="stat-card__value">${stats.pointsWon}</div><div class="stat-card__label">${esc(t('playerDetail.pointsWon'))}</div></div>
    </div>
    ${formBadges ? `
      <div class="section__title" style="margin-bottom:8px">${esc(t('playerDetail.recentForm'))}</div>
      <div class="form-badges" style="margin-bottom:16px">${formBadges}</div>
    ` : ''}
    ${h2hRows ? `
      <div class="section__title" style="margin-bottom:8px">${esc(t('playerDetail.h2h'))}</div>
      <div class="h2h-section" style="margin-bottom:16px">${h2hRows}</div>
    ` : ''}
  `;

  document.getElementById('stats-back').addEventListener('click', () => {
    state.statsFilter = '';
    document.getElementById('stats-filter-select').value = '';
    renderStats();
  });
}

// ─── RENDER: EDIT MATCH MODAL ──────────────────────────────────────────────

function showEditMatchModal(match, onSaved) {
  const p1 = getPlayerById(match.player1Id);
  const p2 = getPlayerById(match.player2Id);
  const locations = loadLocations();

  const setsHTML = match.sets.map((s, i) => `
    <div class="set-row">
      <span class="set-row__label">S${i+1}</span>
      <input class="set-row__score" type="number" inputmode="numeric" min="0" max="99"
             value="${s.p1}" data-idx="${i}" data-pl="p1">
      <span class="set-row__sep">\u2013</span>
      <input class="set-row__score" type="number" inputmode="numeric" min="0" max="99"
             value="${s.p2}" data-idx="${i}" data-pl="p2">
    </div>
  `).join('');

  const locationOpts = locations.map(l =>
    `<option value="${esc(l.id)}" ${match.locationId === l.id ? 'selected' : ''}>${esc(l.name)}</option>`
  ).join('');

  showModal({
    title: t('match.edit'),
    bodyHTML: `
      <div style="margin-bottom:12px;color:var(--text-muted);font-size:14px">
        ${esc(p1?.name || 'Unknown')} vs ${esc(p2?.name || 'Unknown')}
      </div>
      <div class="form-group">
        <label class="form-label">${esc(t('match.sets'))}</label>
        <div id="edit-sets-container">${setsHTML}</div>
      </div>
      <div class="form-group">
        <label class="form-label" for="edit-match-note">${esc(t('match.noteLabel'))}</label>
        <input type="text" class="form-input" id="edit-match-note" value="${esc(match.note)}" maxlength="500"
               placeholder="${esc(t('match.notePlaceholder'))}">
      </div>
      <div class="form-group">
        <label class="form-label" for="edit-match-location">${esc(t('match.locationLabel'))}</label>
        <select class="form-input" id="edit-match-location">
          <option value="">${esc(t('match.noLocation'))}</option>
          ${locationOpts}
        </select>
      </div>
    `,
    footerHTML: `<button class="btn btn--primary" id="edit-match-save">${esc(t('match.editSave'))}</button>`
  });

  document.getElementById('edit-match-save').addEventListener('click', async () => {
    const btn = document.getElementById('edit-match-save');
    const container = document.getElementById('edit-sets-container');
    const inputs = container.querySelectorAll('.set-row__score');
    const sets = [];
    for (let i = 0; i < inputs.length; i += 2) {
      sets.push({ p1: Number(inputs[i].value) || 0, p2: Number(inputs[i+1].value) || 0 });
    }

    // Basic validation
    for (let i = 0; i < sets.length; i++) {
      if (sets[i].p1 === sets[i].p2) {
        showToast(t('match.errorSetDraw', { n: i + 1 }), 'error');
        return;
      }
    }

    btn.disabled = true;
    btn.textContent = t('match.editSaving');

    try {
      await updateMatch(match.id, {
        sets,
        note: document.getElementById('edit-match-note').value,
        locationId: document.getElementById('edit-match-location').value || null,
      });
      hideModal();
      showToast(t('match.editSaved'), 'success');
      if (onSaved) onSaved();
    } catch(e) {
      showToast(e.message || t('match.editError'), 'error');
      btn.disabled = false;
      btn.textContent = t('match.editSave');
    }
  });
}

// ─── RENDER: MATCH DETAIL MODAL (with comments) ───────────────────────────

function showMatchDetailModal(match) {
  const p1 = getPlayerById(match.player1Id);
  const p2 = getPlayerById(match.player2Id);
  const { p1: s1, p2: s2 } = countSetWins(match.sets || []);
  const { formatSets, relativeTime } = _helperCache;
  const location = match.locationId ? loadLocations().find(l => l.id === match.locationId) : null;

  showModal({
    title: `${p1?.name || 'Unknown'} vs ${p2?.name || 'Unknown'}`,
    bodyHTML: `
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-size:24px;font-weight:700">${s1}\u2013${s2}</div>
        <div style="font-size:13px;color:var(--text-muted)">${formatSets(match.sets)}</div>
        ${match.note ? `<div style="font-size:13px;color:var(--text-muted);margin-top:4px">${esc(match.note)}</div>` : ''}
        ${location ? `<div style="font-size:13px;color:var(--text-muted);margin-top:4px">&#x1F4CD; ${esc(location.name)}</div>` : ''}
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${relativeTime(match.date)}</div>
      </div>
      <div class="section__title" style="margin-bottom:8px">${esc(t('comments.title'))}</div>
      <div id="comments-list" style="margin-bottom:12px"><div style="color:var(--text-muted);font-size:13px">${esc(t('comments.empty'))}</div></div>
      <div style="display:flex;gap:8px">
        <input type="text" class="form-input" id="comment-input" placeholder="${esc(t('comments.placeholder'))}" maxlength="500" style="flex:1;margin-bottom:0">
        <button class="btn btn--primary" id="comment-send" style="white-space:nowrap">${esc(t('comments.send'))}</button>
      </div>
    `,
    footerHTML: ''
  });

  loadAndRenderComments(match.id);

  document.getElementById('comment-send').addEventListener('click', () => submitComment(match.id));
  document.getElementById('comment-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitComment(match.id);
  });
}

async function loadAndRenderComments(matchId) {
  const listEl = document.getElementById('comments-list');
  if (!listEl) return;
  try {
    const comments = await getComments(matchId);
    if (comments.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-muted);font-size:13px">${esc(t('comments.empty'))}</div>`;
      return;
    }
    const { relativeTime } = _helperCache;
    listEl.innerHTML = '';
    comments.forEach(c => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      item.innerHTML = `
        <div class="comment-item__header">
          <span class="comment-item__user">${esc(c.username)}</span>
          <span class="comment-item__time">${relativeTime(c.createdAt)}</span>
        </div>
        <div class="comment-item__text">${esc(c.text)}</div>
      `;
      if (state.me.role === 'admin') {
        const delBtn = document.createElement('button');
        delBtn.className = 'comment-item__delete';
        delBtn.textContent = '\u00D7';
        delBtn.addEventListener('click', async () => {
          try {
            await deleteComment(c.id);
            showToast(t('comments.deleted'), 'success');
            loadAndRenderComments(matchId);
          } catch(e) {
            showToast(t('comments.deleteError'), 'error');
          }
        });
        item.querySelector('.comment-item__header').appendChild(delBtn);
      }
      listEl.appendChild(item);
    });
  } catch(e) {
    listEl.innerHTML = '';
  }
}

async function submitComment(matchId) {
  const input = document.getElementById('comment-input');
  const btn = document.getElementById('comment-send');
  const text = input?.value.trim();
  if (!text) return;

  btn.disabled = true;
  btn.textContent = t('comments.sending');
  try {
    await addComment(matchId, text);
    input.value = '';
    loadAndRenderComments(matchId);
  } catch(e) {
    showToast(e.message || t('comments.addError'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('comments.send');
  }
}

// Cache for helper functions needed in detail modal
const _helperCache = {};
import('./helpers.js').then(m => {
  _helperCache.formatSets = m.formatSets;
  _helperCache.relativeTime = m.relativeTime;
});

export {
  setRenderFns,
  renderHome, renderNewMatchTab, renderPlayers, renderHistory, renderStats,
  showAddPlayerModal, showPlayerDetailModal,
  showEditMatchModal, showMatchDetailModal,
  populatePlayerSelects, renderSetRows, updateResultPreview, submitMatch
};
