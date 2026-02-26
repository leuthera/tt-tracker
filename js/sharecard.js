// ─── Shareable Match Result Card (Canvas API) ──────────────────────────────

import { AVATAR_COLORS } from './i18n.js';
import { formatSets } from './helpers.js';
import { getPlayerById } from './state.js';
import { countSetWins } from './stats.js';

function avatarColor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '\u2026').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '\u2026';
}

function generateMatchCard(match) {
  const W = 600, H = 400;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#f0f4f0';
  ctx.fillRect(0, 0, W, H);

  // Header gradient bar
  const hdrGrad = ctx.createLinearGradient(0, 0, W, 0);
  hdrGrad.addColorStop(0, '#1e5c1e');
  hdrGrad.addColorStop(1, '#4caf50');
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(0, 0, W, 60);

  // Branding
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('\u{1F3D3} TT Tracker', W / 2, 40);

  // Doubles badge
  if (match.isDoubles) {
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#fff';
    const badgeX = W / 2 + 100;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    const bw = ctx.measureText('2v2').width + 12;
    ctx.beginPath();
    ctx.roundRect(badgeX - bw / 2, 25, bw, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('2v2', badgeX, 39);
  }

  const p1 = getPlayerById(match.player1Id);
  const p2 = getPlayerById(match.player2Id);
  const p3 = match.isDoubles ? getPlayerById(match.player3Id) : null;
  const p4 = match.isDoubles ? getPlayerById(match.player4Id) : null;

  const name1 = match.isDoubles
    ? (p1?.name || '?') + ' & ' + (p3?.name || '?')
    : (p1?.name || 'Unknown');
  const name2 = match.isDoubles
    ? (p2?.name || '?') + ' & ' + (p4?.name || '?')
    : (p2?.name || 'Unknown');

  const { p1: s1, p2: s2 } = countSetWins(match.sets || []);

  // Avatar circles
  const avatarY = 130;
  const avatarR = 36;
  const leftX = 150;
  const rightX = W - 150;

  // Left avatar
  ctx.beginPath();
  ctx.arc(leftX, avatarY, avatarR, 0, Math.PI * 2);
  ctx.fillStyle = avatarColor(p1?.name || '?');
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((p1?.name || '?').charAt(0).toUpperCase(), leftX, avatarY);

  // Right avatar
  ctx.beginPath();
  ctx.arc(rightX, avatarY, avatarR, 0, Math.PI * 2);
  ctx.fillStyle = avatarColor(p2?.name || '?');
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText((p2?.name || '?').charAt(0).toUpperCase(), rightX, avatarY);

  // VS label
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6b7c6b';
  ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('VS', W / 2, avatarY);

  // Player names
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1a2e1a';
  ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const maxNameW = 160;
  ctx.fillText(truncateText(ctx, name1, maxNameW), leftX, avatarY + avatarR + 12);
  ctx.fillText(truncateText(ctx, name2, maxNameW), rightX, avatarY + avatarR + 12);

  // Score
  ctx.fillStyle = '#2d7a2d';
  ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${s1}\u2013${s2}`, W / 2, 250);

  // Set scores
  ctx.fillStyle = '#6b7c6b';
  ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(formatSets(match.sets), W / 2, 290);

  // Note
  if (match.note) {
    ctx.fillStyle = '#6b7c6b';
    ctx.font = 'italic 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(truncateText(ctx, match.note, W - 80), W / 2, 320);
  }

  // Date
  const dateStr = new Date(match.date).toLocaleDateString('en', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
  ctx.fillStyle = '#6b7c6b';
  ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(dateStr, W / 2, 350);

  // Bottom gradient border
  const btmGrad = ctx.createLinearGradient(0, H - 6, W, H - 6);
  btmGrad.addColorStop(0, '#1e5c1e');
  btmGrad.addColorStop(1, '#4caf50');
  ctx.fillStyle = btmGrad;
  ctx.fillRect(0, H - 6, W, 6);

  return canvas;
}

function downloadMatchCard(match) {
  const canvas = generateMatchCard(match);
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `match-${match.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

export { generateMatchCard, downloadMatchCard };
