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

// ─── ELO RATING FUNCTIONS ────────────────────────────────────────────────────
function eloExpected(rating, opponentRating) {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

function eloChange(rating, opponentRating, actualScore, K = 32) {
  const expected = eloExpected(rating, opponentRating);
  return Math.round(rating + K * (actualScore - expected));
}

function calculateMatchElo(match, playerRatings) {
  const isDoubles = !!match.is_doubles;
  const entries = [];

  if (isDoubles) {
    const p1 = match.player1_id;
    const p2 = match.player2_id;
    const p3 = match.player3_id;
    const p4 = match.player4_id;
    // Team 1 = p1 + p3, Team 2 = p2 + p4
    const team1Rating = ((playerRatings[p1] || 1200) + (playerRatings[p3] || 1200)) / 2;
    const team2Rating = ((playerRatings[p2] || 1200) + (playerRatings[p4] || 1200)) / 2;

    // winner_id is p1 or p2 (team lead)
    const team1Won = match.winner_id === p1;
    const t1Score = team1Won ? 1 : 0;
    const t2Score = team1Won ? 0 : 1;

    // Each team member gets the same delta based on team avg vs opponent team avg
    for (const pid of [p1, p3]) {
      const before = playerRatings[pid] || 1200;
      const after = eloChange(before, team2Rating, t1Score);
      entries.push({ playerId: pid, ratingBefore: before, ratingAfter: after });
    }
    for (const pid of [p2, p4]) {
      const before = playerRatings[pid] || 1200;
      const after = eloChange(before, team1Rating, t2Score);
      entries.push({ playerId: pid, ratingBefore: before, ratingAfter: after });
    }
  } else {
    const p1 = match.player1_id;
    const p2 = match.player2_id;
    const r1 = playerRatings[p1] || 1200;
    const r2 = playerRatings[p2] || 1200;
    const p1Won = match.winner_id === p1;
    const p1Score = p1Won ? 1 : 0;
    const p2Score = p1Won ? 0 : 1;

    entries.push({ playerId: p1, ratingBefore: r1, ratingAfter: eloChange(r1, r2, p1Score) });
    entries.push({ playerId: p2, ratingBefore: r2, ratingAfter: eloChange(r2, r1, p2Score) });
  }

  return entries;
}

// ─── DB ROW TRANSFORMERS ─────────────────────────────────────────────────────
function dbToPlayer(row) {
  return { id: row.id, name: row.name, eloRating: row.elo_rating || 1200, createdAt: row.created_at };
}

function dbToMatch(row) {
  return {
    id: row.id, date: row.date,
    player1Id: row.player1_id, player2Id: row.player2_id,
    sets: JSON.parse(row.sets),
    winnerId: row.winner_id || null,
    note: row.note || '',
    locationId: row.location_id || null,
    creatorId: row.creator_id || null,
    isDoubles: !!row.is_doubles,
    player3Id: row.player3_id || null,
    player4Id: row.player4_id || null
  };
}

function dbToLocation(row) {
  return { id: row.id, name: row.name, lat: row.lat || null, lng: row.lng || null, image: row.image || '', createdAt: row.created_at };
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

function dbToComment(row) {
  return {
    id: row.id,
    matchId: row.match_id,
    userId: row.user_id,
    username: row.username,
    text: row.text,
    createdAt: row.created_at
  };
}

function dbToUser(row) {
  return { id: row.id, username: row.username, role: row.role, createdAt: row.created_at };
}

function dbToEloHistory(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    matchId: row.match_id,
    ratingBefore: row.rating_before,
    ratingAfter: row.rating_after,
    createdAt: row.created_at
  };
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
  eloExpected,
  eloChange,
  calculateMatchElo,
  dbToPlayer,
  dbToMatch,
  dbToComment,
  dbToLocation,
  dbToUser,
  dbToEloHistory,
  countSetWins,
  determineWinner,
  csvEscape,
};
