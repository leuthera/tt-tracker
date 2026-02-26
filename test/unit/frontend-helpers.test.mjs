import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { csvEscape } from '../../js/export.js';

// Note: esc, avatarColor, formatSets depend on browser globals (DOM, localStorage)
// via i18n.js. We test the pure functions that don't need a browser environment.

// ─── csvEscape (frontend version) ──────────────────────────────────────────

describe('frontend csvEscape', () => {
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

  it('returns empty string for null', () => {
    assert.equal(csvEscape(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(csvEscape(undefined), '');
  });

  it('converts numbers to strings', () => {
    assert.equal(csvEscape(42), '42');
  });

  it('handles value with comma and quotes together', () => {
    assert.equal(csvEscape('a,"b"'), '"a,""b"""');
  });
});
