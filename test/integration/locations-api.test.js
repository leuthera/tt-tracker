'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startDbService, startServer, login, createUser, kill } = require('../helpers/setup');

describe('locations API', () => {
  let db, server, cookie, userCookie;

  before(async () => {
    db = await startDbService();
    server = await startServer(db.url);
    cookie = await login(server.url);
    await createUser(server.url, cookie, { username: 'loc_tester', password: 'testpass123', role: 'user' });
    userCookie = await login(server.url, 'loc_tester', 'testpass123');
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

  it('GET /api/locations returns empty array initially', async () => {
    const res = await api('/api/locations');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, []);
  });

  it('POST /api/locations creates a location (name only)', async () => {
    const res = await apiJson('/api/locations', {
      method: 'POST',
      body: JSON.stringify({ name: 'Club House' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'Club House');
    assert.ok(body.id);
    assert.ok(body.createdAt);
    assert.equal(body.lat, null);
    assert.equal(body.lng, null);
  });

  it('POST /api/locations creates a location with lat/lng', async () => {
    const res = await apiJson('/api/locations', {
      method: 'POST',
      body: JSON.stringify({ name: 'Park', lat: 48.1234, lng: 11.5678 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'Park');
    assert.equal(body.lat, 48.1234);
    assert.equal(body.lng, 11.5678);
  });

  it('rejects empty name', async () => {
    const res = await apiJson('/api/locations', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    });
    assert.equal(res.status, 400);
  });

  it('rejects duplicate name', async () => {
    const res = await apiJson('/api/locations', {
      method: 'POST',
      body: JSON.stringify({ name: 'Club House' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('already exists'));
  });

  it('GET /api/locations returns created locations', async () => {
    const res = await api('/api/locations');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.length, 2);
  });

  it('PUT /api/locations/:id updates name and coordinates', async () => {
    const listRes = await api('/api/locations');
    const locs = await listRes.json();
    const loc = locs.find(l => l.name === 'Club House');

    const res = await apiJson(`/api/locations/${loc.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'Main Club', lat: 50.0, lng: 10.0 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'Main Club');
    assert.equal(body.lat, 50.0);
    assert.equal(body.lng, 10.0);
  });

  it('DELETE /api/locations/:id works for location with no matches', async () => {
    // Create a location to delete
    const createRes = await apiJson('/api/locations', {
      method: 'POST',
      body: JSON.stringify({ name: 'Deletable Loc' }),
    });
    const loc = await createRes.json();

    const res = await api(`/api/locations/${loc.id}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
  });

  it('DELETE /api/locations/:id by non-admin returns 403', async () => {
    const listRes = await api('/api/locations');
    const locs = await listRes.json();
    const loc = locs[0];

    const res = await fetch(`${server.url}/api/locations/${loc.id}`, {
      method: 'DELETE',
      headers: { Cookie: userCookie },
    });
    assert.equal(res.status, 403);
  });

  it('match with locationId — create match referencing a location', async () => {
    // Create two players
    const r1 = await apiJson('/api/players', {
      method: 'POST', body: JSON.stringify({ name: 'LocP1' }),
    });
    const p1 = await r1.json();

    const r2 = await apiJson('/api/players', {
      method: 'POST', body: JSON.stringify({ name: 'LocP2' }),
    });
    const p2 = await r2.json();

    // Get a location
    const locsRes = await api('/api/locations');
    const locs = await locsRes.json();
    const loc = locs[0];

    // Create match with locationId
    const matchRes = await apiJson('/api/matches', {
      method: 'POST',
      body: JSON.stringify({
        player1Id: p1.id, player2Id: p2.id,
        sets: [{ p1: 11, p2: 5 }],
        locationId: loc.id,
      }),
    });
    assert.equal(matchRes.status, 200);
    const match = await matchRes.json();
    assert.equal(match.locationId, loc.id);
  });

  it('image upload and serve cycle', async () => {
    const listRes = await api('/api/locations');
    const locs = await listRes.json();
    const loc = locs[0];

    // Upload a small base64 "image" (1x1 JPEG)
    const tinyJpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=';

    const uploadRes = await apiJson(`/api/locations/${loc.id}/image`, {
      method: 'POST',
      body: JSON.stringify({ data: tinyJpeg }),
    });
    assert.equal(uploadRes.status, 200);

    // Serve the image
    const imgRes = await api(`/api/locations/${loc.id}/image`);
    assert.equal(imgRes.status, 200);
    assert.ok(imgRes.headers.get('content-type').includes('image/jpeg'));

    // Delete the image
    const delRes = await api(`/api/locations/${loc.id}/image`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);

    // Verify it's gone
    const img404 = await api(`/api/locations/${loc.id}/image`);
    assert.equal(img404.status, 404);
  });

  it('DELETE location with matches returns 409 without force', async () => {
    // Get a location that has matches
    const locsRes = await api('/api/locations');
    const locs = await locsRes.json();
    const loc = locs[0];

    const res = await api(`/api/locations/${loc.id}`, { method: 'DELETE' });
    assert.equal(res.status, 409);
  });

  it('DELETE location with ?force=true nullifies matches', async () => {
    const locsRes = await api('/api/locations');
    const locs = await locsRes.json();
    const loc = locs[0];

    const res = await api(`/api/locations/${loc.id}?force=true`, { method: 'DELETE' });
    assert.equal(res.status, 200);

    // Verify match still exists but locationId is null
    const matchesRes = await api('/api/matches');
    const matches = await matchesRes.json();
    const matchWithLoc = matches.find(m => m.locationId === loc.id);
    assert.equal(matchWithLoc, undefined); // no match should reference this location anymore
  });
});
