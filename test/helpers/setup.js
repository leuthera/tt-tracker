'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TEST_DB_TOKEN = 'test-db-token';

function getRandomPort() {
  return 10000 + Math.floor(Math.random() * 50000);
}

function waitForReady(port, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Timed out waiting for port ${port}`));
      }
      const req = http.get(`http://127.0.0.1:${port}/healthz`, (res) => {
        let body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => {
          if (res.statusCode === 200) resolve();
          else setTimeout(attempt, 50);
        });
      });
      req.on('error', () => setTimeout(attempt, 50));
    }
    attempt();
  });
}

async function startDbService() {
  const port = getRandomPort();
  const proc = spawn(process.execPath, [path.join(ROOT, 'db-service.js')], {
    env: { ...process.env, PORT: String(port), DB_PATH: ':memory:', DB_TOKEN: TEST_DB_TOKEN },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Capture stderr for debugging
  let stderr = '';
  proc.stderr.on('data', (d) => stderr += d);

  proc.on('error', (err) => {
    throw new Error(`Failed to start db-service: ${err.message}\n${stderr}`);
  });

  await waitForReady(port);
  const url = `http://127.0.0.1:${port}`;
  return { proc, port, url };
}

async function startServer(dbUrl) {
  const port = getRandomPort();
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      DB_URL: dbUrl,
      ADMIN_USER: 'admin',
      ADMIN_PASS: 'testpass123',
      SESSION_SECRET: 'test-secret',
      DB_TOKEN: TEST_DB_TOKEN,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  proc.stderr.on('data', (d) => stderr += d);

  proc.on('error', (err) => {
    throw new Error(`Failed to start server: ${err.message}\n${stderr}`);
  });

  await waitForReady(port);
  const url = `http://127.0.0.1:${port}`;
  return { proc, port, url };
}

async function login(baseUrl, username = 'admin', password = 'testpass123') {
  const res = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookie = setCookie.map(c => c.split(';')[0]).join('; ');
  return cookie;
}

async function createUser(baseUrl, adminCookie, { username, password, role }) {
  const res = await fetch(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role: role || 'user' }),
  });
  return res.json();
}

function kill(proc) {
  if (proc && !proc.killed) {
    proc.kill('SIGTERM');
  }
}

module.exports = { startDbService, startServer, login, createUser, kill, TEST_DB_TOKEN };
