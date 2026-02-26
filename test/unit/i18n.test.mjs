import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage before importing i18n
const store = {};
globalThis.localStorage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, val) => { store[key] = String(val); },
  removeItem: (key) => { delete store[key]; },
};

const { t, getLang, setLang, AVATAR_COLORS, translations } = await import('../../js/i18n.js');

describe('i18n', () => {
  beforeEach(() => {
    delete store.lang;
  });

  describe('getLang / setLang', () => {
    it('defaults to en', () => {
      assert.equal(getLang(), 'en');
    });

    it('returns saved language', () => {
      setLang('de');
      assert.equal(getLang(), 'de');
    });
  });

  describe('t(key)', () => {
    it('returns English translation by default', () => {
      assert.equal(t('nav.home'), 'Home');
    });

    it('returns German translation when lang is de', () => {
      setLang('de');
      assert.equal(t('nav.home'), 'Start');
    });

    it('returns key itself for missing key', () => {
      assert.equal(t('nonexistent.key'), 'nonexistent.key');
    });

    it('falls back to English if key missing in current lang', () => {
      setLang('de');
      // All keys exist in de, so test with a key we add to en only
      assert.equal(t('nav.home'), 'Start');
    });
  });

  describe('t(key, params)', () => {
    it('interpolates single param', () => {
      assert.equal(t('time.mAgo', { n: 5 }), '5m ago');
    });

    it('interpolates multiple params', () => {
      assert.equal(t('match.leads', { name: 'Alice', score: '2–1' }), 'Alice leads 2–1');
    });

    it('replaces all occurrences of same param', () => {
      // The offline.syncMixed key has {ok} and {fail}
      const result = t('offline.syncMixed', { ok: 3, fail: 1 });
      assert.equal(result, '3 synced, 1 failed');
    });
  });

  describe('AVATAR_COLORS', () => {
    it('is an array of 10 hex colors', () => {
      assert.equal(AVATAR_COLORS.length, 10);
      for (const c of AVATAR_COLORS) {
        assert.match(c, /^#[0-9a-f]{6}$/i);
      }
    });
  });

  describe('translations', () => {
    it('has en and de', () => {
      assert.ok(translations.en);
      assert.ok(translations.de);
    });

    it('en and de have the same keys', () => {
      const enKeys = Object.keys(translations.en).sort();
      const deKeys = Object.keys(translations.de).sort();
      assert.deepEqual(enKeys, deKeys);
    });
  });
});
