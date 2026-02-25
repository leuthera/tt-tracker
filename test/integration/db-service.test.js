'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startDbService, kill } = require('../helpers/setup');

describe('db-service', () => {
  let db;

  before(async () => {
    db = await startDbService();
  });

  after(() => kill(db?.proc));

  // ── Health ──────────────────────────────────────────────────────────────────
  it('GET /healthz returns ok', async () => {
    const res = await fetch(`${db.url}/healthz`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });

  // ── Players CRUD ────────────────────────────────────────────────────────────
  describe('players', () => {
    let playerId;

    it('GET /players returns empty array initially', async () => {
      const res = await fetch(`${db.url}/players`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.deepEqual(body, []);
    });

    it('POST /players creates a player', async () => {
      const res = await fetch(`${db.url}/players`, {
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
      const res = await fetch(`${db.url}/players/${playerId}`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.id, playerId);
    });

    it('GET /players/:id returns 404 for non-existent', async () => {
      const res = await fetch(`${db.url}/players/no_such_id`);
      assert.equal(res.status, 404);
    });

    it('POST /players rejects duplicate name (409)', async () => {
      const res = await fetch(`${db.url}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' }),
      });
      assert.equal(res.status, 409);
    });

    it('DELETE /players/:id deletes a player with no matches', async () => {
      // Create a throwaway player to delete
      const createRes = await fetch(`${db.url}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ToDelete' }),
      });
      const created = await createRes.json();

      const res = await fetch(`${db.url}/players/${created.id}`, { method: 'DELETE' });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
    });
  });

  // ── Matches CRUD ────────────────────────────────────────────────────────────
  describe('matches', () => {
    let p1Id, p2Id, matchId;

    before(async () => {
      // Ensure we have two players
      const r1 = await fetch(`${db.url}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Player1' }),
      });
      p1Id = (await r1.json()).id;

      const r2 = await fetch(`${db.url}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Player2' }),
      });
      p2Id = (await r2.json()).id;
    });

    it('POST /matches creates a match', async () => {
      const res = await fetch(`${db.url}/matches`, {
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
      const res = await fetch(`${db.url}/matches`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.length >= 1);
    });

    it('GET /matches?player= filters by player', async () => {
      const res = await fetch(`${db.url}/matches?player=${p1Id}`);
      const body = await res.json();
      assert.ok(body.length >= 1);
      assert.ok(body.every(m => m.player1_id === p1Id || m.player2_id === p1Id));
    });

    it('GET /matches/:id returns a match', async () => {
      const res = await fetch(`${db.url}/matches/${matchId}`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.id, matchId);
    });

    it('GET /matches/:id returns 404 for non-existent', async () => {
      const res = await fetch(`${db.url}/matches/no_such_match`);
      assert.equal(res.status, 404);
    });

    it('DELETE /matches/:id deletes a match', async () => {
      const res = await fetch(`${db.url}/matches/${matchId}`, { method: 'DELETE' });
      assert.equal(res.status, 200);
    });

    it('DELETE /players/:id with matches returns 409', async () => {
      // Create a match first
      await fetch(`${db.url}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: Date.now(),
          player1_id: p1Id, player2_id: p2Id,
          sets: '[{"p1":11,"p2":5}]',
          winner_id: p1Id, note: '',
        }),
      });

      const res = await fetch(`${db.url}/players/${p1Id}`, { method: 'DELETE' });
      assert.equal(res.status, 409);
    });

    it('DELETE /players/:id?force=true cascade-deletes', async () => {
      const res = await fetch(`${db.url}/players/${p1Id}?force=true`, { method: 'DELETE' });
      assert.equal(res.status, 200);

      // Verify matches are gone
      const matchRes = await fetch(`${db.url}/matches?player=${p1Id}`);
      const matches = await matchRes.json();
      assert.equal(matches.length, 0);
    });
  });
});
