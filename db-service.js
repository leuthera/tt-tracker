'use strict';

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const DB_TOKEN = process.env.DB_TOKEN || '';

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

const stmts = {
  getPlayers:         db.prepare('SELECT * FROM players ORDER BY name COLLATE NOCASE'),
  getPlayer:          db.prepare('SELECT * FROM players WHERE id = ?'),
  insertPlayer:       db.prepare('INSERT INTO players (id, name, created_at) VALUES (?, ?, ?)'),
  deletePlayer:       db.prepare('DELETE FROM players WHERE id = ?'),
  deletePlayerMatches: db.prepare('DELETE FROM matches WHERE player1_id = ? OR player2_id = ?'),
  playerHasMatch:     db.prepare('SELECT 1 FROM matches WHERE player1_id = ? OR player2_id = ? LIMIT 1'),
  getMatch:           db.prepare('SELECT * FROM matches WHERE id = ?'),
  getMatches:         db.prepare('SELECT * FROM matches ORDER BY date DESC'),
  getMatchesByPlayer: db.prepare('SELECT * FROM matches WHERE player1_id = ? OR player2_id = ? ORDER BY date DESC'),
  insertMatch:        db.prepare('INSERT INTO matches (id, date, player1_id, player2_id, sets, winner_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  deleteMatch:        db.prepare('DELETE FROM matches WHERE id = ?'),
};

function generateId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

// ─── EXPRESS APP ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '100kb' }));

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
if (DB_TOKEN) {
  app.use((req, res, next) => {
    if (req.path === '/healthz') return next();
    const auth = req.get('authorization');
    if (auth === `Bearer ${DB_TOKEN}`) return next();
    res.status(401).json({ error: 'Unauthorized' });
  });
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// ─── PLAYERS ──────────────────────────────────────────────────────────────────
app.get('/players', (req, res) => {
  res.json(stmts.getPlayers.all());
});

app.get('/players/:id', (req, res) => {
  const row = stmts.getPlayer.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Player not found' });
  res.json(row);
});

app.post('/players', (req, res) => {
  const { name } = req.body;
  const id = generateId('p');
  try {
    stmts.insertPlayer.run(id, name, Date.now());
    res.json(stmts.getPlayer.get(id));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'UNIQUE constraint' });
    console.error('Insert player error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/players/:id', (req, res) => {
  const { id } = req.params;
  const force = req.query.force === 'true';
  if (stmts.playerHasMatch.get(id, id)) {
    if (!force) return res.status(409).json({ error: 'Player has matches' });
    stmts.deletePlayerMatches.run(id, id);
  }
  stmts.deletePlayer.run(id);
  res.json({ ok: true });
});

// ─── MATCHES ──────────────────────────────────────────────────────────────────
app.get('/matches', (req, res) => {
  const { player } = req.query;
  const rows = player
    ? stmts.getMatchesByPlayer.all(player, player)
    : stmts.getMatches.all();
  res.json(rows);
});

app.get('/matches/:id', (req, res) => {
  const row = stmts.getMatch.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Match not found' });
  res.json(row);
});

app.post('/matches', (req, res) => {
  const { date, player1_id, player2_id, sets, winner_id, note } = req.body;
  const id = generateId('m');
  try {
    stmts.insertMatch.run(id, date, player1_id, player2_id, sets, winner_id, note || '');
    res.json(stmts.getMatch.get(id));
  } catch (e) {
    console.error('Insert match error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/matches/:id', (req, res) => {
  stmts.deleteMatch.run(req.params.id);
  res.json({ ok: true });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`DB service running on port ${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
