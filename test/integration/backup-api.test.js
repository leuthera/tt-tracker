'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startDbService, startServer, login, createUser, kill, TEST_DB_TOKEN } = require('../helpers/setup');

describe('backup API', () => {
  let db, server, tmpDir, dbPath;
  let adminCookie, userCookie;
  const authHeader = { 'Authorization': `Bearer ${TEST_DB_TOKEN}` };

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-backup-'));
    dbPath = path.join(tmpDir, 'test.db');
    db = await startDbService({ dbPath });
    server = await startServer(db.url);
    adminCookie = await login(server.url);
    await createUser(server.url, adminCookie, { username: 'regular', password: 'testpass123', role: 'user' });
    userCookie = await login(server.url, 'regular', 'testpass123');
  });

  after(() => {
    kill(server?.proc);
    kill(db?.proc);
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function dbFetch(urlPath, opts = {}) {
    return fetch(`${db.url}${urlPath}`, {
      ...opts,
      headers: { ...authHeader, ...opts.headers },
    });
  }

  // ── List backups (empty) ─────────────────────────────────────────────────
  it('GET /backups returns empty array initially', async () => {
    const res = await dbFetch('/backups');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, []);
  });

  // ── Create backup ────────────────────────────────────────────────────────
  let createdName;

  it('POST /backups creates a backup', async () => {
    const res = await dbFetch('/backups', { method: 'POST' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.name);
    assert.match(body.name, /^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.db$/);
    createdName = body.name;
  });

  // ── List backups (1 item) ────────────────────────────────────────────────
  it('GET /backups lists 1 backup after creation', async () => {
    const res = await dbFetch('/backups');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.length, 1);
    assert.equal(body[0].name, createdName);
    assert.ok(body[0].size > 0);
    assert.ok(body[0].created > 0);
  });

  // ── Download backup ──────────────────────────────────────────────────────
  it('GET /backups/:filename downloads the file', async () => {
    const res = await dbFetch(`/backups/${createdName}`);
    assert.equal(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 0);
    // SQLite files start with "SQLite format 3\0"
    assert.equal(buf.subarray(0, 15).toString(), 'SQLite format 3');
  });

  // ── Invalid filename returns 400 ────────────────────────────────────────
  it('GET /backups with invalid filename returns 400', async () => {
    const res = await dbFetch('/backups/not_valid_name.db');
    assert.equal(res.status, 400);
  });

  it('DELETE /backups with invalid filename returns 400', async () => {
    const res = await dbFetch('/backups/not_valid', { method: 'DELETE' });
    assert.equal(res.status, 400);
  });

  it('POST /backups/:filename/restore with invalid filename returns 400', async () => {
    const res = await dbFetch('/backups/evil_file.db/restore', { method: 'POST' });
    assert.equal(res.status, 400);
  });

  // ── Non-admin cannot access backups via server.js ────────────────────────
  it('POST /api/backups returns 403 for non-admin', async () => {
    const res = await fetch(`${server.url}/api/backups`, {
      method: 'POST',
      headers: { Cookie: userCookie },
    });
    assert.equal(res.status, 403);
  });

  it('GET /api/backups returns 403 for non-admin', async () => {
    const res = await fetch(`${server.url}/api/backups`, {
      headers: { Cookie: userCookie },
    });
    assert.equal(res.status, 403);
  });

  // ── Admin can access backups via server.js ───────────────────────────────
  it('GET /api/backups returns list for admin', async () => {
    const res = await fetch(`${server.url}/api/backups`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
  });

  it('POST /api/backups creates a backup for admin', async () => {
    const res = await fetch(`${server.url}/api/backups`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });

  it('GET /api/backups/:filename downloads for admin', async () => {
    const res = await fetch(`${server.url}/api/backups/${createdName}`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 15).toString(), 'SQLite format 3');
  });

  // ── Delete backup ────────────────────────────────────────────────────────
  it('DELETE /backups/:filename removes the backup', async () => {
    // First list to get all backups
    const listRes = await dbFetch('/backups');
    const backups = await listRes.json();
    // Delete all backups
    for (const b of backups) {
      const res = await dbFetch(`/backups/${b.name}`, { method: 'DELETE' });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
    }
    // Verify empty
    const afterRes = await dbFetch('/backups');
    const afterBody = await afterRes.json();
    assert.deepEqual(afterBody, []);
  });

  it('DELETE /backups/:filename returns 404 for missing file', async () => {
    const res = await dbFetch('/backups/backup_2024-01-01_00-00-00.db', { method: 'DELETE' });
    assert.equal(res.status, 404);
  });
});
