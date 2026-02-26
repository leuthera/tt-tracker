'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startDbService, startServer, login, createUser, kill } = require('../helpers/setup');

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

  // ── Version endpoint ────────────────────────────────────────────────────────
  it('GET /api/version returns sha (no auth needed)', async () => {
    const res = await fetch(`${server.url}/api/version`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sha, 'dev');
  });

  // ── Current user info & client error logging ────────────────────────────────
  // Share a single login across these tests to stay within the rate limit
  let sharedCookie;

  it('GET /api/me returns current user info', async () => {
    sharedCookie = await login(server.url);
    const res = await fetch(`${server.url}/api/me`, {
      headers: { Cookie: sharedCookie },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.username, 'admin');
    assert.equal(body.role, 'admin');
    assert.ok(body.userId);
  });

  describe('POST /api/client-errors', () => {

    it('returns 200 with valid payload', async () => {
      const res = await fetch(`${server.url}/api/client-errors`, {
        method: 'POST',
        headers: { Cookie: sharedCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Test error', url: 'http://localhost/', line: 42, col: 10 }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
    });

    it('returns 401 without auth', async () => {
      const res = await fetch(`${server.url}/api/client-errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Test error' }),
      });
      assert.equal(res.status, 401);
    });

    it('returns 400 when message is missing', async () => {
      const res = await fetch(`${server.url}/api/client-errors`, {
        method: 'POST',
        headers: { Cookie: sharedCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://localhost/' }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error.includes('message'));
    });

    it('accepts long messages', async () => {
      const longMsg = 'x'.repeat(2000);
      const res = await fetch(`${server.url}/api/client-errors`, {
        method: 'POST',
        headers: { Cookie: sharedCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: longMsg }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
    });
  });

  // ── Role-based access ──────────────────────────────────────────────────────
  describe('role-based access', () => {
    let adminCookie, userCookie;

    before(async () => {
      adminCookie = await login(server.url);
      await createUser(server.url, adminCookie, {
        username: 'regular',
        password: 'userpass123',
        role: 'user',
      });
      userCookie = await login(server.url, 'regular', 'userpass123');
    });

    it('regular user can log in', async () => {
      assert.ok(userCookie, 'user cookie should be set');
      const res = await fetch(`${server.url}/api/me`, {
        headers: { Cookie: userCookie },
      });
      const body = await res.json();
      assert.equal(body.username, 'regular');
      assert.equal(body.role, 'user');
    });

    it('regular user can access players/matches', async () => {
      const res = await fetch(`${server.url}/api/players`, {
        headers: { Cookie: userCookie },
      });
      assert.equal(res.status, 200);
    });

    it('regular user gets 403 on DELETE /api/players/:id', async () => {
      const res = await fetch(`${server.url}/api/players/fake_id`, {
        method: 'DELETE',
        headers: { Cookie: userCookie },
      });
      assert.equal(res.status, 403);
    });

    it('regular user gets 403 on DELETE /api/matches/:id', async () => {
      const res = await fetch(`${server.url}/api/matches/fake_id`, {
        method: 'DELETE',
        headers: { Cookie: userCookie },
      });
      assert.equal(res.status, 403);
    });

    it('regular user gets 403 on GET /api/users', async () => {
      const res = await fetch(`${server.url}/api/users`, {
        headers: { Cookie: userCookie },
      });
      assert.equal(res.status, 403);
    });

    it('regular user gets 403 on POST /api/users', async () => {
      const res = await fetch(`${server.url}/api/users`, {
        method: 'POST',
        headers: { Cookie: userCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'hack', password: 'hack1234' }),
      });
      assert.equal(res.status, 403);
    });

    it('regular user can change own password', async () => {
      const res = await fetch(`${server.url}/api/me/password`, {
        method: 'PUT',
        headers: { Cookie: userCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'userpass123', newPassword: 'newpass456' }),
      });
      assert.equal(res.status, 200);

      // Can log in with new password
      const newCookie = await login(server.url, 'regular', 'newpass456');
      assert.ok(newCookie);

      // Restore original password for other tests
      const res2 = await fetch(`${server.url}/api/me/password`, {
        method: 'PUT',
        headers: { Cookie: newCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'newpass456', newPassword: 'userpass123' }),
      });
      assert.equal(res2.status, 200);
    });

    it('change own password rejects wrong current password', async () => {
      const res = await fetch(`${server.url}/api/me/password`, {
        method: 'PUT',
        headers: { Cookie: userCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'newpass456' }),
      });
      assert.equal(res.status, 403);
    });
  });

  // ── Admin user management ─────────────────────────────────────────────────
  describe('admin user management', () => {
    let createdUserId;

    it('admin can list users', async () => {
      const res = await fetch(`${server.url}/api/users`, {
        headers: { Cookie: sharedCookie },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.length >= 1);
      assert.ok(body[0].username);
      assert.ok(!body[0].password, 'password should not be exposed');
    });

    it('admin can create a user', async () => {
      const res = await fetch(`${server.url}/api/users`, {
        method: 'POST',
        headers: { Cookie: sharedCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'newuser', password: 'pass1234', role: 'user' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.username, 'newuser');
      assert.equal(body.role, 'user');
      createdUserId = body.id;
    });

    it('admin can reset user password', async () => {
      const res = await fetch(`${server.url}/api/users/${createdUserId}/password`, {
        method: 'PUT',
        headers: { Cookie: sharedCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'reset1234' }),
      });
      assert.equal(res.status, 200);

      // New user can log in with reset password
      const cookie = await login(server.url, 'newuser', 'reset1234');
      assert.ok(cookie);
    });

    it('admin cannot delete self', async () => {
      const meRes = await fetch(`${server.url}/api/me`, {
        headers: { Cookie: sharedCookie },
      });
      const me = await meRes.json();

      const res = await fetch(`${server.url}/api/users/${me.userId}`, {
        method: 'DELETE',
        headers: { Cookie: sharedCookie },
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error.includes('own account'));
    });

    it('admin can delete a user', async () => {
      const res = await fetch(`${server.url}/api/users/${createdUserId}`, {
        method: 'DELETE',
        headers: { Cookie: sharedCookie },
      });
      assert.equal(res.status, 200);

      // Deleted user cannot log in — should not get a redirect (302 = success)
      const loginRes = await fetch(`${server.url}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'username=newuser&password=reset1234',
        redirect: 'manual',
      });
      assert.notEqual(loginRes.status, 302, 'Deleted user login should not redirect');
    });

    it('rejects duplicate username', async () => {
      const res = await fetch(`${server.url}/api/users`, {
        method: 'POST',
        headers: { Cookie: sharedCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'test1234' }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error.includes('already exists'));
    });

    it('rejects short password', async () => {
      const res = await fetch(`${server.url}/api/users`, {
        method: 'POST',
        headers: { Cookie: sharedCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'shortpw', password: 'ab' }),
      });
      assert.equal(res.status, 400);
    });
  });

});
