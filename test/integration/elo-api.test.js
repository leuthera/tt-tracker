'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startDbService, startServer, login, kill } = require('../helpers/setup');

describe('ELO API', () => {
  let db, server, cookie;
  let p1, p2;

  before(async () => {
    db = await startDbService();
    server = await startServer(db.url);
    cookie = await login(server.url);

    // Create two players
    const r1 = await fetch(`${server.url}/api/players`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EloP1' }),
    });
    p1 = await r1.json();

    const r2 = await fetch(`${server.url}/api/players`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EloP2' }),
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

  it('GET /api/players/:id/elo-history — empty initially', async () => {
    const res = await api(`/api/players/${p1.id}/elo-history`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 0);
  });

  it('after match create — ELO history entries exist', async () => {
    // Create a match
    await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 5 }, { p1: 11, p2: 7 }],
      }),
    });

    // Small delay for async recalculation
    await new Promise(r => setTimeout(r, 500));

    const res = await api(`/api/players/${p1.id}/elo-history`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.length >= 1, 'Should have at least 1 elo history entry');
    assert.equal(body[0].playerId, p1.id);
    assert.equal(body[0].ratingBefore, 1200);
    assert.ok(body[0].ratingAfter > 1200, 'Winner rating should increase');
  });

  it('after match create — player ratings updated', async () => {
    const res = await api('/api/players');
    const players = await res.json();
    const eloP1 = players.find(p => p.id === p1.id);
    const eloP2 = players.find(p => p.id === p2.id);
    assert.ok(eloP1.eloRating > 1200, 'Winner should have rating > 1200');
    assert.ok(eloP2.eloRating < 1200, 'Loser should have rating < 1200');
  });

  it('after match delete — ELO recalculated', async () => {
    // Create a match
    const createRes = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 5, p2: 11 }, { p1: 7, p2: 11 }],
      }),
    });
    const match = await createRes.json();

    await new Promise(r => setTimeout(r, 500));

    // Get ratings before delete
    const beforeRes = await api('/api/players');
    const beforePlayers = await beforeRes.json();
    const p1Before = beforePlayers.find(p => p.id === p1.id).eloRating;

    // Delete the match
    await api(`/api/matches/${match.id}`, { method: 'DELETE' });

    await new Promise(r => setTimeout(r, 500));

    // Get ratings after delete
    const afterRes = await api('/api/players');
    const afterPlayers = await afterRes.json();
    const p1After = afterPlayers.find(p => p.id === p1.id).eloRating;

    // Rating should have changed (recalculated without the deleted match)
    assert.notEqual(p1Before, p1After, 'Rating should change after match deletion');
  });

  it('draw match — no ELO history entries for that match', async () => {
    // Get current history count
    const beforeRes = await api(`/api/players/${p1.id}/elo-history`);
    const beforeHistory = await beforeRes.json();
    const beforeCount = beforeHistory.length;

    // Create a draw match (1-1 in sets)
    await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 5 }, { p1: 5, p2: 11 }],
      }),
    });

    await new Promise(r => setTimeout(r, 500));

    // History should not have new entries for the draw
    const afterRes = await api(`/api/players/${p1.id}/elo-history`);
    const afterHistory = await afterRes.json();
    assert.equal(afterHistory.length, beforeCount, 'Draw should not create ELO history entries');
  });

  it('after match edit — ELO recalculated', async () => {
    // Create a match where p1 wins
    const createRes = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 5 }, { p1: 11, p2: 7 }],
      }),
    });
    const match = await createRes.json();
    assert.equal(match.winnerId, p1.id);

    await new Promise(r => setTimeout(r, 500));

    // Get ratings before edit
    const beforeRes = await api('/api/players');
    const beforePlayers = await beforeRes.json();
    const p1Before = beforePlayers.find(p => p.id === p1.id).eloRating;

    // Edit match so p2 wins instead
    await apiJson(`/api/matches/${match.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        sets: [{ p1: 5, p2: 11 }, { p1: 7, p2: 11 }],
      }),
    });

    await new Promise(r => setTimeout(r, 500));

    // Get ratings after edit
    const afterRes = await api('/api/players');
    const afterPlayers = await afterRes.json();
    const p1After = afterPlayers.find(p => p.id === p1.id).eloRating;

    // p1 was gaining from a win, now should have less rating since that match was changed to a loss
    assert.ok(p1After < p1Before, 'Rating should decrease after match edit reverses winner');
  });
});
