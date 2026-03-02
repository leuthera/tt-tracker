'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startDbService, kill, TEST_DB_TOKEN } = require('../helpers/setup');

describe('webauthn-credentials DB endpoints', () => {
  let db;
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_DB_TOKEN}` };
  let userId;
  let credId; // the generated wc_... id

  before(async () => {
    db = await startDbService();
    // Create a user to attach credentials to
    const res = await fetch(`${db.url}/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: 'webauthn-user', password: 'hashed', role: 'user' }),
    });
    const user = await res.json();
    userId = user.id;
  });

  after(() => {
    kill(db?.proc);
  });

  it('list credentials for user returns empty array initially', async () => {
    const res = await fetch(`${db.url}/users/${userId}/webauthn-credentials`, {
      headers: { 'Authorization': `Bearer ${TEST_DB_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, []);
  });

  it('create a webauthn credential', async () => {
    const res = await fetch(`${db.url}/users/${userId}/webauthn-credentials`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        credential_id: 'cred_abc123',
        public_key: 'PUBKEY_BASE64',
        counter: 0,
        transports: 'internal,hybrid',
        device_type: 'singleDevice',
        backed_up: 0,
        name: 'My Phone',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.id.startsWith('wc_'));
    assert.equal(body.user_id, userId);
    assert.equal(body.credential_id, 'cred_abc123');
    assert.equal(body.public_key, 'PUBKEY_BASE64');
    assert.equal(body.counter, 0);
    assert.equal(body.transports, 'internal,hybrid');
    assert.equal(body.device_type, 'singleDevice');
    assert.equal(body.backed_up, 0);
    assert.equal(body.name, 'My Phone');
    credId = body.id;
  });

  it('list credentials returns the created credential', async () => {
    const res = await fetch(`${db.url}/users/${userId}/webauthn-credentials`, {
      headers: { 'Authorization': `Bearer ${TEST_DB_TOKEN}` },
    });
    const body = await res.json();
    assert.equal(body.length, 1);
    assert.equal(body[0].credential_id, 'cred_abc123');
  });

  it('look up credential by credential_id', async () => {
    const res = await fetch(`${db.url}/webauthn-credentials/by-credential-id/cred_abc123`, {
      headers: { 'Authorization': `Bearer ${TEST_DB_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.credential_id, 'cred_abc123');
    assert.equal(body.user_id, userId);
  });

  it('look up non-existent credential_id returns 404', async () => {
    const res = await fetch(`${db.url}/webauthn-credentials/by-credential-id/nonexistent`, {
      headers: { 'Authorization': `Bearer ${TEST_DB_TOKEN}` },
    });
    assert.equal(res.status, 404);
  });

  it('update counter', async () => {
    const res = await fetch(`${db.url}/webauthn-credentials/cred_abc123/counter`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ counter: 5, backed_up: 1 }),
    });
    assert.equal(res.status, 200);

    // Verify counter was updated
    const getRes = await fetch(`${db.url}/webauthn-credentials/by-credential-id/cred_abc123`, {
      headers: { 'Authorization': `Bearer ${TEST_DB_TOKEN}` },
    });
    const body = await getRes.json();
    assert.equal(body.counter, 5);
    assert.equal(body.backed_up, 1);
  });

  it('duplicate credential_id returns 409', async () => {
    const res = await fetch(`${db.url}/users/${userId}/webauthn-credentials`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        credential_id: 'cred_abc123',
        public_key: 'ANOTHER_KEY',
        counter: 0,
      }),
    });
    assert.equal(res.status, 409);
  });

  it('delete credential', async () => {
    const res = await fetch(`${db.url}/webauthn-credentials/${credId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${TEST_DB_TOKEN}` },
    });
    assert.equal(res.status, 200);

    // Verify it's gone
    const listRes = await fetch(`${db.url}/users/${userId}/webauthn-credentials`, {
      headers: { 'Authorization': `Bearer ${TEST_DB_TOKEN}` },
    });
    const body = await listRes.json();
    assert.equal(body.length, 0);
  });

  it('delete non-existent credential returns 404', async () => {
    const res = await fetch(`${db.url}/webauthn-credentials/wc_nonexistent`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${TEST_DB_TOKEN}` },
    });
    assert.equal(res.status, 404);
  });

  it('cascade deletes credentials when user is deleted', async () => {
    // Create a credential first
    await fetch(`${db.url}/users/${userId}/webauthn-credentials`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        credential_id: 'cred_cascade_test',
        public_key: 'KEY',
        counter: 0,
      }),
    });

    // Delete the user
    await fetch(`${db.url}/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${TEST_DB_TOKEN}` },
    });

    // Credential should be gone (lookup by credential_id)
    const res = await fetch(`${db.url}/webauthn-credentials/by-credential-id/cred_cascade_test`, {
      headers: { 'Authorization': `Bearer ${TEST_DB_TOKEN}` },
    });
    assert.equal(res.status, 404);
  });
});
