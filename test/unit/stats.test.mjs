import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countSetWins, computeStats, getLeaderboard, computeH2H } from '../../js/stats.js';

// ─── countSetWins ───────────────────────────────────────────────────────────

describe('frontend countSetWins', () => {
  it('counts p1 wins', () => {
    const result = countSetWins([{ p1: 11, p2: 5 }, { p1: 11, p2: 7 }]);
    assert.deepEqual(result, { p1: 2, p2: 0 });
  });

  it('counts p2 wins', () => {
    const result = countSetWins([{ p1: 5, p2: 11 }, { p1: 3, p2: 11 }]);
    assert.deepEqual(result, { p1: 0, p2: 2 });
  });

  it('counts mixed wins', () => {
    const result = countSetWins([{ p1: 11, p2: 5 }, { p1: 3, p2: 11 }, { p1: 11, p2: 9 }]);
    assert.deepEqual(result, { p1: 2, p2: 1 });
  });

  it('handles string scores', () => {
    const result = countSetWins([{ p1: '11', p2: '5' }]);
    assert.deepEqual(result, { p1: 1, p2: 0 });
  });

  it('handles empty sets', () => {
    const result = countSetWins([]);
    assert.deepEqual(result, { p1: 0, p2: 0 });
  });

  it('handles tied set (equal scores)', () => {
    const result = countSetWins([{ p1: 10, p2: 10 }]);
    assert.deepEqual(result, { p1: 0, p2: 0 });
  });
});

// ─── computeStats ───────────────────────────────────────────────────────────

describe('computeStats', () => {
  const matches = [
    { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', sets: [{ p1: 11, p2: 5 }, { p1: 11, p2: 7 }] },
    { player1Id: 'p1', player2Id: 'p3', winnerId: 'p3', sets: [{ p1: 5, p2: 11 }, { p1: 3, p2: 11 }] },
    { player1Id: 'p2', player2Id: 'p1', winnerId: 'p1', sets: [{ p1: 7, p2: 11 }, { p1: 5, p2: 11 }] },
    { player1Id: 'p1', player2Id: 'p2', winnerId: null, sets: [{ p1: 11, p2: 5 }, { p1: 5, p2: 11 }] },
  ];

  it('computes wins, losses, draws correctly', () => {
    const stats = computeStats('p1', matches);
    assert.equal(stats.wins, 2);
    assert.equal(stats.losses, 1);
    assert.equal(stats.draws, 1);
    assert.equal(stats.totalMatches, 4);
  });

  it('computes win rate as percentage', () => {
    const stats = computeStats('p1', matches);
    assert.equal(stats.winRate, 50); // 2 wins / 4 total = 50%
  });

  it('computes sets won/lost', () => {
    const stats = computeStats('p1', matches);
    assert.equal(stats.setsWon, 5);
    assert.equal(stats.setsLost, 3);
  });

  it('computes points won/lost', () => {
    const stats = computeStats('p1', matches);
    // match1: p1 scores 11+11=22, p2 scores 5+7=12
    // match2: p1 scores 5+3=8, p3 scores 11+11=22
    // match3: p1 is p2 here — p1 scores 11+11=22, p2 scores 7+5=12
    // match4: p1 scores 11+5=16, p2 scores 5+11=16
    assert.equal(stats.pointsWon, 22 + 8 + 22 + 16);
    assert.equal(stats.pointsLost, 12 + 22 + 12 + 16);
  });

  it('computes recent form (last 5)', () => {
    const stats = computeStats('p1', matches);
    assert.deepEqual(stats.recentForm, ['W', 'L', 'W', 'D']);
  });

  it('computes win streak', () => {
    const winStreak = [
      { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', sets: [{ p1: 11, p2: 5 }] },
      { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', sets: [{ p1: 11, p2: 5 }] },
      { player1Id: 'p1', player2Id: 'p2', winnerId: 'p2', sets: [{ p1: 5, p2: 11 }] },
    ];
    const stats = computeStats('p1', winStreak);
    assert.equal(stats.streak, 2);
  });

  it('computes loss streak as negative', () => {
    const lossStreak = [
      { player1Id: 'p1', player2Id: 'p2', winnerId: 'p2', sets: [{ p1: 5, p2: 11 }] },
      { player1Id: 'p1', player2Id: 'p2', winnerId: 'p2', sets: [{ p1: 5, p2: 11 }] },
      { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', sets: [{ p1: 11, p2: 5 }] },
    ];
    const stats = computeStats('p1', lossStreak);
    assert.equal(stats.streak, -2);
  });

  it('returns zero stats for player with no matches', () => {
    const stats = computeStats('p_unknown', matches);
    assert.equal(stats.totalMatches, 0);
    assert.equal(stats.winRate, 0);
    assert.equal(stats.wins, 0);
    assert.equal(stats.streak, 0);
  });
});

// ─── getLeaderboard ─────────────────────────────────────────────────────────

describe('getLeaderboard', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Charlie' },
  ];
  const matches = [
    { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', sets: [{ p1: 11, p2: 5 }] },
    { player1Id: 'p1', player2Id: 'p3', winnerId: 'p1', sets: [{ p1: 11, p2: 5 }] },
    { player1Id: 'p2', player2Id: 'p3', winnerId: 'p2', sets: [{ p1: 11, p2: 5 }] },
  ];

  it('sorts by win rate then wins', () => {
    const lb = getLeaderboard(players, matches);
    assert.equal(lb[0].player.name, 'Alice');  // 100% win rate
    assert.equal(lb[1].player.name, 'Bob');    // 50% win rate, 1 win
    assert.equal(lb[2].player.name, 'Charlie'); // 0% win rate
  });

  it('returns correct stats per player', () => {
    const lb = getLeaderboard(players, matches);
    assert.equal(lb[0].stats.wins, 2);
    assert.equal(lb[0].stats.losses, 0);
    assert.equal(lb[0].stats.winRate, 100);
  });

  it('returns empty array for no players', () => {
    const lb = getLeaderboard([], matches);
    assert.deepEqual(lb, []);
  });
});

// ─── computeH2H ─────────────────────────────────────────────────────────────

describe('computeH2H', () => {
  const matches = [
    { player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', sets: [{ p1: 11, p2: 5 }] },
    { player1Id: 'p2', player2Id: 'p1', winnerId: 'p1', sets: [{ p1: 5, p2: 11 }] },
    { player1Id: 'p1', player2Id: 'p2', winnerId: 'p2', sets: [{ p1: 5, p2: 11 }] },
    { player1Id: 'p1', player2Id: 'p3', winnerId: 'p1', sets: [{ p1: 11, p2: 5 }] },
  ];

  it('counts wins for each player', () => {
    const h = computeH2H('p1', 'p2', matches);
    assert.equal(h.p1Wins, 2);
    assert.equal(h.p2Wins, 1);
    assert.equal(h.total, 3);
  });

  it('excludes matches against other players', () => {
    const h = computeH2H('p1', 'p2', matches);
    assert.equal(h.total, 3); // p1 vs p3 match not counted
  });

  it('returns zeroes for no matches between players', () => {
    const h = computeH2H('p2', 'p3', matches);
    assert.equal(h.p1Wins, 0);
    assert.equal(h.p2Wins, 0);
    assert.equal(h.total, 0);
  });
});
