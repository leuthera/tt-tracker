// ─── APP STATE & API Layer ──────────────────────────────────────────────────

const state = {
  currentTab: 'home',
  players: [],
  matches: [],
  newMatch: { player1Id: '', player2Id: '', sets: [{p1: 11, p2: 0}], note: '' },
  historyFilter: '',
  statsFilter: '',
  me: { role: 'user', username: '' },
  isOnline: navigator.onLine,
  pendingSync: 0
};

// ─── API HELPERS ────────────────────────────────────────────────────────────

async function apiFetch(url, opts = {}) {
  const headers = opts.headers || {};
  if (opts.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

// ─── DATA LAYER ─────────────────────────────────────────────────────────────

function loadPlayers() { return state.players; }
function loadMatches() { return state.matches; }
function getPlayerById(id) { return state.players.find(p => p.id === id) || null; }

async function refreshAll() {
  [state.players, state.matches] = await Promise.all([
    apiFetch('/api/players'),
    apiFetch('/api/matches')
  ]);
}

async function refreshPlayers() {
  state.players = await apiFetch('/api/players');
}

async function refreshMatches() {
  state.matches = await apiFetch('/api/matches');
}

// ─── PLAYER CRUD ────────────────────────────────────────────────────────────

async function addPlayer(name) {
  try {
    const player = await apiFetch('/api/players', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    await refreshPlayers();
    return { ok: true, player };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function deletePlayer(id, force) {
  try {
    const qs = force ? '?force=true' : '';
    await apiFetch(`/api/players/${id}${qs}`, { method: 'DELETE' });
    await refreshPlayers();
    await refreshMatches();
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message, status: e.status };
  }
}

// ─── MATCH CRUD ─────────────────────────────────────────────────────────────

async function addMatch(data) {
  const match = await apiFetch('/api/matches', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  await refreshMatches();
  return match;
}

async function deleteMatch(id) {
  await apiFetch(`/api/matches/${id}`, { method: 'DELETE' });
  await refreshMatches();
}

export {
  state, apiFetch,
  loadPlayers, loadMatches, getPlayerById,
  refreshAll, refreshPlayers, refreshMatches,
  addPlayer, deletePlayer,
  addMatch, deleteMatch
};
