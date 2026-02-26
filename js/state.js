// ─── APP STATE & API Layer ──────────────────────────────────────────────────

const state = {
  currentTab: 'home',
  players: [],
  matches: [],
  locations: [],
  newMatch: { player1Id: '', player2Id: '', player3Id: '', player4Id: '', isDoubles: false, sets: [{p1: 11, p2: 0}], note: '', locationId: '' },
  historyFilter: '',
  statsFilter: '',
  me: { role: 'user', username: '' },
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
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
  [state.players, state.matches, state.locations] = await Promise.all([
    apiFetch('/api/players'),
    apiFetch('/api/matches'),
    apiFetch('/api/locations')
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
  await Promise.all([refreshMatches(), refreshPlayers()]);
  return match;
}

async function updateMatch(id, data) {
  const match = await apiFetch(`/api/matches/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  await Promise.all([refreshMatches(), refreshPlayers()]);
  return match;
}

async function deleteMatch(id) {
  await apiFetch(`/api/matches/${id}`, { method: 'DELETE' });
  await Promise.all([refreshMatches(), refreshPlayers()]);
}

// ─── COMMENT CRUD ──────────────────────────────────────────────────────────

async function getComments(matchId) {
  return apiFetch(`/api/matches/${matchId}/comments`);
}

async function addComment(matchId, text) {
  return apiFetch(`/api/matches/${matchId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text })
  });
}

async function deleteComment(id) {
  return apiFetch(`/api/comments/${id}`, { method: 'DELETE' });
}

// ─── LOCATION CRUD ─────────────────────────────────────────────────────────

function loadLocations() { return state.locations; }
function getLocationById(id) { return state.locations.find(l => l.id === id) || null; }

async function refreshLocations() {
  state.locations = await apiFetch('/api/locations');
}

async function addLocation({ name, lat, lng }) {
  try {
    const loc = await apiFetch('/api/locations', {
      method: 'POST',
      body: JSON.stringify({ name, lat, lng })
    });
    await refreshLocations();
    return { ok: true, location: loc };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function updateLocation(id, { name, lat, lng }) {
  try {
    const loc = await apiFetch(`/api/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, lat, lng })
    });
    await refreshLocations();
    return { ok: true, location: loc };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function deleteLocation(id, force) {
  try {
    const qs = force ? '?force=true' : '';
    await apiFetch(`/api/locations/${id}${qs}`, { method: 'DELETE' });
    await refreshLocations();
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message, status: e.status };
  }
}

async function uploadLocationImage(id, base64) {
  await apiFetch(`/api/locations/${id}/image`, {
    method: 'POST',
    body: JSON.stringify({ data: base64 })
  });
  await refreshLocations();
}

async function deleteLocationImage(id) {
  await apiFetch(`/api/locations/${id}/image`, { method: 'DELETE' });
  await refreshLocations();
}

// ─── ELO HISTORY ───────────────────────────────────────────────────────────

async function getEloHistory(playerId) {
  return apiFetch(`/api/players/${playerId}/elo-history`);
}

// ─── CLIENT ERROR REPORTING ─────────────────────────────────────────────────

function logClientError({ message, stack, url, line, col }) {
  fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, stack, url, line, col, userAgent: navigator.userAgent }),
  }).catch(() => {});
}

export {
  state, apiFetch,
  loadPlayers, loadMatches, getPlayerById,
  loadLocations, getLocationById,
  refreshAll, refreshPlayers, refreshMatches, refreshLocations,
  addPlayer, deletePlayer,
  addMatch, updateMatch, deleteMatch,
  getComments, addComment, deleteComment,
  getEloHistory,
  addLocation, updateLocation, deleteLocation,
  uploadLocationImage, deleteLocationImage,
  logClientError
};
