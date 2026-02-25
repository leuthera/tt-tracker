'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startDbService, kill, TEST_DB_TOKEN } = require('../helpers/setup');

describe('db-service', () => {
  let db;
  const authHeader = { 'Authorization': `Bearer ${TEST_DB_TOKEN}` };

  before(async () => {
    db = await startDbService();
  });

  after(() => kill(db?.proc));

  function dbFetch(path, opts = {}) {
    return fetch(`${db.url}${path}`, {
      ...opts,
      headers: { ...authHeader, ...opts.headers },
    });
  }

  // ── Health ──────────────────────────────────────────────────────────────────
  it('GET /healthz returns ok (no auth needed)', async () => {
    const res = await fetch(`${db.url}/healthz`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });

  it('rejects requests without auth token', async () => {
    const res = await fetch(`${db.url}/players`);
    assert.equal(res.status, 401);
  });

  // ── Players CRUD ────────────────────────────────────────────────────────────
  describe('players', () => {
    let playerId;

    it('GET /players returns empty array initially', async () => {
      const res = await dbFetch('/players');
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.deepEqual(body, []);
    });

    it('POST /players creates a player', async () => {
      const res = await dbFetch('/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' }),
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.id);
      assert.equal(body.name, 'Alice');
      playerId = body.id;
    });

    it('GET /players/:id returns the player', async () => {
      const res = await dbFetch(`/players/${playerId}`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.id, playerId);
    });

    it('GET /players/:id returns 404 for non-existent', async () => {
      const res = await dbFetch('/players/no_such_id');
      assert.equal(res.status, 404);
    });

    it('POST /players rejects duplicate name (409)', async () => {
      const res = await dbFetch('/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' }),
      });
      assert.equal(res.status, 409);
    });

    it('DELETE /players/:id deletes a player with no matches', async () => {
      const createRes = await dbFetch('/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ToDelete' }),
      });
      const created = await createRes.json();

      const res = await dbFetch(`/players/${created.id}`, { method: 'DELETE' });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
    });
  });

  // ── Matches CRUD ────────────────────────────────────────────────────────────
  describe('matches', () => {
    let p1Id, p2Id, matchId;

    before(async () => {
      const r1 = await dbFetch('/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Player1' }),
      });
      p1Id = (await r1.json()).id;

      const r2 = await dbFetch('/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Player2' }),
      });
      p2Id = (await r2.json()).id;
    });

    it('POST /matches creates a match', async () => {
      const res = await dbFetch('/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: Date.now(),
          player1_id: p1Id, player2_id: p2Id,
          sets: '[{"p1":11,"p2":5}]',
          winner_id: p1Id, note: '',
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.id);
      matchId = body.id;
    });

    it('GET /matches lists matches', async () => {
      const res = await dbFetch('/matches');
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.length >= 1);
    });

    it('GET /matches?player= filters by player', async () => {
      const res = await dbFetch(`/matches?player=${p1Id}`);
      const body = await res.json();
      assert.ok(body.length >= 1);
      assert.ok(body.every(m => m.player1_id === p1Id || m.player2_id === p1Id));
    });

    it('GET /matches/:id returns a match', async () => {
      const res = await dbFetch(`/matches/${matchId}`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.id, matchId);
    });

    it('GET /matches/:id returns 404 for non-existent', async () => {
      const res = await dbFetch('/matches/no_such_match');
      assert.equal(res.status, 404);
    });

    it('DELETE /matches/:id deletes a match', async () => {
      const res = await dbFetch(`/matches/${matchId}`, { method: 'DELETE' });
      assert.equal(res.status, 200);
    });

    it('DELETE /players/:id with matches returns 409', async () => {
      await dbFetch('/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: Date.now(),
          player1_id: p1Id, player2_id: p2Id,
          sets: '[{"p1":11,"p2":5}]',
          winner_id: p1Id, note: '',
        }),
      });

      const res = await dbFetch(`/players/${p1Id}`, { method: 'DELETE' });
      assert.equal(res.status, 409);
    });

    it('DELETE /players/:id?force=true cascade-deletes', async () => {
      const res = await dbFetch(`/players/${p1Id}?force=true`, { method: 'DELETE' });
      assert.equal(res.status, 200);

      const matchRes = await dbFetch(`/matches?player=${p1Id}`);
      const matches = await matchRes.json();
      assert.equal(matches.length, 0);
    });
  });

  // ── Users CRUD ─────────────────────────────────────────────────────────────
  describe('users', () => {
    let userId;

    it('GET /users/count returns 0 initially', async () => {
      const res = await dbFetch('/users/count');
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.count, 0);
    });

    it('POST /users creates a user', async () => {
      const res = await dbFetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testadmin', password: 'hashed:pw', role: 'admin' }),
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.id);
      assert.equal(body.username, 'testadmin');
      assert.equal(body.role, 'admin');
      assert.ok(!body.password, 'password should not be in response');
      userId = body.id;
    });

    it('GET /users lists users (without password)', async () => {
      const res = await dbFetch('/users');
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.length >= 1);
      assert.ok(!body[0].password, 'password should not be in list');
    });

    it('GET /users/by-username/:username returns user (with password for auth)', async () => {
      const res = await dbFetch('/users/by-username/testadmin');
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.username, 'testadmin');
      assert.ok(body.password, 'by-username should include password for auth');
    });

    it('GET /users/by-username/:username is case-insensitive', async () => {
      const res = await dbFetch('/users/by-username/TestAdmin');
      assert.equal(res.status, 200);
    });

    it('GET /users/by-username/:username returns 404 for non-existent', async () => {
      const res = await dbFetch('/users/by-username/nobody');
      assert.equal(res.status, 404);
    });

    it('POST /users rejects duplicate username (409)', async () => {
      const res = await dbFetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testadmin', password: 'hash2', role: 'user' }),
      });
      assert.equal(res.status, 409);
    });

    it('GET /users/count returns 1', async () => {
      const res = await dbFetch('/users/count');
      const body = await res.json();
      assert.equal(body.count, 1);
    });

    it('PUT /users/:id/password updates password', async () => {
      const res = await dbFetch(`/users/${userId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'newhash:pw' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);

      // Verify password changed
      const userRes = await dbFetch(`/users/by-username/testadmin`);
      const user = await userRes.json();
      assert.equal(user.password, 'newhash:pw');
    });

    it('DELETE /users/:id deletes a user', async () => {
      // Create a user to delete
      const createRes = await dbFetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'todelete', password: 'hash', role: 'user' }),
      });
      const created = await createRes.json();

      const res = await dbFetch(`/users/${created.id}`, { method: 'DELETE' });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);

      // Verify deleted
      const lookupRes = await dbFetch(`/users/by-username/todelete`);
      assert.equal(lookupRes.status, 404);
    });

    it('DELETE /users/:id returns 404 for non-existent', async () => {
      const res = await dbFetch('/users/no_such_id', { method: 'DELETE' });
      assert.equal(res.status, 404);
    });
  });
});
