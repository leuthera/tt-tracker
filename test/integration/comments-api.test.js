'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startDbService, startServer, login, createUser, kill } = require('../helpers/setup');

describe('comments API', () => {
  let db, server, cookie, userCookie;
  let p1, p2, matchId;

  before(async () => {
    db = await startDbService();
    server = await startServer(db.url);
    cookie = await login(server.url);
    await createUser(server.url, cookie, { username: 'commenter', password: 'testpass123', role: 'user' });
    userCookie = await login(server.url, 'commenter', 'testpass123');

    // Create two players and a match
    const r1 = await apiJson('/api/players', {
      method: 'POST', body: JSON.stringify({ name: 'ComP1' }),
    });
    p1 = await r1.json();

    const r2 = await apiJson('/api/players', {
      method: 'POST', body: JSON.stringify({ name: 'ComP2' }),
    });
    p2 = await r2.json();

    const mr = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 5 }],
      }),
    });
    const match = await mr.json();
    matchId = match.id;
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

  function userApi(path, opts = {}) {
    return fetch(`${server.url}${path}`, {
      ...opts,
      headers: { Cookie: userCookie, 'Content-Type': 'application/json', ...opts.headers },
    });
  }

  // ── List empty ──────────────────────────────────────────────────────────────
  it('GET /api/matches/:id/comments returns empty list initially', async () => {
    const res = await api(`/api/matches/${matchId}/comments`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, []);
  });

  // ── Create ──────────────────────────────────────────────────────────────────
  it('POST /api/matches/:id/comments — admin can add comment', async () => {
    const res = await apiJson(`/api/matches/${matchId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Great match!' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.text, 'Great match!');
    assert.equal(body.username, 'admin');
    assert.ok(body.id);
    assert.equal(body.matchId, matchId);
  });

  it('POST /api/matches/:id/comments — regular user can add comment', async () => {
    const res = await userApi(`/api/matches/${matchId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Nice one!' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.text, 'Nice one!');
    assert.equal(body.username, 'commenter');
  });

  // ── Validation ──────────────────────────────────────────────────────────────
  it('rejects empty comment text', async () => {
    const res = await apiJson(`/api/matches/${matchId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text: '' }),
    });
    assert.equal(res.status, 400);
  });

  it('rejects whitespace-only comment text', async () => {
    const res = await apiJson(`/api/matches/${matchId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text: '   ' }),
    });
    assert.equal(res.status, 400);
  });

  it('rejects comment longer than 500 chars', async () => {
    const res = await apiJson(`/api/matches/${matchId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text: 'x'.repeat(501) }),
    });
    assert.equal(res.status, 400);
  });

  it('returns 404 for comment on non-existent match', async () => {
    const res = await apiJson('/api/matches/m_nonexistent/comments', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' }),
    });
    assert.equal(res.status, 404);
  });

  // ── List ────────────────────────────────────────────────────────────────────
  it('GET /api/matches/:id/comments returns comments ordered by created_at ASC', async () => {
    const res = await api(`/api/matches/${matchId}/comments`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.length >= 2);
    // Check ascending order
    for (let i = 1; i < body.length; i++) {
      assert.ok(body[i].createdAt >= body[i - 1].createdAt);
    }
  });

  // ── Delete ──────────────────────────────────────────────────────────────────
  it('DELETE /api/comments/:id — admin can delete any comment', async () => {
    // Get comments to find one to delete
    const listRes = await api(`/api/matches/${matchId}/comments`);
    const comments = await listRes.json();
    const commentId = comments[0].id;

    const res = await api(`/api/comments/${commentId}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
  });

  it('DELETE /api/comments/:id — non-admin gets 403', async () => {
    // Get remaining comments
    const listRes = await api(`/api/matches/${matchId}/comments`);
    const comments = await listRes.json();
    assert.ok(comments.length > 0, 'should have at least one comment left');
    const commentId = comments[0].id;

    const res = await fetch(`${server.url}/api/comments/${commentId}`, {
      method: 'DELETE',
      headers: { Cookie: userCookie },
    });
    assert.equal(res.status, 403);
  });

  it('DELETE /api/comments/:id — returns 404 for non-existent comment', async () => {
    const res = await api('/api/comments/c_nonexistent', { method: 'DELETE' });
    assert.equal(res.status, 404);
  });

  // ── Cascade delete ────────────────────────────────────────────────────────
  it('deleting a match also deletes its comments', async () => {
    // Create a new match with comments
    const mr = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 5 }],
      }),
    });
    const match = await mr.json();

    await apiJson(`/api/matches/${match.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Will be deleted' }),
    });

    // Delete the match
    await api(`/api/matches/${match.id}`, { method: 'DELETE' });

    // Comments should be gone
    const res = await api(`/api/matches/${match.id}/comments`);
    const body = await res.json();
    assert.deepEqual(body, []);
  });
});
