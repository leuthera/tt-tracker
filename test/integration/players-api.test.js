'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startDbService, startServer, login, createUser, kill } = require('../helpers/setup');

describe('players API', () => {
  let db, server, cookie, userCookie;

  before(async () => {
    db = await startDbService();
    server = await startServer(db.url);
    cookie = await login(server.url);
    // Create a regular user
    await createUser(server.url, cookie, { username: 'player_tester', password: 'testpass123', role: 'user' });
    userCookie = await login(server.url, 'player_tester', 'testpass123');
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

  it('GET /api/players returns auto-created players', async () => {
    const res = await api('/api/players');
    assert.equal(res.status, 200);
    const body = await res.json();
    const names = body.map(p => p.name);
    assert.ok(names.includes('admin'), 'bootstrap admin should auto-create a player');
    assert.ok(names.includes('player_tester'), 'creating a user should auto-create a player');
  });

  it('POST /api/players creates a player', async () => {
    const res = await apiJson('/api/players', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'Alice');
    assert.ok(body.id);
    assert.ok(body.createdAt);
  });

  it('rejects empty name', async () => {
    const res = await apiJson('/api/players', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    });
    assert.equal(res.status, 400);
  });

  it('rejects too-long name', async () => {
    const res = await apiJson('/api/players', {
      method: 'POST',
      body: JSON.stringify({ name: 'A'.repeat(31) }),
    });
    assert.equal(res.status, 400);
  });

  it('rejects duplicate name', async () => {
    const res = await apiJson('/api/players', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('already exists'));
  });

  it('DELETE player with no matches succeeds', async () => {
    // Create a player to delete
    const createRes = await apiJson('/api/players', {
      method: 'POST',
      body: JSON.stringify({ name: 'Deletable' }),
    });
    const player = await createRes.json();

    const res = await api(`/api/players/${player.id}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
  });

  it('DELETE player with matches returns 409', async () => {
    // Create two players and a match
    const r1 = await apiJson('/api/players', {
      method: 'POST', body: JSON.stringify({ name: 'P1ForDel' }),
    });
    const p1 = await r1.json();

    const r2 = await apiJson('/api/players', {
      method: 'POST', body: JSON.stringify({ name: 'P2ForDel' }),
    });
    const p2 = await r2.json();

    await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 5 }],
      }),
    });

    const res = await api(`/api/players/${p1.id}`, { method: 'DELETE' });
    assert.equal(res.status, 409);
  });

  it('DELETE player with ?force=true cascade-deletes', async () => {
    // Use the players from the previous test — find P1ForDel
    const listRes = await api('/api/players');
    const players = await listRes.json();
    const p1 = players.find(p => p.name === 'P1ForDel');

    const res = await api(`/api/players/${p1.id}?force=true`, { method: 'DELETE' });
    assert.equal(res.status, 200);
  });

  it('non-admin gets 403 on DELETE player', async () => {
    // Create a player to attempt delete
    const createRes = await apiJson('/api/players', {
      method: 'POST',
      body: JSON.stringify({ name: 'NoDeleteForUser' }),
    });
    const player = await createRes.json();

    const res = await fetch(`${server.url}/api/players/${player.id}`, {
      method: 'DELETE',
      headers: { Cookie: userCookie },
    });
    assert.equal(res.status, 403);
  });
});
