'use strict';

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const DB_TOKEN = process.env.DB_TOKEN || '';

// ─── UPLOADS DIRECTORY ──────────────────────────────────────────────────────
const uploadsDir = path.resolve(path.dirname(DB_PATH === ':memory:' ? './data.db' : DB_PATH), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

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

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    lat REAL,
    lng REAL,
    image TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  );
`);

// ─── MIGRATIONS ─────────────────────────────────────────────────────────────
const matchCols = db.pragma('table_info(matches)').map(c => c.name);
if (!matchCols.includes('location_id')) {
  db.exec('ALTER TABLE matches ADD COLUMN location_id TEXT');
}
if (!matchCols.includes('creator_id')) {
  db.exec('ALTER TABLE matches ADD COLUMN creator_id TEXT');
}
if (!matchCols.includes('is_doubles')) {
  db.exec('ALTER TABLE matches ADD COLUMN is_doubles INTEGER DEFAULT 0');
}
if (!matchCols.includes('player3_id')) {
  db.exec('ALTER TABLE matches ADD COLUMN player3_id TEXT REFERENCES players(id)');
}
if (!matchCols.includes('player4_id')) {
  db.exec('ALTER TABLE matches ADD COLUMN player4_id TEXT REFERENCES players(id)');
}

const playerCols = db.pragma('table_info(players)').map(c => c.name);
if (!playerCols.includes('elo_rating')) {
  db.exec('ALTER TABLE players ADD COLUMN elo_rating INTEGER DEFAULT 1200');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(id)
  );

  CREATE TABLE IF NOT EXISTS elo_history (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    match_id TEXT NOT NULL REFERENCES matches(id),
    rating_before INTEGER NOT NULL,
    rating_after INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const stmts = {
  getPlayers:         db.prepare('SELECT * FROM players ORDER BY name COLLATE NOCASE'),
  getPlayer:          db.prepare('SELECT * FROM players WHERE id = ?'),
  insertPlayer:       db.prepare('INSERT INTO players (id, name, created_at) VALUES (?, ?, ?)'),
  deletePlayer:       db.prepare('DELETE FROM players WHERE id = ?'),
  deletePlayerMatches: db.prepare('DELETE FROM matches WHERE player1_id = ? OR player2_id = ? OR player3_id = ? OR player4_id = ?'),
  playerHasMatch:     db.prepare('SELECT 1 FROM matches WHERE player1_id = ? OR player2_id = ? OR player3_id = ? OR player4_id = ? LIMIT 1'),
  getMatch:           db.prepare('SELECT * FROM matches WHERE id = ?'),
  getMatches:         db.prepare('SELECT * FROM matches ORDER BY date DESC'),
  getMatchesByPlayer: db.prepare('SELECT * FROM matches WHERE player1_id = ? OR player2_id = ? OR player3_id = ? OR player4_id = ? ORDER BY date DESC'),
  insertMatch:        db.prepare('INSERT INTO matches (id, date, player1_id, player2_id, sets, winner_id, note, location_id, creator_id, is_doubles, player3_id, player4_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  updateMatch:        db.prepare('UPDATE matches SET sets = ?, winner_id = ?, note = ?, location_id = ?, is_doubles = ?, player3_id = ?, player4_id = ? WHERE id = ?'),
  deleteMatch:        db.prepare('DELETE FROM matches WHERE id = ?'),
  // Comments
  getCommentsByMatch: db.prepare('SELECT * FROM comments WHERE match_id = ? ORDER BY created_at ASC'),
  getComment:         db.prepare('SELECT * FROM comments WHERE id = ?'),
  insertComment:      db.prepare('INSERT INTO comments (id, match_id, user_id, username, text, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  deleteComment:      db.prepare('DELETE FROM comments WHERE id = ?'),
  deleteCommentsByMatch: db.prepare('DELETE FROM comments WHERE match_id = ?'),
  // Users
  getUsers:           db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at'),
  getUser:            db.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByUsername:   db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  insertUser:         db.prepare('INSERT INTO users (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)'),
  updateUserPassword: db.prepare('UPDATE users SET password = ? WHERE id = ?'),
  deleteUser:         db.prepare('DELETE FROM users WHERE id = ?'),
  countUsers:         db.prepare('SELECT COUNT(*) as count FROM users'),
  // Locations
  getLocations:       db.prepare('SELECT * FROM locations ORDER BY name COLLATE NOCASE'),
  getLocation:        db.prepare('SELECT * FROM locations WHERE id = ?'),
  insertLocation:     db.prepare('INSERT INTO locations (id, name, lat, lng, image, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  updateLocation:     db.prepare('UPDATE locations SET name = ?, lat = ?, lng = ? WHERE id = ?'),
  deleteLocation:     db.prepare('DELETE FROM locations WHERE id = ?'),
  locationHasMatch:   db.prepare('SELECT 1 FROM matches WHERE location_id = ? LIMIT 1'),
  clearLocationFromMatches: db.prepare('UPDATE matches SET location_id = NULL WHERE location_id = ?'),
  // ELO
  resetAllElo:        db.prepare('UPDATE players SET elo_rating = 1200'),
  updatePlayerElo:    db.prepare('UPDATE players SET elo_rating = ? WHERE id = ?'),
  insertEloHistory:   db.prepare('INSERT INTO elo_history (id, player_id, match_id, rating_before, rating_after, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  deleteAllEloHistory: db.prepare('DELETE FROM elo_history'),
  getEloHistoryByPlayer: db.prepare('SELECT * FROM elo_history WHERE player_id = ? ORDER BY created_at ASC'),
  getAllMatchesByDate: db.prepare('SELECT * FROM matches ORDER BY date ASC'),
};

function generateId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

// ─── EXPRESS APP ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '500kb' }));

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
  if (stmts.playerHasMatch.get(id, id, id, id)) {
    if (!force) return res.status(409).json({ error: 'Player has matches' });
    // Clean up elo_history and comments for affected matches before deleting them
    const matches = db.prepare('SELECT id FROM matches WHERE player1_id = ? OR player2_id = ? OR player3_id = ? OR player4_id = ?').all(id, id, id, id);
    for (const m of matches) {
      stmts.deleteCommentsByMatch.run(m.id);
      db.prepare('DELETE FROM elo_history WHERE match_id = ?').run(m.id);
    }
    // Also clean up elo_history for this player (from other matches)
    db.prepare('DELETE FROM elo_history WHERE player_id = ?').run(id);
    stmts.deletePlayerMatches.run(id, id, id, id);
  }
  stmts.deletePlayer.run(id);
  res.json({ ok: true });
});

// ─── MATCHES ──────────────────────────────────────────────────────────────────
app.get('/matches', (req, res) => {
  const { player } = req.query;
  const rows = player
    ? stmts.getMatchesByPlayer.all(player, player, player, player)
    : stmts.getMatches.all();
  res.json(rows);
});

app.get('/matches/:id', (req, res) => {
  const row = stmts.getMatch.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Match not found' });
  res.json(row);
});

app.post('/matches', (req, res) => {
  const { date, player1_id, player2_id, sets, winner_id, note, location_id, creator_id, is_doubles, player3_id, player4_id } = req.body;
  const id = generateId('m');
  try {
    stmts.insertMatch.run(id, date, player1_id, player2_id, sets, winner_id, note || '', location_id || null, creator_id || null, is_doubles ? 1 : 0, player3_id || null, player4_id || null);
    res.json(stmts.getMatch.get(id));
  } catch (e) {
    console.error('Insert match error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/matches/:id', (req, res) => {
  const { id } = req.params;
  const row = stmts.getMatch.get(id);
  if (!row) return res.status(404).json({ error: 'Match not found' });
  const { sets, winner_id, note, location_id, is_doubles, player3_id, player4_id } = req.body;
  try {
    stmts.updateMatch.run(
      sets ?? row.sets,
      winner_id !== undefined ? winner_id : row.winner_id,
      note !== undefined ? note : row.note,
      location_id !== undefined ? location_id : row.location_id,
      is_doubles !== undefined ? (is_doubles ? 1 : 0) : row.is_doubles,
      player3_id !== undefined ? (player3_id || null) : row.player3_id,
      player4_id !== undefined ? (player4_id || null) : row.player4_id,
      id
    );
    res.json(stmts.getMatch.get(id));
  } catch (e) {
    console.error('Update match error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/matches/:id', (req, res) => {
  stmts.deleteCommentsByMatch.run(req.params.id);
  db.prepare('DELETE FROM elo_history WHERE match_id = ?').run(req.params.id);
  stmts.deleteMatch.run(req.params.id);
  res.json({ ok: true });
});

// ─── COMMENTS ───────────────────────────────────────────────────────────────
app.get('/matches/:id/comments', (req, res) => {
  res.json(stmts.getCommentsByMatch.all(req.params.id));
});

app.post('/matches/:id/comments', (req, res) => {
  const match = stmts.getMatch.get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  const { user_id, username, text } = req.body;
  const id = generateId('c');
  try {
    stmts.insertComment.run(id, req.params.id, user_id, username, text, Date.now());
    res.json(stmts.getComment.get(id));
  } catch (e) {
    console.error('Insert comment error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/comments/:id', (req, res) => {
  const comment = stmts.getComment.get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  stmts.deleteComment.run(req.params.id);
  res.json({ ok: true });
});

// ─── LOCATIONS ───────────────────────────────────────────────────────────────
app.get('/locations', (req, res) => {
  res.json(stmts.getLocations.all());
});

app.get('/locations/:id', (req, res) => {
  const row = stmts.getLocation.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Location not found' });
  res.json(row);
});

app.post('/locations', (req, res) => {
  const { name, lat, lng } = req.body;
  const id = generateId('loc');
  try {
    stmts.insertLocation.run(id, name, lat ?? null, lng ?? null, '', Date.now());
    res.json(stmts.getLocation.get(id));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'UNIQUE constraint' });
    console.error('Insert location error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/locations/:id', (req, res) => {
  const { id } = req.params;
  const row = stmts.getLocation.get(id);
  if (!row) return res.status(404).json({ error: 'Location not found' });
  const { name, lat, lng } = req.body;
  try {
    stmts.updateLocation.run(name ?? row.name, lat ?? row.lat, lng ?? row.lng, id);
    res.json(stmts.getLocation.get(id));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'UNIQUE constraint' });
    console.error('Update location error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/locations/:id', (req, res) => {
  const { id } = req.params;
  const force = req.query.force === 'true';
  if (stmts.locationHasMatch.get(id)) {
    if (!force) return res.status(409).json({ error: 'Location has matches' });
    stmts.clearLocationFromMatches.run(id);
  }
  stmts.deleteLocation.run(id);
  res.json({ ok: true });
});

app.post('/locations/:id/image', (req, res) => {
  const row = stmts.getLocation.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Location not found' });
  const { data } = req.body;
  if (!data || typeof data !== 'string') return res.status(400).json({ error: 'Image data required' });
  try {
    const buf = Buffer.from(data, 'base64');
    const filePath = path.join(uploadsDir, `${req.params.id}.jpg`);
    fs.writeFileSync(filePath, buf);
    db.prepare('UPDATE locations SET image = ? WHERE id = ?').run('uploaded', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Image upload error:', e.message);
    res.status(500).json({ error: 'Image upload failed' });
  }
});

app.get('/locations/:id/image', (req, res) => {
  const filePath = path.join(uploadsDir, `${req.params.id}.jpg`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Image not found' });
  res.type('image/jpeg').sendFile(filePath);
});

app.delete('/locations/:id/image', (req, res) => {
  const filePath = path.join(uploadsDir, `${req.params.id}.jpg`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('UPDATE locations SET image = ? WHERE id = ?').run('', req.params.id);
  res.json({ ok: true });
});

// ─── ELO ────────────────────────────────────────────────────────────────────
const { calculateMatchElo } = require('./lib/helpers');

app.get('/elo/history/:playerId', (req, res) => {
  res.json(stmts.getEloHistoryByPlayer.all(req.params.playerId));
});

app.post('/elo/recalculate', (req, res) => {
  try {
    // Reset all ELO to 1200
    stmts.resetAllElo.run();
    stmts.deleteAllEloHistory.run();

    // Fetch all matches ordered by date ASC
    const matches = stmts.getAllMatchesByDate.all();

    // Build a ratings map from all players
    const players = stmts.getPlayers.all();
    const ratings = {};
    for (const p of players) ratings[p.id] = 1200;

    // Process each match
    for (const match of matches) {
      if (!match.winner_id) continue; // skip draws — no ELO change

      const entries = calculateMatchElo(match, ratings);
      for (const entry of entries) {
        ratings[entry.playerId] = entry.ratingAfter;
        stmts.insertEloHistory.run(
          generateId('elo'),
          entry.playerId,
          match.id,
          entry.ratingBefore,
          entry.ratingAfter,
          match.date.toString()
        );
      }
    }

    // Update player ratings
    for (const [playerId, rating] of Object.entries(ratings)) {
      stmts.updatePlayerElo.run(rating, playerId);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('ELO recalculate error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── USERS ───────────────────────────────────────────────────────────────────
app.get('/users', (req, res) => {
  res.json(stmts.getUsers.all());
});

app.get('/users/count', (req, res) => {
  res.json(stmts.countUsers.get());
});

app.get('/users/by-username/:username', (req, res) => {
  const row = stmts.getUserByUsername.get(req.params.username);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json(row);
});

app.post('/users', (req, res) => {
  const { username, password, role } = req.body;
  const id = generateId('u');
  try {
    stmts.insertUser.run(id, username, password, role || 'user', Date.now());
    const user = stmts.getUser.get(id);
    res.json({ id: user.id, username: user.username, role: user.role, created_at: user.created_at });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'UNIQUE constraint' });
    console.error('Insert user error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/users/:id/password', (req, res) => {
  const { password } = req.body;
  const user = stmts.getUser.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  stmts.updateUserPassword.run(password, req.params.id);
  res.json({ ok: true });
});

app.delete('/users/:id', (req, res) => {
  const user = stmts.getUser.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  stmts.deleteUser.run(req.params.id);
  res.json({ ok: true });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`DB service running on port ${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
