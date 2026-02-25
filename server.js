/*
 * ============================================================
 * TT Tracker — Table Tennis Match Tracker
 * ============================================================
 *
 * A lightweight web app for tracking table tennis matches,
 * player stats, and head-to-head records.
 *
 * PREREQUISITES:
 *   - Node.js 18+ (uses built-in crypto)
 *   - npm (for installing dependencies)
 *
 * SETUP & RUN:
 *   cd /path/to/tt-tracker
 *   npm install            # installs express, express-session, better-sqlite3
 *   node server.js         # starts on http://localhost:8000
 *
 * DEFAULT LOGIN:
 *   Set ADMIN_USER and ADMIN_PASS environment variables
 *
 * DATA:
 *   All data is stored in a SQLite file (data.db) in this directory.
 *   Back up this file to preserve your match history.
 *
 * FILES:
 *   server.js   — Express server: auth, sessions, REST API, SQLite
 *   index.html  — Single-page mobile-first frontend (served at /)
 * ============================================================
 */

'use strict';

const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ─── PASSWORD HASHING ────────────────────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const buf = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(buf, Buffer.from(hash, 'hex'));
}

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
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

// ─── DATABASE ─────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    date INTEGER NOT NULL,
    player1_id TEXT NOT NULL,
    player2_id TEXT NOT NULL,
    sets TEXT NOT NULL,
    winner_id TEXT,
    note TEXT DEFAULT '',
    FOREIGN KEY (player1_id) REFERENCES players(id),
    FOREIGN KEY (player2_id) REFERENCES players(id)
  );
`);

// Prepared statements
const stmts = {
  getPlayers:      db.prepare('SELECT * FROM players ORDER BY name COLLATE NOCASE'),
  getPlayer:       db.prepare('SELECT * FROM players WHERE id = ?'),
  insertPlayer:    db.prepare('INSERT INTO players (id, name, created_at) VALUES (?, ?, ?)'),
  deletePlayer:    db.prepare('DELETE FROM players WHERE id = ?'),
  playerHasMatch:  db.prepare('SELECT 1 FROM matches WHERE player1_id = ? OR player2_id = ? LIMIT 1'),
  getMatch:        db.prepare('SELECT * FROM matches WHERE id = ?'),
  getMatches:      db.prepare('SELECT * FROM matches ORDER BY date DESC'),
  getMatchesByPlayer: db.prepare('SELECT * FROM matches WHERE player1_id = ? OR player2_id = ? ORDER BY date DESC'),
  insertMatch:     db.prepare('INSERT INTO matches (id, date, player1_id, player2_id, sets, winner_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  deleteMatch:     db.prepare('DELETE FROM matches WHERE id = ?'),
};

function generateId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

// ─── EXPRESS APP ──────────────────────────────────────────────────────────────
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

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
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string') {
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

// ─── API: PLAYERS ─────────────────────────────────────────────────────────────
app.get('/api/players', requireAuth, (req, res) => {
  res.json(stmts.getPlayers.all().map(dbToPlayer));
});

app.post('/api/players', requireAuth, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name cannot be empty' });
  if (name.length > 30) return res.status(400).json({ error: 'Name too long (max 30 chars)' });

  const id = generateId('p');
  try {
    stmts.insertPlayer.run(id, name, Date.now());
    res.json(dbToPlayer(stmts.getPlayer.get(id)));
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'A player with this name already exists' });
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/players/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  if (stmts.playerHasMatch.get(id, id)) {
    return res.status(400).json({ error: 'Cannot delete a player who has match history' });
  }
  stmts.deletePlayer.run(id);
  res.json({ ok: true });
});

// ─── API: MATCHES ─────────────────────────────────────────────────────────────
app.get('/api/matches', requireAuth, (req, res) => {
  const { player } = req.query;
  const rows = player
    ? stmts.getMatchesByPlayer.all(player, player)
    : stmts.getMatches.all();
  res.json(rows.map(dbToMatch));
});

app.post('/api/matches', requireAuth, (req, res) => {
  const { player1Id, player2Id, sets, note } = req.body;
  if (!player1Id || !player2Id) return res.status(400).json({ error: 'Both players required' });
  if (player1Id === player2Id) return res.status(400).json({ error: 'Players must be different' });
  if (!stmts.getPlayer.get(player1Id) || !stmts.getPlayer.get(player2Id)) {
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

  const winnerId = determineWinner(sets, player1Id, player2Id);
  const id = generateId('m');
  stmts.insertMatch.run(id, Date.now(), player1Id, player2Id, JSON.stringify(sets), winnerId, (note || '').trim());
  res.json(dbToMatch(stmts.getMatch.get(id)));
});

app.delete('/api/matches/:id', requireAuth, (req, res) => {
  stmts.deleteMatch.run(req.params.id);
  res.json({ ok: true });
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function dbToPlayer(row) {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

function dbToMatch(row) {
  return {
    id: row.id, date: row.date,
    player1Id: row.player1_id, player2Id: row.player2_id,
    sets: JSON.parse(row.sets),
    winnerId: row.winner_id || null,
    note: row.note || ''
  };
}

function countSetWins(sets) {
  return sets.reduce((acc, s) => {
    if (Number(s.p1) > Number(s.p2)) acc.p1++;
    else if (Number(s.p2) > Number(s.p1)) acc.p2++;
    return acc;
  }, { p1: 0, p2: 0 });
}

function determineWinner(sets, p1Id, p2Id) {
  const { p1, p2 } = countSetWins(sets);
  if (p1 > p2) return p1Id;
  if (p2 > p1) return p2Id;
  return null;
}

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`TT Tracker running at http://localhost:${PORT}`);
  console.log(`Login: ${ADMIN_USER}`);
  console.log(`Database: ${DB_PATH}`);
});
