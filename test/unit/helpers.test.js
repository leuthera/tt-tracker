'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPassword, verifyPassword,
  countSetWins, determineWinner,
  dbToPlayer, dbToMatch, dbToUser,
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

describe('dbToPlayer', () => {
  it('transforms a db row to API format', () => {
    const row = { id: 'p_1', name: 'Alice', created_at: 1700000000 };
    assert.deepEqual(dbToPlayer(row), { id: 'p_1', name: 'Alice', createdAt: 1700000000 });
  });
});

describe('dbToMatch', () => {
  it('transforms a db row to API format', () => {
    const row = {
      id: 'm_1', date: 1700000000,
      player1_id: 'p_1', player2_id: 'p_2',
      sets: '[{"p1":11,"p2":5}]',
      winner_id: 'p_1', note: 'Great match'
    };
    const result = dbToMatch(row);
    assert.equal(result.id, 'm_1');
    assert.equal(result.player1Id, 'p_1');
    assert.equal(result.player2Id, 'p_2');
    assert.deepEqual(result.sets, [{ p1: 11, p2: 5 }]);
    assert.equal(result.winnerId, 'p_1');
    assert.equal(result.note, 'Great match');
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
