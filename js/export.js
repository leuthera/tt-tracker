// ─── Export Helpers ─────────────────────────────────────────────────────────

import { t } from './i18n.js';
import { esc, formatSets } from './helpers.js';
import { loadPlayers, loadMatches, getPlayerById } from './state.js';
import { showModal, hideModal, showToast } from './ui.js';

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPlayersCSV() {
  const players = loadPlayers();
  const rows = ['ID,Name,Created At'];
  for (const p of players) {
    rows.push([csvEscape(p.id), csvEscape(p.name), csvEscape(new Date(p.createdAt).toISOString())].join(','));
  }
  downloadFile(rows.join('\n'), 'tt-tracker-players.csv', 'text/csv;charset=utf-8');
}

function exportMatchesCSV() {
  const matches = loadMatches();
  const rows = ['ID,Date,Type,Player 1,Player 2,Player 3,Player 4,Sets,Winner,Note'];
  for (const m of matches) {
    const p1 = getPlayerById(m.player1Id);
    const p2 = getPlayerById(m.player2Id);
    const p3 = m.player3Id ? getPlayerById(m.player3Id) : null;
    const p4 = m.player4Id ? getPlayerById(m.player4Id) : null;
    const winner = m.winnerId ? (getPlayerById(m.winnerId)?.name || m.winnerId) : 'Draw';
    rows.push([
      csvEscape(m.id),
      csvEscape(new Date(m.date).toISOString()),
      csvEscape(m.isDoubles ? 'Doubles' : 'Singles'),
      csvEscape(p1?.name || m.player1Id),
      csvEscape(p2?.name || m.player2Id),
      csvEscape(p3?.name || ''),
      csvEscape(p4?.name || ''),
      csvEscape(formatSets(m.sets)),
      csvEscape(winner),
      csvEscape(m.note)
    ].join(','));
  }
  downloadFile(rows.join('\n'), 'tt-tracker-matches.csv', 'text/csv;charset=utf-8');
}

function exportJSON() {
  const players = loadPlayers();
  const matches = loadMatches().map(m => {
    const p1 = getPlayerById(m.player1Id);
    const p2 = getPlayerById(m.player2Id);
    const p3 = m.player3Id ? getPlayerById(m.player3Id) : null;
    const p4 = m.player4Id ? getPlayerById(m.player4Id) : null;
    return {
      ...m,
      player1Name: p1?.name || null,
      player2Name: p2?.name || null,
      player3Name: p3?.name || null,
      player4Name: p4?.name || null,
      winnerName: m.winnerId ? (getPlayerById(m.winnerId)?.name || null) : null
    };
  });
  const data = { exportedAt: new Date().toISOString(), players, matches };
  downloadFile(JSON.stringify(data, null, 2), 'tt-tracker-export.json', 'application/json');
}

function showExportModal() {
  showModal({
    title: t('export.title'),
    bodyHTML: `
      <p style="font-size:14px;color:var(--text-muted);margin-bottom:16px">${esc(t('export.description'))}</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn--primary" id="export-json-btn">${esc(t('export.json'))}</button>
        <button class="btn btn--secondary" id="export-players-csv-btn">${esc(t('export.playersCSV'))}</button>
        <button class="btn btn--secondary" id="export-matches-csv-btn">${esc(t('export.matchesCSV'))}</button>
      </div>
    `,
    footerHTML: ''
  });
  document.getElementById('export-json-btn').addEventListener('click', () => {
    exportJSON();
    hideModal();
    showToast(t('export.jsonDone'), 'success');
  });
  document.getElementById('export-players-csv-btn').addEventListener('click', () => {
    exportPlayersCSV();
    hideModal();
    showToast(t('export.playersDone'), 'success');
  });
  document.getElementById('export-matches-csv-btn').addEventListener('click', () => {
    exportMatchesCSV();
    hideModal();
    showToast(t('export.matchesDone'), 'success');
  });
}

export { csvEscape, downloadFile, exportPlayersCSV, exportMatchesCSV, exportJSON, showExportModal };
