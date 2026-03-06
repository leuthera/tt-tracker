'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TEST_DB_TOKEN = 'bec8a9eaa6f63af3aa6d0555f3b340d3';

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

async function startDbService(options = {}) {
  const port = getRandomPort();
  const dbPath = options.dbPath || ':memory:';
  const proc = spawn(process.execPath, [path.join(ROOT, 'db-service.js')], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, DB_TOKEN: TEST_DB_TOKEN, LOG_LEVEL: 'warn' },
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
      ADMIN_PASS: '243c3c1b762832ffa528b85844ecf237',
      SESSION_SECRET: '3d47d2ecf45d81875ba05cf27a4e8876',
      DB_TOKEN: TEST_DB_TOKEN,
      LOG_LEVEL: 'warn',
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

async function login(baseUrl, username = 'admin', password = '243c3c1b762832ffa528b85844ecf237') {
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
