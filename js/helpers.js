// ─── Frontend Helpers ───────────────────────────────────────────────────────

import { AVATAR_COLORS, t, getLang } from './i18n.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function avatarColor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}

function mkAvatar(name, size) {
  const el = document.createElement('div');
  el.className = `avatar avatar--${size}`;
  el.style.background = avatarColor(name);
  el.textContent = (name || '?').charAt(0).toUpperCase();
  return el;
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('time.justNow');
  if (mins < 60) return t('time.mAgo', { n: mins });
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return t('time.hAgo', { n: hrs });
  const days = Math.floor(diff / 86400000);
  if (days === 1) return t('time.yesterday');
  if (days < 7) return t('time.dAgo', { n: days });
  const locale = getLang() === 'de' ? 'de' : 'en';
  return new Date(ts).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function dateGroup(ts) {
  const d = new Date(ts);
  const today = new Date(); today.setHours(0,0,0,0);
  const mDay = new Date(d); mDay.setHours(0,0,0,0);
  const diff = (today - mDay) / 86400000;
  if (diff === 0) return t('date.today');
  if (diff === 1) return t('date.yesterday');
  const locale = getLang() === 'de' ? 'de' : 'en';
  return d.toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatSets(sets) {
  return (sets || []).map(s => `${s.p1}\u2013${s.p2}`).join(', ');
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export { esc, avatarColor, mkAvatar, relativeTime, dateGroup, formatSets, haversineDistance };
