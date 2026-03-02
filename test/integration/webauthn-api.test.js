'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startDbService, startServer, login, createUser, kill } = require('../helpers/setup');

describe('webauthn API', () => {
  let db, server;
  let adminCookie, userCookie;

  before(async () => {
    db = await startDbService();
    server = await startServer(db.url);
    adminCookie = await login(server.url);

    // Create a regular user
    await createUser(server.url, adminCookie, {
      username: 'webuser',
      password: 'webpass123',
      role: 'user',
    });
    userCookie = await login(server.url, 'webuser', 'webpass123');
  });

  after(() => {
    kill(server?.proc);
    kill(db?.proc);
  });

  // ── Registration options ──────────────────────────────────────────────────
  describe('POST /api/webauthn/register/options', () => {
    it('returns valid challenge structure', async () => {
      const res = await fetch(`${server.url}/api/webauthn/register/options`, {
        method: 'POST',
        headers: { Cookie: userCookie, 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.challenge, 'should have challenge');
      assert.ok(body.rp, 'should have rp');
      assert.ok(body.user, 'should have user');
      assert.equal(body.rp.name, 'TT Tracker');
      assert.equal(body.user.name, 'webuser');
      assert.equal(body.attestation, 'none');
    });

    it('returns 401 without auth', async () => {
      const res = await fetch(`${server.url}/api/webauthn/register/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(res.status, 401);
    });
  });

  // ── Registration verify ───────────────────────────────────────────────────
  describe('POST /api/webauthn/register/verify', () => {
    it('rejects without prior challenge', async () => {
      // Fresh login to get a session without challenge
      const freshCookie = await login(server.url, 'webuser', 'webpass123');
      const res = await fetch(`${server.url}/api/webauthn/register/verify`, {
        method: 'POST',
        headers: { Cookie: freshCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: { id: 'fake' } }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error.includes('challenge') || body.error.includes('No challenge'));
    });

    it('rejects malformed response', async () => {
      // First get options to set a challenge
      const optRes = await fetch(`${server.url}/api/webauthn/register/options`, {
        method: 'POST',
        headers: { Cookie: userCookie, 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(optRes.status, 200);

      // Send invalid verification data
      const res = await fetch(`${server.url}/api/webauthn/register/verify`, {
        method: 'POST',
        headers: { Cookie: userCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: { id: 'fake', rawId: 'ZmFrZQ', type: 'public-key', response: { attestationObject: 'bad', clientDataJSON: 'bad' } }, name: 'test' }),
      });
      assert.equal(res.status, 400);
    });

    it('returns 401 without auth', async () => {
      const res = await fetch(`${server.url}/api/webauthn/register/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: {} }),
      });
      assert.equal(res.status, 401);
    });
  });

  // ── Login options ─────────────────────────────────────────────────────────
  describe('POST /api/webauthn/login/options', () => {
    it('returns challenge (no auth needed)', async () => {
      const res = await fetch(`${server.url}/api/webauthn/login/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.challenge, 'should have challenge');
      assert.ok(body.rpId || body.rp, 'should have rpId');
    });
  });

  // ── Login verify ──────────────────────────────────────────────────────────
  describe('POST /api/webauthn/login/verify', () => {
    it('rejects without prior challenge', async () => {
      const res = await fetch(`${server.url}/api/webauthn/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: { id: 'fake' } }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error);
    });

    it('rejects invalid credential', async () => {
      // First get a challenge
      const optRes = await fetch(`${server.url}/api/webauthn/login/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const setCookie = optRes.headers.getSetCookie?.() || [];
      const cookie = setCookie.map(c => c.split(';')[0]).join('; ');

      // Try to verify with a non-existent credential
      const res = await fetch(`${server.url}/api/webauthn/login/verify`, {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: { id: 'nonexistent_cred', rawId: 'bm9uZXhpc3RlbnRfY3JlZA', type: 'public-key', response: { authenticatorData: 'fake', clientDataJSON: 'fake', signature: 'fake' } } }),
      });
      assert.equal(res.status, 400);
    });
  });

  // ── Credential list ───────────────────────────────────────────────────────
  describe('GET /api/webauthn/credentials', () => {
    it('returns empty array for user with no passkeys', async () => {
      const res = await fetch(`${server.url}/api/webauthn/credentials`, {
        headers: { Cookie: userCookie },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body));
      assert.equal(body.length, 0);
    });

    it('returns 401 without auth', async () => {
      const res = await fetch(`${server.url}/api/webauthn/credentials`);
      assert.equal(res.status, 401);
    });
  });

  // ── Credential delete ─────────────────────────────────────────────────────
  describe('DELETE /api/webauthn/credentials/:id', () => {
    it('returns 404 for non-existent credential', async () => {
      const res = await fetch(`${server.url}/api/webauthn/credentials/wc_fake`, {
        method: 'DELETE',
        headers: { Cookie: userCookie },
      });
      assert.equal(res.status, 404);
    });

    it('returns 401 without auth', async () => {
      const res = await fetch(`${server.url}/api/webauthn/credentials/wc_fake`, {
        method: 'DELETE',
      });
      assert.equal(res.status, 401);
    });
  });

  // ── Cross-user isolation ──────────────────────────────────────────────────
  describe('credential ownership', () => {
    it('user cannot see credentials of another user', async () => {
      // Admin's credential list should be separate from webuser's
      const adminRes = await fetch(`${server.url}/api/webauthn/credentials`, {
        headers: { Cookie: adminCookie },
      });
      assert.equal(adminRes.status, 200);
      const adminCreds = await adminRes.json();

      const userRes = await fetch(`${server.url}/api/webauthn/credentials`, {
        headers: { Cookie: userCookie },
      });
      assert.equal(userRes.status, 200);
      const userCreds = await userRes.json();

      // Both should be empty since no credentials registered
      assert.equal(adminCreds.length, 0);
      assert.equal(userCreds.length, 0);
    });
  });

  // ── Public login page script ──────────────────────────────────────────────
  describe('public webauthn-login.js', () => {
    it('js/webauthn-login.js is served without auth', async () => {
      const res = await fetch(`${server.url}/js/webauthn-login.js`);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.ok(body.includes('PublicKeyCredential'));
    });

    it('other js files require auth', async () => {
      const res = await fetch(`${server.url}/js/app.js`, { redirect: 'manual' });
      // Should redirect to login or return 401
      assert.ok(res.status === 302 || res.status === 401, `Expected 302 or 401 but got ${res.status}`);
    });
  });
});
