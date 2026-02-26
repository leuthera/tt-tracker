// ─── SVG Chart Rendering ─────────────────────────────────────────────────────

import { filterMatchesByDateRange } from './stats.js';

function computeWinRateOverTime(playerId, matches) {
  if (!playerId || !matches || matches.length === 0) return [];
  const playerMatches = matches
    .filter(m => m.player1Id === playerId || m.player2Id === playerId ||
                 m.player3Id === playerId || m.player4Id === playerId)
    .sort((a, b) => {
      const ta = typeof a.date === 'string' ? new Date(a.date).getTime() : a.date;
      const tb = typeof b.date === 'string' ? new Date(b.date).getTime() : b.date;
      return ta - tb;
    });

  let wins = 0, total = 0;
  return playerMatches.map(m => {
    total++;
    const isP1Side = m.player1Id === playerId || m.player3Id === playerId;
    const won = m.isDoubles
      ? (m.winnerId && (m.winnerId === m.player1Id ? isP1Side : !isP1Side))
      : m.winnerId === playerId;
    if (won) wins++;
    return { date: m.date, winRate: Math.round((wins / total) * 100) };
  });
}

function renderEloChart(container, history, dateRange) {
  if (!history || history.length === 0) { container.innerHTML = ''; return; }

  let data = history;
  if (dateRange && dateRange !== 'all') {
    const mapped = history.map(h => ({ ...h, date: h.createdAt }));
    const filtered = filterMatchesByDateRange(mapped, dateRange);
    const ids = new Set(filtered.map(f => f.id));
    data = history.filter(h => ids.has(h.id));
  }
  if (data.length === 0) { container.innerHTML = ''; return; }

  const W = 400, H = 180, PAD_L = 40, PAD_R = 10, PAD_T = 20, PAD_B = 30;
  const cW = W - PAD_L - PAD_R;
  const cH = H - PAD_T - PAD_B;

  const ratings = data.map(d => d.ratingAfter);
  const minR = Math.min(...ratings) - 10;
  const maxR = Math.max(...ratings) + 10;
  const range = maxR - minR || 1;

  const points = data.map((d, i) => {
    const x = PAD_L + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
    const y = PAD_T + cH - ((d.ratingAfter - minR) / range) * cH;
    return { x, y, rating: d.ratingAfter, delta: d.ratingAfter - d.ratingBefore };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = linePath + ` L${points[points.length - 1].x.toFixed(1)},${PAD_T + cH} L${points[0].x.toFixed(1)},${PAD_T + cH} Z`;

  // Grid lines (3-4 horizontal lines)
  const gridCount = 4;
  let gridLines = '';
  for (let i = 0; i <= gridCount; i++) {
    const y = PAD_T + (i / gridCount) * cH;
    const val = Math.round(maxR - (i / gridCount) * range);
    gridLines += `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" class="chart__grid"/>`;
    gridLines += `<text x="${PAD_L - 4}" y="${(y + 4).toFixed(1)}" class="chart__label" text-anchor="end">${val}</text>`;
  }

  // Dots and tooltip targets
  let dots = '';
  points.forEach((p, i) => {
    const sign = p.delta > 0 ? '+' : '';
    dots += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" class="chart__dot"/>`;
    dots += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="14" fill="transparent" class="chart__dot-target" data-idx="${i}"/>`;
    // Tooltip group (hidden by default)
    const ty = p.y - 28;
    dots += `<g class="chart__tooltip" id="elo-tip-${i}" style="display:none">
      <rect x="${(p.x - 30).toFixed(1)}" y="${ty.toFixed(1)}" width="60" height="22" rx="4" class="chart__tooltip-bg"/>
      <text x="${p.x.toFixed(1)}" y="${(ty + 15).toFixed(1)}" class="chart__tooltip-text" text-anchor="middle">${p.rating} (${sign}${p.delta})</text>
    </g>`;
  });

  container.innerHTML = `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      ${gridLines}
      <path d="${areaPath}" class="chart__area"/>
      <path d="${linePath}" class="chart__line"/>
      ${dots}
    </svg>
  `;

  // Tooltip interaction
  container.querySelectorAll('.chart__dot-target').forEach(el => {
    const show = () => {
      container.querySelectorAll('.chart__tooltip').forEach(t => t.style.display = 'none');
      const tip = container.querySelector(`#elo-tip-${el.dataset.idx}`);
      if (tip) tip.style.display = '';
    };
    el.addEventListener('mouseenter', show);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); show(); }, { passive: false });
  });
  container.addEventListener('mouseleave', () => {
    container.querySelectorAll('.chart__tooltip').forEach(t => t.style.display = 'none');
  });
}

function renderWinRateChart(container, playerId, matches) {
  const data = computeWinRateOverTime(playerId, matches);
  if (data.length === 0) { container.innerHTML = ''; return; }

  const W = 400, H = 180, PAD_L = 40, PAD_R = 10, PAD_T = 20, PAD_B = 30;
  const cW = W - PAD_L - PAD_R;
  const cH = H - PAD_T - PAD_B;

  const points = data.map((d, i) => {
    const x = PAD_L + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
    const y = PAD_T + cH - (d.winRate / 100) * cH;
    return { x, y, winRate: d.winRate };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = linePath + ` L${points[points.length - 1].x.toFixed(1)},${PAD_T + cH} L${points[0].x.toFixed(1)},${PAD_T + cH} Z`;

  // Grid + labels at 0%, 25%, 50%, 75%, 100%
  let gridLines = '';
  for (let pct = 0; pct <= 100; pct += 25) {
    const y = PAD_T + cH - (pct / 100) * cH;
    gridLines += `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" class="chart__grid"/>`;
    gridLines += `<text x="${PAD_L - 4}" y="${(y + 4).toFixed(1)}" class="chart__label" text-anchor="end">${pct}%</text>`;
  }

  // 50% reference line
  const refY = PAD_T + cH - 0.5 * cH;
  const refLine = `<line x1="${PAD_L}" y1="${refY.toFixed(1)}" x2="${W - PAD_R}" y2="${refY.toFixed(1)}" class="chart__ref-line"/>`;

  container.innerHTML = `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      ${gridLines}
      ${refLine}
      <path d="${areaPath}" class="chart__area chart__area--win"/>
      <path d="${linePath}" class="chart__line chart__line--win"/>
      ${points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" class="chart__dot chart__dot--win"/>`).join('')}
    </svg>
  `;
}

export { renderEloChart, renderWinRateChart, computeWinRateOverTime };
