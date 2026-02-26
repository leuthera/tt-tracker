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

export { countSetWins, computeStats, getLeaderboard, computeH2H, filterMatchesByDateRange };
