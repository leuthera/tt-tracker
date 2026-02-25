/*
 * ============================================================
 * TT Tracker — Table Tennis Match Tracker
 * ============================================================
 *
 * A lightweight web app for tracking table tennis matches,
 * player stats, and head-to-head records.
 *
 * PREREQUISITES:
 *   - Node.js 18+ (uses built-in crypto and fetch)
 *   - npm (for installing dependencies)
 *
 * SETUP & RUN:
 *   cd /path/to/tt-tracker
 *   npm install            # installs express, express-session
 *   node server.js         # starts on http://localhost:8000
 *
 * HTTPS (optional):
 *   Set TLS_CERT and TLS_KEY to file paths of your certificate and private key.
 *   TLS_CERT=/path/to/cert.pem TLS_KEY=/path/to/key.pem node server.js
 *
 * DEFAULT LOGIN:
 *   Set ADMIN_USER and ADMIN_PASS environment variables
 *
 * DATA:
 *   Data is stored via the db-service container (SQLite).
 *   The db service is accessed over the Docker internal network.
 *
 * FILES:
 *   server.js   — Express server: auth, sessions, REST API proxy
 *   db-service.js — SQLite microservice (separate container)
 *   index.html  — Single-page mobile-first frontend (served at /)
 * ============================================================
 */

'use strict';

const express = require('express');
const session = require('express-session');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { hashPassword, verifyPassword, dbToPlayer, dbToMatch, countSetWins, determineWinner } = require('./lib/helpers');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;
if (!ADMIN_PASS) {
  console.error('ERROR: ADMIN_PASS environment variable is required');
  process.exit(1);
}
const USERS = [
  { username: ADMIN_USER, password: hashPassword(ADMIN_PASS) }
];
const PORT = process.env.PORT || 8000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DB_URL = process.env.DB_URL || 'http://db:3000';
const DB_TOKEN = process.env.DB_TOKEN || '';
const TLS_CERT = process.env.TLS_CERT;
const TLS_KEY = process.env.TLS_KEY;

// ─── DB CLIENT ────────────────────────────────────────────────────────────────
const dbHeaders = DB_TOKEN ? { 'Authorization': `Bearer ${DB_TOKEN}` } : {};

async function dbFetch(path, options) {
  const opts = { ...options, headers: { ...dbHeaders, ...options?.headers } };
  const res = await fetch(`${DB_URL}${path}`, opts);
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body.error || `DB service error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// ─── EXPRESS APP ──────────────────────────────────────────────────────────────
const app = express();

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// ─── SECURITY HEADERS ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");
  if (TLS_CERT && TLS_KEY) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  next();
});
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: !!(TLS_CERT && TLS_KEY), sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// ─── LOGIN RATE LIMITING ──────────────────────────────────────────────────────
const loginAttempts = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10; // max attempts per window

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// Clean up stale entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, RATE_LIMIT_WINDOW).unref();

// ─── CSRF PROTECTION ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.get('origin') || req.get('referer');
  if (!origin) return next(); // Allow non-browser clients (curl, tests)
  try {
    const url = new URL(origin);
    const host = req.get('host');
    if (url.host === host) return next();
  } catch {}
  res.status(403).json({ error: 'Forbidden' });
});

// ─── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  res.redirect('/login');
}

// ─── LOGIN PAGE ────────────────────────────────────────────────────────────────
const loginHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#2d7a2d">
  <title>TT Tracker — Login</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --primary: #2d7a2d; --primary-dark: #1e5c1e;
      --border: #e0e8e0; --text: #1a2e1a; --text-muted: #6b7c6b;
      --radius-md: 12px; --radius-lg: 16px;
    }
    [data-theme="dark"] {
      --border: #3a3e3a; --text: #e0e4e0; --text-muted: #8a9a8a;
    }
    html, body {
      height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f0f4f0; display: flex; align-items: center; justify-content: center;
      -webkit-tap-highlight-color: transparent;
    }
    [data-theme="dark"] body { background: #1a1d1a; }
    .card {
      background: #fff; border-radius: var(--radius-lg); padding: 32px 24px;
      width: 90%; max-width: 360px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    }
    [data-theme="dark"] .card { background: #242824; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
    [data-theme="dark"] input { background: #2a2e2a; border-color: #3a3e3a; color: #e0e4e0; }
    [data-theme="dark"] input:focus { box-shadow: 0 0 0 3px rgba(76,175,80,0.2); }
    [data-theme="dark"] .error { background: rgba(239,83,80,0.15); color: #ef5350; }
    .logo { text-align: center; margin-bottom: 28px; }
    .logo h1 { font-size: 28px; color: var(--primary); }
    .logo p { font-size: 14px; color: var(--text-muted); margin-top: 4px; }
    label {
      display: block; font-size: 12px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-muted); margin-bottom: 6px;
    }
    input {
      width: 100%; padding: 12px 14px; border: 1.5px solid var(--border);
      border-radius: var(--radius-md); font-size: 15px; font-family: inherit;
      color: var(--text); outline: none; transition: border-color 0.15s;
      margin-bottom: 16px;
    }
    input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(45,122,45,0.12); }
    button {
      width: 100%; padding: 14px; background: var(--primary); color: #fff;
      border: none; border-radius: var(--radius-md); font-size: 16px; font-weight: 600;
      cursor: pointer; font-family: inherit; transition: background 0.15s;
    }
    button:active { background: var(--primary-dark); }
    .error {
      background: rgba(198,40,40,0.1); color: #c62828; border-radius: 8px;
      padding: 10px 14px; font-size: 13px; margin-bottom: 16px; text-align: center;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>🏓 TT Tracker</h1>
      <p>Sign in to continue</p>
    </div>
    {{ERROR}}
    <form method="POST" action="/login">
      <label for="username">Username</label>
      <input type="text" id="username" name="username" autocomplete="username"
             autocapitalize="off" required placeholder="Enter username">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autocomplete="current-password"
             required placeholder="Enter password">
      <button type="submit">Sign In</button>
    </form>
  </div>
  <script>
    (function() {
      var saved = localStorage.getItem('theme');
      var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    })();
  </script>
</body>
</html>`;

app.get('/login', (req, res) => {
  if (req.session.loggedIn) return res.redirect('/');
  res.send(loginHTML.replace('{{ERROR}}', ''));
});

app.post('/login', (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress;
  if (!checkLoginRateLimit(clientIp)) {
    console.warn(`Rate-limited login attempt from ${clientIp}`);
    return res.status(429).send(loginHTML.replace('{{ERROR}}',
      '<div class="error">Too many login attempts. Please try again later.</div>'));
  }

  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string') {
    console.warn(`Failed login from ${clientIp}: missing fields`);
    return res.send(loginHTML.replace('{{ERROR}}',
      '<div class="error">Invalid username or password</div>'));
  }
  // Constant-time comparison to prevent timing attacks
  const user = USERS.find(u => {
    const uBuf = Buffer.from(u.username);
    const inputUBuf = Buffer.from(username);
    if (uBuf.length !== inputUBuf.length || !crypto.timingSafeEqual(uBuf, inputUBuf)) return false;
    return verifyPassword(password, u.password);
  });
  if (!user) {
    console.warn(`Failed login from ${clientIp}: user="${username}"`);
    return res.send(loginHTML.replace('{{ERROR}}',
      '<div class="error">Invalid username or password</div>'));
  }
  req.session.loggedIn = true;
  req.session.username = username;
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// ─── PWA STATIC FILES (before auth) ──────────────────────────────────────────
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));
app.get('/icon.svg', (req, res) => res.sendFile(path.join(__dirname, 'icon.svg')));
app.get('/sw.js', (req, res) => res.sendFile(path.join(__dirname, 'sw.js')));

// ─── SERVE APP ────────────────────────────────────────────────────────────────
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── HELPERS (imported from lib/helpers.js) ──────────────────────────────────

// ─── API: PLAYERS ─────────────────────────────────────────────────────────────
app.get('/api/players', requireAuth, async (req, res) => {
  try {
    const rows = await dbFetch('/players');
    res.json(rows.map(dbToPlayer));
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/players', requireAuth, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name cannot be empty' });
  if (name.length > 30) return res.status(400).json({ error: 'Name too long (max 30 chars)' });

  try {
    const player = await dbFetch('/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    res.json(dbToPlayer(player));
  } catch (e) {
    if (e.status === 409) return res.status(400).json({ error: 'A player with this name already exists' });
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/players/:id', requireAuth, async (req, res) => {
  try {
    const force = req.query.force === 'true' ? '?force=true' : '';
    const result = await dbFetch(`/players/${req.params.id}${force}`, { method: 'DELETE' });
    res.json(result);
  } catch (e) {
    if (e.status === 409) return res.status(409).json({ error: 'Player has match history' });
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── API: MATCHES ─────────────────────────────────────────────────────────────
app.get('/api/matches', requireAuth, async (req, res) => {
  try {
    const { player } = req.query;
    const url = player ? `/matches?player=${encodeURIComponent(player)}` : '/matches';
    const rows = await dbFetch(url);
    res.json(rows.map(dbToMatch));
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/matches', requireAuth, async (req, res) => {
  const { player1Id, player2Id, sets, note } = req.body;
  if (!player1Id || !player2Id) return res.status(400).json({ error: 'Both players required' });
  if (player1Id === player2Id) return res.status(400).json({ error: 'Players must be different' });

  // Validate players exist
  try {
    await dbFetch(`/players/${player1Id}`);
    await dbFetch(`/players/${player2Id}`);
  } catch (e) {
    return res.status(400).json({ error: 'One or both players not found' });
  }

  if (!Array.isArray(sets) || sets.length === 0) return res.status(400).json({ error: 'At least one set required' });
  if (sets.length > 9) return res.status(400).json({ error: 'Too many sets (max 9)' });

  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    if (!s || typeof s !== 'object') return res.status(400).json({ error: `Set ${i+1}: invalid format` });
    const p1Score = Number(s.p1);
    const p2Score = Number(s.p2);
    if (!Number.isFinite(p1Score) || !Number.isFinite(p2Score) || p1Score < 0 || p2Score < 0 || p1Score > 99 || p2Score > 99) {
      return res.status(400).json({ error: `Set ${i+1}: scores must be numbers between 0 and 99` });
    }
    if (p1Score === p2Score) {
      return res.status(400).json({ error: `Set ${i+1}: scores must be different` });
    }
  }

  const trimmedNote = (note || '').trim();
  if (trimmedNote.length > 500) return res.status(400).json({ error: 'Note too long (max 500 chars)' });

  const winnerId = determineWinner(sets, player1Id, player2Id);

  try {
    const match = await dbFetch('/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: Date.now(),
        player1_id: player1Id,
        player2_id: player2Id,
        sets: JSON.stringify(sets),
        winner_id: winnerId,
        note: trimmedNote,
      }),
    });
    res.json(dbToMatch(match));
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/matches/:id', requireAuth, async (req, res) => {
  try {
    const result = await dbFetch(`/matches/${req.params.id}`, { method: 'DELETE' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
if (TLS_CERT && TLS_KEY) {
  const tlsOptions = {
    cert: fs.readFileSync(TLS_CERT),
    key: fs.readFileSync(TLS_KEY),
  };
  const httpsServer = https.createServer(tlsOptions, app);
  const httpRedirect = http.createServer((req, res) => {
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    const port = PORT == 443 ? '' : `:${PORT}`;
    res.writeHead(301, { Location: `https://${host}${port}${req.url}` });
    res.end();
  });

  // Multiplex HTTP/HTTPS on the same port — peek at the first byte
  // to distinguish TLS handshakes (0x16) from plain HTTP
  net.createServer(socket => {
    socket.once('data', buf => {
      socket.pause();
      socket.unshift(buf);
      (buf[0] === 0x16 ? httpsServer : httpRedirect).emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
  }).listen(PORT, () => {
    console.log(`TT Tracker running at https://localhost:${PORT}`);
    console.log(`HTTP on port ${PORT} redirects to HTTPS`);
    console.log(`Login: ${ADMIN_USER}`);
    console.log(`DB service: ${DB_URL}`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`TT Tracker running at http://localhost:${PORT}`);
    console.log(`Login: ${ADMIN_USER}`);
    console.log(`DB service: ${DB_URL}`);
  });
}
