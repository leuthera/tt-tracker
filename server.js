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
 * USER ACCOUNTS:
 *   On first startup, set ADMIN_USER and ADMIN_PASS env vars to seed the
 *   initial admin account. After that, manage users through the admin UI.
 *   Roles: "admin" (full access) and "user" (read/write, no delete).
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
const { hashPassword, verifyPassword, dbToPlayer, dbToMatch, dbToComment, dbToLocation, dbToUser, dbToEloHistory, determineWinner } = require('./lib/helpers');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;
const BUILD_SHA = process.env.BUILD_SHA || 'dev';
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

async function recalculateElo() {
  await dbFetch('/elo/recalculate', { method: 'POST' });
}

// ─── EXPRESS APP ──────────────────────────────────────────────────────────────
const app = express();

app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: false, limit: '500kb' }));

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

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required' });
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
      <p><span class="lang-en">Sign in to continue</span><span class="lang-de" style="display:none">Anmelden um fortzufahren</span></p>
    </div>
    {{ERROR}}
    <form method="POST" action="/login">
      <label for="username"><span class="lang-en">Username</span><span class="lang-de" style="display:none">Benutzername</span></label>
      <input type="text" id="username" name="username" autocomplete="username"
             autocapitalize="off" required placeholder="Enter username">
      <label for="password"><span class="lang-en">Password</span><span class="lang-de" style="display:none">Passwort</span></label>
      <input type="password" id="password" name="password" autocomplete="current-password"
             required placeholder="Enter password">
      <button type="submit"><span class="lang-en">Sign In</span><span class="lang-de" style="display:none">Anmelden</span></button>
    </form>
  </div>
  <script>
    (function() {
      var saved = localStorage.getItem('theme');
      var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      var lang = localStorage.getItem('lang') || 'en';
      if (lang === 'de') {
        document.querySelectorAll('.lang-en').forEach(function(el) { el.style.display = 'none'; });
        document.querySelectorAll('.lang-de').forEach(function(el) { el.style.display = ''; });
        document.getElementById('username').placeholder = 'Benutzername eingeben';
        document.getElementById('password').placeholder = 'Passwort eingeben';
      }
    })();
  </script>
</body>
</html>`;

app.get('/login', (req, res) => {
  if (req.session.loggedIn) return res.redirect('/');
  res.send(loginHTML.replace('{{ERROR}}', ''));
});

app.post('/login', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress;
  if (!checkLoginRateLimit(clientIp)) {
    console.warn(`Rate-limited login attempt from ${clientIp}`);
    return res.status(429).send(loginHTML.replace('{{ERROR}}',
      '<div class="error"><span class="lang-en">Too many login attempts. Please try again later.</span><span class="lang-de" style="display:none">Zu viele Anmeldeversuche. Bitte sp\u00e4ter erneut versuchen.</span></div>'));
  }

  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string') {
    console.warn(`Failed login from ${clientIp}: missing fields`);
    return res.send(loginHTML.replace('{{ERROR}}',
      '<div class="error"><span class="lang-en">Invalid username or password</span><span class="lang-de" style="display:none">Ung\u00fcltiger Benutzername oder Passwort</span></div>'));
  }

  try {
    const user = await dbFetch(`/users/by-username/${encodeURIComponent(username)}`);
    if (!verifyPassword(password, user.password)) {
      console.warn(`Failed login from ${clientIp}: user="${username}"`);
      return res.send(loginHTML.replace('{{ERROR}}',
        '<div class="error"><span class="lang-en">Invalid username or password</span><span class="lang-de" style="display:none">Ung\u00fcltiger Benutzername oder Passwort</span></div>'));
    }
    req.session.loggedIn = true;
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.redirect('/');
  } catch (e) {
    console.warn(`Failed login from ${clientIp}: user="${username}"`);
    return res.send(loginHTML.replace('{{ERROR}}',
      '<div class="error"><span class="lang-en">Invalid username or password</span><span class="lang-de" style="display:none">Ung\u00fcltiger Benutzername oder Passwort</span></div>'));
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// ─── VERSION ──────────────────────────────────────────────────────────────────
app.get('/api/version', (req, res) => {
  res.json({ sha: BUILD_SHA });
});

// ─── CLIENT ERROR LOGGING ────────────────────────────────────────────────────
const clientErrorCounts = new Map(); // sessionId -> { count, resetAt }
const CLIENT_ERROR_RATE_LIMIT = 20;

app.post('/api/client-errors', requireAuth, (req, res) => {
  // Rate limit per session
  const sid = req.sessionID;
  const now = Date.now();
  const entry = clientErrorCounts.get(sid);
  if (!entry || now > entry.resetAt) {
    clientErrorCounts.set(sid, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
  } else {
    entry.count++;
    if (entry.count > CLIENT_ERROR_RATE_LIMIT) {
      return res.json({ ok: true });
    }
  }

  const { message, stack, url, line, col, userAgent } = req.body;
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const safeMsg = message.slice(0, 1000);
  const safeStack = typeof stack === 'string' ? stack.slice(0, 4000) : '';
  const safeUrl = typeof url === 'string' ? url.slice(0, 500) : '';
  const safeLine = typeof line === 'number' ? line : '';
  const safeCol = typeof col === 'number' ? col : '';
  const safeUA = typeof userAgent === 'string' ? userAgent.slice(0, 300) : '';

  console.error(`[CLIENT ERROR] user=${req.session.username} url=${safeUrl} line=${safeLine} col=${safeCol} ua=${safeUA} message=${safeMsg}${safeStack ? '\n' + safeStack : ''}`);
  res.json({ ok: true });
});

// Clean up stale client error entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of clientErrorCounts) {
    if (now > entry.resetAt) clientErrorCounts.delete(sid);
  }
}, RATE_LIMIT_WINDOW).unref();

// ─── PWA STATIC FILES (before auth) ──────────────────────────────────────────
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));
app.get('/icon.svg', (req, res) => res.sendFile(path.join(__dirname, 'icon.svg')));
app.get('/sw.js', (req, res) => res.sendFile(path.join(__dirname, 'sw.js')));

// ─── SERVE APP ────────────────────────────────────────────────────────────────
const indexHTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
  .replace('/css/styles.css', `/css/styles.css?v=${BUILD_SHA}`)
  .replace('js/app.js', `js/app.js?v=${BUILD_SHA}`);

app.get('/', requireAuth, (req, res) => {
  res.type('html').send(indexHTML);
});
app.use('/css', requireAuth, express.static(path.join(__dirname, 'css')));
app.use('/js', requireAuth, express.static(path.join(__dirname, 'js')));

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

app.delete('/api/players/:id', requireAuth, requireAdmin, async (req, res) => {
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
  const { player1Id, player2Id, sets, note, locationId, isDoubles, player3Id, player4Id } = req.body;
  if (!player1Id || !player2Id) return res.status(400).json({ error: 'Both players required' });
  if (player1Id === player2Id) return res.status(400).json({ error: 'Players must be different' });

  // Doubles validation
  if (isDoubles) {
    if (!player3Id || !player4Id) return res.status(400).json({ error: 'All four players required for doubles' });
    const allIds = [player1Id, player2Id, player3Id, player4Id];
    if (new Set(allIds).size !== 4) return res.status(400).json({ error: 'All four players must be different' });
  }

  // Validate players exist
  try {
    await dbFetch(`/players/${player1Id}`);
    await dbFetch(`/players/${player2Id}`);
    if (isDoubles) {
      await dbFetch(`/players/${player3Id}`);
      await dbFetch(`/players/${player4Id}`);
    }
  } catch (e) {
    return res.status(400).json({ error: 'One or more players not found' });
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
        location_id: locationId || null,
        creator_id: req.session.userId,
        is_doubles: isDoubles ? 1 : 0,
        player3_id: player3Id || null,
        player4_id: player4Id || null,
      }),
    });
    recalculateElo().catch(e => console.error('ELO recalculate error:', e.message));
    res.json(dbToMatch(match));
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/matches/:id', requireAuth, async (req, res) => {
  // Fetch existing match
  let existing;
  try {
    existing = await dbFetch(`/matches/${req.params.id}`);
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: 'Match not found' });
    return res.status(500).json({ error: 'Database error' });
  }

  // Auth: creator or admin
  const isCreator = existing.creator_id && existing.creator_id === req.session.userId;
  const isAdmin = req.session.role === 'admin';
  if (!isCreator && !isAdmin) return res.status(403).json({ error: 'Not authorized to edit this match' });

  const { sets, note, locationId, isDoubles, player3Id, player4Id } = req.body;

  // Doubles validation if switching to doubles
  const finalIsDoubles = isDoubles !== undefined ? isDoubles : !!existing.is_doubles;
  if (finalIsDoubles) {
    const p3 = player3Id !== undefined ? player3Id : existing.player3_id;
    const p4 = player4Id !== undefined ? player4Id : existing.player4_id;
    if (!p3 || !p4) return res.status(400).json({ error: 'All four players required for doubles' });
    const allIds = [existing.player1_id, existing.player2_id, p3, p4];
    if (new Set(allIds).size !== 4) return res.status(400).json({ error: 'All four players must be different' });
  }

  // Validate sets if provided
  if (sets !== undefined) {
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
  }

  if (note !== undefined) {
    const trimmedNote = (note || '').trim();
    if (trimmedNote.length > 500) return res.status(400).json({ error: 'Note too long (max 500 chars)' });
  }

  // Recalculate winner if sets changed
  const finalSets = sets || JSON.parse(existing.sets);
  const winnerId = determineWinner(finalSets, existing.player1_id, existing.player2_id);

  try {
    const match = await dbFetch(`/matches/${req.params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sets: sets ? JSON.stringify(sets) : existing.sets,
        winner_id: winnerId,
        note: note !== undefined ? (note || '').trim() : existing.note,
        location_id: locationId !== undefined ? (locationId || null) : existing.location_id,
        is_doubles: isDoubles !== undefined ? (isDoubles ? 1 : 0) : undefined,
        player3_id: player3Id !== undefined ? (player3Id || null) : undefined,
        player4_id: player4Id !== undefined ? (player4Id || null) : undefined,
      }),
    });
    recalculateElo().catch(e => console.error('ELO recalculate error:', e.message));
    res.json(dbToMatch(match));
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/matches/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await dbFetch(`/matches/${req.params.id}`, { method: 'DELETE' });
    recalculateElo().catch(e => console.error('ELO recalculate error:', e.message));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── API: COMMENTS ──────────────────────────────────────────────────────────
app.get('/api/matches/:id/comments', requireAuth, async (req, res) => {
  try {
    const rows = await dbFetch(`/matches/${req.params.id}/comments`);
    res.json(rows.map(dbToComment));
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/matches/:id/comments', requireAuth, async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment text is required' });
  if (text.length > 500) return res.status(400).json({ error: 'Comment too long (max 500 chars)' });

  try {
    const comment = await dbFetch(`/matches/${req.params.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: req.session.userId,
        username: req.session.username,
        text,
      }),
    });
    res.json(dbToComment(comment));
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: 'Match not found' });
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/comments/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await dbFetch(`/comments/${req.params.id}`, { method: 'DELETE' });
    res.json(result);
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: 'Comment not found' });
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── API: ELO HISTORY ────────────────────────────────────────────────────────
app.get('/api/players/:id/elo-history', requireAuth, async (req, res) => {
  try {
    const rows = await dbFetch(`/elo/history/${req.params.id}`);
    res.json(rows.map(dbToEloHistory));
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── API: LOCATIONS ──────────────────────────────────────────────────────────
app.get('/api/locations', requireAuth, async (req, res) => {
  try {
    const rows = await dbFetch('/locations');
    res.json(rows.map(dbToLocation));
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/locations', requireAuth, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name cannot be empty' });
  if (name.length > 60) return res.status(400).json({ error: 'Name too long (max 60 chars)' });

  const lat = req.body.lat != null ? Number(req.body.lat) : null;
  const lng = req.body.lng != null ? Number(req.body.lng) : null;
  if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) return res.status(400).json({ error: 'Invalid latitude' });
  if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) return res.status(400).json({ error: 'Invalid longitude' });

  try {
    const loc = await dbFetch('/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, lat, lng }),
    });
    res.json(dbToLocation(loc));
  } catch (e) {
    if (e.status === 409) return res.status(400).json({ error: 'A location with this name already exists' });
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/locations/:id', requireAuth, async (req, res) => {
  const name = req.body.name != null ? (req.body.name || '').trim() : undefined;
  if (name !== undefined && !name) return res.status(400).json({ error: 'Name cannot be empty' });
  if (name && name.length > 60) return res.status(400).json({ error: 'Name too long (max 60 chars)' });

  const lat = req.body.lat !== undefined ? (req.body.lat != null ? Number(req.body.lat) : null) : undefined;
  const lng = req.body.lng !== undefined ? (req.body.lng != null ? Number(req.body.lng) : null) : undefined;

  try {
    const loc = await dbFetch(`/locations/${req.params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, lat, lng }),
    });
    res.json(dbToLocation(loc));
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: 'Location not found' });
    if (e.status === 409) return res.status(400).json({ error: 'A location with this name already exists' });
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/locations/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const force = req.query.force === 'true' ? '?force=true' : '';
    const result = await dbFetch(`/locations/${req.params.id}${force}`, { method: 'DELETE' });
    res.json(result);
  } catch (e) {
    if (e.status === 409) return res.status(409).json({ error: 'Location has matches' });
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/locations/:id/image', requireAuth, async (req, res) => {
  const { data } = req.body;
  if (!data || typeof data !== 'string') return res.status(400).json({ error: 'Image data required' });
  if (data.length > 700000) return res.status(400).json({ error: 'Image too large (max ~500KB)' });
  try {
    const result = await dbFetch(`/locations/${req.params.id}/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    res.json(result);
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: 'Location not found' });
    res.status(500).json({ error: 'Image upload failed' });
  }
});

app.get('/api/locations/:id/image', requireAuth, async (req, res) => {
  try {
    const response = await fetch(`${DB_URL}/locations/${req.params.id}/image`, {
      headers: { ...dbHeaders },
    });
    if (!response.ok) return res.status(response.status).json({ error: 'Image not found' });
    res.type('image/jpeg');
    const buf = Buffer.from(await response.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load image' });
  }
});

app.delete('/api/locations/:id/image', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await dbFetch(`/locations/${req.params.id}/image`, { method: 'DELETE' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// ─── API: CURRENT USER ────────────────────────────────────────────────────────
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ userId: req.session.userId, username: req.session.username, role: req.session.role });
});

app.put('/api/me/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (typeof newPassword !== 'string' || newPassword.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  try {
    const user = await dbFetch(`/users/by-username/${encodeURIComponent(req.session.username)}`);
    if (!verifyPassword(currentPassword, user.password)) {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }
    const hashed = hashPassword(newPassword);
    await dbFetch(`/users/${user.id}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: hashed }),
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ─── API: USER MANAGEMENT (admin only) ───────────────────────────────────────
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await dbFetch('/users');
    res.json(rows.map(dbToUser));
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (typeof username !== 'string' || username.trim().length === 0) return res.status(400).json({ error: 'Username cannot be empty' });
  if (username.length > 30) return res.status(400).json({ error: 'Username too long (max 30 chars)' });
  if (typeof password !== 'string' || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const userRole = role === 'admin' ? 'admin' : 'user';

  try {
    const hashed = hashPassword(password);
    const trimmed = username.trim();
    const user = await dbFetch('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: trimmed, password: hashed, role: userRole }),
    });
    // Auto-create a matching player (ignore if one already exists)
    try {
      await dbFetch('/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
    } catch (_) { /* player may already exist — that's fine */ }
    res.json(dbToUser(user));
  } catch (e) {
    if (e.status === 409) return res.status(400).json({ error: 'A user with this username already exists' });
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/users/:id/password', requireAuth, requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  try {
    const hashed = hashPassword(password);
    await dbFetch(`/users/${req.params.id}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: hashed }),
    });
    res.json({ ok: true });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: 'User not found' });
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  if (req.params.id === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  try {
    await dbFetch(`/users/${req.params.id}`, { method: 'DELETE' });
    res.json({ ok: true });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: 'User not found' });
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── ADMIN BOOTSTRAP ──────────────────────────────────────────────────────────
async function bootstrapAdmin(retries = 10, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { count } = await dbFetch('/users/count');
      if (count === 0) {
        if (!ADMIN_PASS) {
          console.error('ERROR: ADMIN_PASS environment variable is required for initial admin setup');
          process.exit(1);
        }
        const hashed = hashPassword(ADMIN_PASS);
        await dbFetch('/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: ADMIN_USER, password: hashed, role: 'admin' }),
        });
        // Auto-create a matching player for the admin
        try {
          await dbFetch('/players', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: ADMIN_USER }),
          });
        } catch (_) { /* player may already exist */ }
        console.log(`Admin user "${ADMIN_USER}" created`);
      }
      return;
    } catch (e) {
      if (attempt < retries) {
        console.log(`Waiting for db-service... (attempt ${attempt}/${retries})`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        console.error('Failed to bootstrap admin user:', e.message);
        process.exit(1);
      }
    }
  }
}

// ─── START ────────────────────────────────────────────────────────────────────
async function start() {
  await bootstrapAdmin();

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
      console.log(`DB service: ${DB_URL}`);
    });
  } else {
    app.listen(PORT, () => {
      console.log(`TT Tracker running at http://localhost:${PORT}`);
      console.log(`DB service: ${DB_URL}`);
    });
  }
}

start();
