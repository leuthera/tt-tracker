'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startDbService, startServer, login, kill } = require('../helpers/setup');

describe('auth', () => {
  let db, server;

  before(async () => {
    db = await startDbService();
    server = await startServer(db.url);
  });

  after(() => {
    kill(server?.proc);
    kill(db?.proc);
  });

  it('GET /login returns form HTML', async () => {
    const res = await fetch(`${server.url}/login`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes('<form'));
    assert.ok(body.includes('Sign In'));
  });

  it('POST /login with valid credentials redirects (302)', async () => {
    const res = await fetch(`${server.url}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=admin&password=testpass123',
      redirect: 'manual',
    });
    assert.equal(res.status, 302);
    const location = res.headers.get('location');
    assert.equal(location, '/');
    const setCookie = res.headers.getSetCookie?.() || [];
    assert.ok(setCookie.length > 0, 'Should set a session cookie');
  });

  it('POST /login with wrong password shows error', async () => {
    const res = await fetch(`${server.url}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=admin&password=wrongpass',
      redirect: 'manual',
    });
    const body = await res.text();
    assert.ok(body.includes('Invalid username or password'));
  });

  it('POST /login with missing fields shows error', async () => {
    const res = await fetch(`${server.url}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
      redirect: 'manual',
    });
    const body = await res.text();
    assert.ok(body.includes('Invalid username or password'));
  });

  it('POST /logout destroys session', async () => {
    const cookie = await login(server.url);

    const logoutRes = await fetch(`${server.url}/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
      redirect: 'manual',
    });
    assert.equal(logoutRes.status, 302);

    // Session should be invalid now
    const apiRes = await fetch(`${server.url}/api/players`, {
      headers: { Cookie: cookie },
    });
    assert.equal(apiRes.status, 401);
  });

  it('GET /api/players returns 401 without cookie', async () => {
    const res = await fetch(`${server.url}/api/players`);
    assert.equal(res.status, 401);
  });

  it('GET / redirects to /login without cookie', async () => {
    const res = await fetch(`${server.url}/`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/login');
  });
});
