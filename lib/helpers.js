'use strict';

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

// ─── DB ROW TRANSFORMERS ─────────────────────────────────────────────────────
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

// ─── WINNER DETERMINATION ────────────────────────────────────────────────────
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

function dbToUser(row) {
  return { id: row.id, username: row.username, role: row.role, createdAt: row.created_at };
}

// ─── CSV HELPERS ────────────────────────────────────────────────────────────
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

module.exports = {
  hashPassword,
  verifyPassword,
  dbToPlayer,
  dbToMatch,
  dbToUser,
  countSetWins,
  determineWinner,
  csvEscape,
};
