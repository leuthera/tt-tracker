// ─── Stats Engine (pure functions — no imports needed) ──────────────────────

function countSetWins(sets) {
  return sets.reduce((acc, s) => {
    if (Number(s.p1) > Number(s.p2)) acc.p1++;
    else if (Number(s.p2) > Number(s.p1)) acc.p2++;
    return acc;
  }, { p1: 0, p2: 0 });
}

function isPlayerInMatch(m, playerId) {
  return m.player1Id === playerId || m.player2Id === playerId ||
    m.player3Id === playerId || m.player4Id === playerId;
}

function computeStats(playerId, matches) {
  const playerMatches = matches.filter(m => isPlayerInMatch(m, playerId));

  let wins = 0, losses = 0, draws = 0, setsWon = 0, setsLost = 0, pointsWon = 0, pointsLost = 0;
  const recentForm = [];

  for (const m of playerMatches) {
    const isP1Side = m.player1Id === playerId || m.player3Id === playerId;
    const won = m.isDoubles
      ? (m.winnerId && (m.winnerId === m.player1Id ? isP1Side : !isP1Side))
      : m.winnerId === playerId;
    const isDraw = !m.winnerId;
    if (isDraw) {
      draws++;
      recentForm.push('D');
    } else if (won) {
      wins++;
      recentForm.push('W');
    } else {
      losses++;
      recentForm.push('L');
    }

    for (const s of (m.sets || [])) {
      const mine = isP1Side ? Number(s.p1) : Number(s.p2);
      const theirs = isP1Side ? Number(s.p2) : Number(s.p1);
      if (mine > theirs) setsWon++;
      else if (theirs > mine) setsLost++;
      pointsWon += mine;
      pointsLost += theirs;
    }
  }

  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  let streak = 0;
  if (recentForm.length > 0 && recentForm[0] !== 'D') {
    const dir = recentForm[0];
    for (const f of recentForm) {
      if (f === dir) streak += (dir === 'W' ? 1 : -1);
      else break;
    }
  }

  return {
    playerId, wins, losses, draws, totalMatches: playerMatches.length,
    winRate, setsWon, setsLost, pointsWon, pointsLost,
    streak, recentForm: recentForm.slice(0, 5)
  };
}

function getLeaderboard(players, matches) {
  return players
    .map(p => ({ player: p, stats: computeStats(p.id, matches) }))
    .sort((a, b) => {
      const eloA = a.player.eloRating || 1200;
      const eloB = b.player.eloRating || 1200;
      if (eloB !== eloA) return eloB - eloA;
      if (b.stats.winRate !== a.stats.winRate) return b.stats.winRate - a.stats.winRate;
      return b.stats.wins - a.stats.wins;
    });
}

function computeH2H(p1Id, p2Id, matches) {
  const h2hMatches = matches.filter(m =>
    isPlayerInMatch(m, p1Id) && isPlayerInMatch(m, p2Id)
  );
  let p1Wins = 0, p2Wins = 0;
  for (const m of h2hMatches) {
    if (!m.winnerId) continue;
    const p1Side = m.player1Id === p1Id || m.player3Id === p1Id;
    const winnerIsP1Side = m.winnerId === m.player1Id;
    if (p1Side === winnerIsP1Side) p1Wins++;
    else p2Wins++;
  }
  return { p1Wins, p2Wins, total: h2hMatches.length };
}

function filterMatchesByDateRange(matches, preset) {
  if (!matches || !preset || preset === 'all') return matches || [];
  const now = Date.now();
  let cutoff;
  if (preset === '30d') cutoff = now - 30 * 24 * 60 * 60 * 1000;
  else if (preset === '3m') cutoff = now - 90 * 24 * 60 * 60 * 1000;
  else if (preset === 'year') cutoff = now - 365 * 24 * 60 * 60 * 1000;
  else return matches;
  return matches.filter(m => {
    const ts = typeof m.date === 'string' ? new Date(m.date).getTime() : m.date;
    return ts >= cutoff;
  });
}

// ─── ACHIEVEMENTS ───────────────────────────────────────────────────────────

const ACHIEVEMENT_DEFS = [
  { id: 'first_win',     icon: '\u{1F3C6}', check: (s) => s.wins >= 1 },
  { id: 'getting_started', icon: '\u{1F3C5}', check: (s) => s.wins >= 5 },
  { id: 'champion',      icon: '\u{1F451}', check: (s) => s.wins >= 25 },
  { id: 'legend',        icon: '\u2B50',     check: (s) => s.wins >= 50 },
  { id: 'on_fire',       icon: '\u{1F525}', check: (s) => s.streak >= 5 },
  { id: 'unstoppable',   icon: '\u26A1',     check: (s) => s.streak >= 10 },
  { id: 'rising_star',   icon: '\u{1F31F}', check: (_, elo) => elo >= 1300 },
  { id: 'elite',         icon: '\u{1F48E}', check: (_, elo) => elo >= 1500 },
  { id: 'dedicated',     icon: '\u{1F3D3}', check: (s) => s.totalMatches >= 25 },
  { id: 'century',       icon: '\u{1F4AF}', check: (s) => s.totalMatches >= 100 },
  { id: 'comeback_king', icon: '\u{1F451}', check: null },
  { id: 'clean_sweep',   icon: '\u{1F9F9}', check: null },
  { id: 'rival',         icon: '\u2694\uFE0F', check: null },
];

function hasComeback(playerId, playerMatches) {
  for (const m of playerMatches) {
    if (!m.winnerId || !m.sets || m.sets.length < 3) continue;
    const isP1Side = m.player1Id === playerId || m.player3Id === playerId;
    const won = m.isDoubles
      ? (m.winnerId === m.player1Id ? isP1Side : !isP1Side)
      : m.winnerId === playerId;
    if (!won) continue;
    let lostFirst2 = true;
    for (let i = 0; i < 2; i++) {
      const s = m.sets[i];
      const mine = isP1Side ? Number(s.p1) : Number(s.p2);
      const theirs = isP1Side ? Number(s.p2) : Number(s.p1);
      if (mine >= theirs) { lostFirst2 = false; break; }
    }
    if (lostFirst2) return true;
  }
  return false;
}

function hasCleanSweep(playerId, playerMatches) {
  for (const m of playerMatches) {
    if (!m.winnerId || !m.sets || m.sets.length === 0) continue;
    const isP1Side = m.player1Id === playerId || m.player3Id === playerId;
    const won = m.isDoubles
      ? (m.winnerId === m.player1Id ? isP1Side : !isP1Side)
      : m.winnerId === playerId;
    if (!won) continue;
    const allEleven = m.sets.every(s => {
      const mine = isP1Side ? Number(s.p1) : Number(s.p2);
      const theirs = isP1Side ? Number(s.p2) : Number(s.p1);
      return mine === 11 && theirs === 0;
    });
    if (allEleven) return true;
  }
  return false;
}

function hasRival(playerId, allMatches, allPlayers) {
  const counts = {};
  for (const m of allMatches) {
    if (!isPlayerInMatch(m, playerId)) continue;
    for (const p of allPlayers) {
      if (p.id === playerId) continue;
      if (isPlayerInMatch(m, p.id)) {
        counts[p.id] = (counts[p.id] || 0) + 1;
      }
    }
  }
  return Object.values(counts).some(c => c >= 10);
}

function computeAchievements(playerId, stats, eloRating, allMatches, allPlayers) {
  const playerMatches = allMatches.filter(m => isPlayerInMatch(m, playerId));
  return ACHIEVEMENT_DEFS.map(def => {
    let unlocked = false;
    if (def.id === 'comeback_king') {
      unlocked = hasComeback(playerId, playerMatches);
    } else if (def.id === 'clean_sweep') {
      unlocked = hasCleanSweep(playerId, playerMatches);
    } else if (def.id === 'rival') {
      unlocked = hasRival(playerId, allMatches, allPlayers);
    } else {
      unlocked = def.check(stats, eloRating);
    }
    return { id: def.id, icon: def.icon, unlocked };
  });
}

export { countSetWins, computeStats, getLeaderboard, computeH2H, filterMatchesByDateRange, ACHIEVEMENT_DEFS, computeAchievements };
