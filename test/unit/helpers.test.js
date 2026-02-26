'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPassword, verifyPassword,
  countSetWins, determineWinner,
  dbToPlayer, dbToMatch, dbToComment, dbToUser, dbToEloHistory,
  eloExpected, eloChange, calculateMatchElo,
  csvEscape,
} = require('../../lib/helpers');

describe('hashPassword / verifyPassword', () => {
  it('round-trips correctly', () => {
    const hash = hashPassword('secret');
    assert.ok(verifyPassword('secret', hash));
  });

  it('rejects wrong password', () => {
    const hash = hashPassword('secret');
    assert.ok(!verifyPassword('wrong', hash));
  });

  it('produces different hashes for the same password (random salt)', () => {
    const h1 = hashPassword('same');
    const h2 = hashPassword('same');
    assert.notEqual(h1, h2);
  });
});

describe('countSetWins', () => {
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
});

describe('determineWinner', () => {
  it('returns p1Id when p1 wins more sets', () => {
    const sets = [{ p1: 11, p2: 5 }, { p1: 11, p2: 7 }, { p1: 3, p2: 11 }];
    assert.equal(determineWinner(sets, 'p_1', 'p_2'), 'p_1');
  });

  it('returns p2Id when p2 wins more sets', () => {
    const sets = [{ p1: 5, p2: 11 }, { p1: 11, p2: 7 }, { p1: 3, p2: 11 }];
    assert.equal(determineWinner(sets, 'p_1', 'p_2'), 'p_2');
  });

  it('returns null on draw', () => {
    const sets = [{ p1: 11, p2: 5 }, { p1: 3, p2: 11 }];
    assert.equal(determineWinner(sets, 'p_1', 'p_2'), null);
  });
});

describe('eloExpected', () => {
  it('returns 0.5 for equal ratings', () => {
    assert.equal(eloExpected(1200, 1200), 0.5);
  });

  it('returns > 0.5 for higher rating', () => {
    assert.ok(eloExpected(1400, 1200) > 0.5);
  });

  it('returns < 0.5 for lower rating', () => {
    assert.ok(eloExpected(1000, 1200) < 0.5);
  });
});

describe('eloChange', () => {
  it('win increases rating', () => {
    const newRating = eloChange(1200, 1200, 1);
    assert.ok(newRating > 1200);
  });

  it('loss decreases rating', () => {
    const newRating = eloChange(1200, 1200, 0);
    assert.ok(newRating < 1200);
  });

  it('K=32 delta for equal ratings — win gives +16', () => {
    const newRating = eloChange(1200, 1200, 1, 32);
    assert.equal(newRating, 1216);
  });

  it('K=32 delta for equal ratings — loss gives -16', () => {
    const newRating = eloChange(1200, 1200, 0, 32);
    assert.equal(newRating, 1184);
  });
});

describe('calculateMatchElo', () => {
  it('handles singles match correctly', () => {
    const match = { player1_id: 'p1', player2_id: 'p2', winner_id: 'p1', is_doubles: 0 };
    const ratings = { p1: 1200, p2: 1200 };
    const entries = calculateMatchElo(match, ratings);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].playerId, 'p1');
    assert.ok(entries[0].ratingAfter > 1200);
    assert.equal(entries[1].playerId, 'p2');
    assert.ok(entries[1].ratingAfter < 1200);
  });

  it('handles doubles match correctly', () => {
    const match = {
      player1_id: 'p1', player2_id: 'p2',
      player3_id: 'p3', player4_id: 'p4',
      winner_id: 'p1', is_doubles: 1
    };
    const ratings = { p1: 1200, p2: 1200, p3: 1200, p4: 1200 };
    const entries = calculateMatchElo(match, ratings);
    assert.equal(entries.length, 4);
    // Team 1 (p1 + p3) won
    const p1Entry = entries.find(e => e.playerId === 'p1');
    const p3Entry = entries.find(e => e.playerId === 'p3');
    const p2Entry = entries.find(e => e.playerId === 'p2');
    const p4Entry = entries.find(e => e.playerId === 'p4');
    assert.ok(p1Entry.ratingAfter > 1200);
    assert.ok(p3Entry.ratingAfter > 1200);
    assert.ok(p2Entry.ratingAfter < 1200);
    assert.ok(p4Entry.ratingAfter < 1200);
    // Equal delta for team members
    assert.equal(p1Entry.ratingAfter - p1Entry.ratingBefore, p3Entry.ratingAfter - p3Entry.ratingBefore);
    assert.equal(p2Entry.ratingAfter - p2Entry.ratingBefore, p4Entry.ratingAfter - p4Entry.ratingBefore);
  });
});

describe('dbToPlayer', () => {
  it('transforms a db row to API format', () => {
    const row = { id: 'p_1', name: 'Alice', elo_rating: 1250, created_at: 1700000000 };
    assert.deepEqual(dbToPlayer(row), { id: 'p_1', name: 'Alice', eloRating: 1250, createdAt: 1700000000 });
  });

  it('defaults eloRating to 1200 when not set', () => {
    const row = { id: 'p_1', name: 'Alice', created_at: 1700000000 };
    assert.equal(dbToPlayer(row).eloRating, 1200);
  });
});

describe('dbToMatch', () => {
  it('transforms a db row to API format', () => {
    const row = {
      id: 'm_1', date: 1700000000,
      player1_id: 'p_1', player2_id: 'p_2',
      sets: '[{"p1":11,"p2":5}]',
      winner_id: 'p_1', note: 'Great match',
      creator_id: 'u_1'
    };
    const result = dbToMatch(row);
    assert.equal(result.id, 'm_1');
    assert.equal(result.player1Id, 'p_1');
    assert.equal(result.player2Id, 'p_2');
    assert.deepEqual(result.sets, [{ p1: 11, p2: 5 }]);
    assert.equal(result.winnerId, 'p_1');
    assert.equal(result.note, 'Great match');
    assert.equal(result.creatorId, 'u_1');
    assert.equal(result.isDoubles, false);
    assert.equal(result.player3Id, null);
    assert.equal(result.player4Id, null);
  });

  it('returns null winnerId when not set', () => {
    const row = {
      id: 'm_1', date: 1700000000,
      player1_id: 'p_1', player2_id: 'p_2',
      sets: '[{"p1":11,"p2":5}]',
      winner_id: '', note: ''
    };
    assert.equal(dbToMatch(row).winnerId, null);
  });

  it('returns empty string note when not set', () => {
    const row = {
      id: 'm_1', date: 1700000000,
      player1_id: 'p_1', player2_id: 'p_2',
      sets: '[]', winner_id: null, note: null
    };
    assert.equal(dbToMatch(row).note, '');
  });

  it('returns null creatorId when not set', () => {
    const row = {
      id: 'm_1', date: 1700000000,
      player1_id: 'p_1', player2_id: 'p_2',
      sets: '[]', winner_id: null, note: ''
    };
    assert.equal(dbToMatch(row).creatorId, null);
  });

  it('transforms doubles match correctly', () => {
    const row = {
      id: 'm_1', date: 1700000000,
      player1_id: 'p_1', player2_id: 'p_2',
      player3_id: 'p_3', player4_id: 'p_4',
      sets: '[{"p1":11,"p2":5}]',
      winner_id: 'p_1', note: '',
      is_doubles: 1
    };
    const result = dbToMatch(row);
    assert.equal(result.isDoubles, true);
    assert.equal(result.player3Id, 'p_3');
    assert.equal(result.player4Id, 'p_4');
  });
});

describe('dbToEloHistory', () => {
  it('transforms a db row to API format', () => {
    const row = {
      id: 'elo_1', player_id: 'p_1', match_id: 'm_1',
      rating_before: 1200, rating_after: 1216, created_at: '1700000000'
    };
    const result = dbToEloHistory(row);
    assert.deepEqual(result, {
      id: 'elo_1', playerId: 'p_1', matchId: 'm_1',
      ratingBefore: 1200, ratingAfter: 1216, createdAt: '1700000000'
    });
  });
});

describe('dbToComment', () => {
  it('transforms a db row to API format', () => {
    const row = {
      id: 'c_1', match_id: 'm_1', user_id: 'u_1',
      username: 'alice', text: 'Nice game!', created_at: 1700000000
    };
    const result = dbToComment(row);
    assert.deepEqual(result, {
      id: 'c_1', matchId: 'm_1', userId: 'u_1',
      username: 'alice', text: 'Nice game!', createdAt: 1700000000
    });
  });
});

describe('dbToUser', () => {
  it('transforms a db row to API format', () => {
    const row = { id: 'u_1', username: 'alice', role: 'admin', created_at: 1700000000, password: 'secret:hash' };
    const result = dbToUser(row);
    assert.deepEqual(result, { id: 'u_1', username: 'alice', role: 'admin', createdAt: 1700000000 });
  });

  it('does not expose password', () => {
    const row = { id: 'u_1', username: 'bob', role: 'user', created_at: 1700000000, password: 'secret:hash' };
    const result = dbToUser(row);
    assert.equal(result.password, undefined);
  });
});

describe('csvEscape', () => {
  it('returns plain string unchanged', () => {
    assert.equal(csvEscape('hello'), 'hello');
  });

  it('wraps value with commas in quotes', () => {
    assert.equal(csvEscape('one,two'), '"one,two"');
  });

  it('escapes double quotes by doubling them', () => {
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  });

  it('wraps value with newlines in quotes', () => {
    assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
  });

  it('wraps value with carriage return in quotes', () => {
    assert.equal(csvEscape('line1\rline2'), '"line1\rline2"');
  });

  it('returns empty string for null', () => {
    assert.equal(csvEscape(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(csvEscape(undefined), '');
  });

  it('returns empty string for empty string', () => {
    assert.equal(csvEscape(''), '');
  });

  it('converts numbers to strings', () => {
    assert.equal(csvEscape(42), '42');
  });

  it('handles value with comma and quotes together', () => {
    assert.equal(csvEscape('a,"b"'), '"a,""b"""');
  });
});
