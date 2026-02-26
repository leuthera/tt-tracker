// ─── Stats Engine (pure functions — no imports needed) ──────────────────────

function countSetWins(sets) {
  return sets.reduce((acc, s) => {
    if (Number(s.p1) > Number(s.p2)) acc.p1++;
    else if (Number(s.p2) > Number(s.p1)) acc.p2++;
    return acc;
  }, { p1: 0, p2: 0 });
}

function computeStats(playerId, matches) {
  const playerMatches = matches.filter(
    m => m.player1Id === playerId || m.player2Id === playerId
  );

  let wins = 0, losses = 0, draws = 0, setsWon = 0, setsLost = 0, pointsWon = 0, pointsLost = 0;
  const recentForm = [];

  for (const m of playerMatches) {
    const isP1 = m.player1Id === playerId;
    const won = m.winnerId === playerId;
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
      const mine = isP1 ? Number(s.p1) : Number(s.p2);
      const theirs = isP1 ? Number(s.p2) : Number(s.p1);
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
      if (b.stats.winRate !== a.stats.winRate) return b.stats.winRate - a.stats.winRate;
      return b.stats.wins - a.stats.wins;
    });
}

function computeH2H(p1Id, p2Id, matches) {
  const h2hMatches = matches.filter(m =>
    (m.player1Id === p1Id && m.player2Id === p2Id) ||
    (m.player1Id === p2Id && m.player2Id === p1Id)
  );
  let p1Wins = 0, p2Wins = 0;
  for (const m of h2hMatches) {
    if (m.winnerId === p1Id) p1Wins++;
    else if (m.winnerId === p2Id) p2Wins++;
  }
  return { p1Wins, p2Wins, total: h2hMatches.length };
}

export { countSetWins, computeStats, getLeaderboard, computeH2H };
