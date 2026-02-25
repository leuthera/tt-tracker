'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startDbService, startServer, login, createUser, kill } = require('../helpers/setup');

describe('matches API', () => {
  let db, server, cookie, userCookie;
  let p1, p2;

  before(async () => {
    db = await startDbService();
    server = await startServer(db.url);
    cookie = await login(server.url);
    // Create a regular user
    await createUser(server.url, cookie, { username: 'match_tester', password: 'testpass123', role: 'user' });
    userCookie = await login(server.url, 'match_tester', 'testpass123');

    // Create two players for match tests
    const r1 = await apiJson('/api/players', {
      method: 'POST', body: JSON.stringify({ name: 'MatchP1' }),
    });
    p1 = await r1.json();

    const r2 = await apiJson('/api/players', {
      method: 'POST', body: JSON.stringify({ name: 'MatchP2' }),
    });
    p2 = await r2.json();
  });

  after(() => {
    kill(server?.proc);
    kill(db?.proc);
  });

  function api(path, opts = {}) {
    return fetch(`${server.url}${path}`, {
      ...opts,
      headers: { Cookie: cookie, ...opts.headers },
    });
  }

  function apiJson(path, opts = {}) {
    return api(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts.headers },
    });
  }

  // ── Create matches ──────────────────────────────────────────────────────────
  it('POST /api/matches with valid data succeeds', async () => {
    const res = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 5 }, { p1: 11, p2: 7 }],
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.player1Id, p1.id);
    assert.equal(body.player2Id, p2.id);
    assert.equal(body.winnerId, p1.id); // p1 won both sets
  });

  it('determines p2 as winner correctly', async () => {
    const res = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 5, p2: 11 }, { p1: 7, p2: 11 }],
      }),
    });
    const body = await res.json();
    assert.equal(body.winnerId, p2.id);
  });

  it('determines draw (null winner) correctly', async () => {
    const res = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 5 }, { p1: 5, p2: 11 }],
      }),
    });
    const body = await res.json();
    assert.equal(body.winnerId, null);
  });

  // ── Validation ──────────────────────────────────────────────────────────────
  it('rejects missing players', async () => {
    const res = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({ sets: [{ p1: 11, p2: 5 }] }),
    });
    assert.equal(res.status, 400);
  });

  it('rejects same player on both sides', async () => {
    const res = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p1.id,
        sets: [{ p1: 11, p2: 5 }],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('different'));
  });

  it('rejects non-existent player', async () => {
    const res = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: 'p_nonexistent',
        sets: [{ p1: 11, p2: 5 }],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('not found'));
  });

  it('rejects empty sets', async () => {
    const res = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [],
      }),
    });
    assert.equal(res.status, 400);
  });

  it('rejects more than 9 sets', async () => {
    const sets = Array.from({ length: 10 }, () => ({ p1: 11, p2: 5 }));
    const res = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id, sets,
      }),
    });
    assert.equal(res.status, 400);
  });

  it('rejects equal scores in a set', async () => {
    const res = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 11 }],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('different'));
  });

  it('rejects out-of-range scores', async () => {
    const res = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 100, p2: 5 }],
      }),
    });
    assert.equal(res.status, 400);
  });

  // ── List & filter ──────────────────────────────────────────────────────────
  it('GET /api/matches returns matches ordered by date DESC', async () => {
    const res = await api('/api/matches');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.length >= 3); // we created 3 matches above
    // Check descending date order
    for (let i = 1; i < body.length; i++) {
      assert.ok(body[i - 1].date >= body[i].date);
    }
  });

  it('GET /api/matches?player= filters correctly', async () => {
    // Create a 3rd player with their own match to test filtering
    const r3 = await apiJson('/api/players', {
      method: 'POST', body: JSON.stringify({ name: 'MatchP3' }),
    });
    const p3 = await r3.json();

    await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p3.id,
        sets: [{ p1: 11, p2: 5 }],
      }),
    });

    const res = await api(`/api/matches?player=${p3.id}`);
    const body = await res.json();
    assert.ok(body.length >= 1);
    assert.ok(body.every(m => m.player1Id === p3.id || m.player2Id === p3.id));
  });

  // ── Delete ──────────────────────────────────────────────────────────────────
  it('DELETE /api/matches/:id deletes a match', async () => {
    // Create a match to delete
    const createRes = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 5 }],
      }),
    });
    const match = await createRes.json();

    const res = await api(`/api/matches/${match.id}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
  });

  it('non-admin gets 403 on DELETE match', async () => {
    // Create a match
    const createRes = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 5 }],
      }),
    });
    const match = await createRes.json();

    const res = await fetch(`${server.url}/api/matches/${match.id}`, {
      method: 'DELETE',
      headers: { Cookie: userCookie },
    });
    assert.equal(res.status, 403);
  });

  it('non-admin can still create matches', async () => {
    // Use userCookie to create a match
    const res = await fetch(`${server.url}/api/matches`, {
      method: 'POST',
      headers: { Cookie: userCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 5 }],
      }),
    });
    assert.equal(res.status, 200);
  });
});
