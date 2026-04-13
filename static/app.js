/* ── State ────────────────────────────────────────────────────────────────── */
const state = {
  activeRace: null,
  horses: [],
  players: [],
  families: [],
  bet: { type: null, player: null, horse1: null, horse2: null, amount: null },
  balansSelectedRaces: [],   // empty = all (payout_event logic), filled = filter
};

// Numpad state for race results entry
let resultAssignments = {};  // pos (1-8) -> horse_id
let activeResultPos = 1;

// Numpad state for eindklassement predictions
let ekAssignments = {};      // pos (1-8) -> horse_id
let activeEkPos = 1;

const ORDINALS = ['1e', '2e', '3e', '4e', '5e', '6e', '7e', '8e'];

/* ── Section navigation ───────────────────────────────────────────────────── */
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  const loaders = {
    'section-home':       loadHome,
    'section-nieuwe-bet': loadNieuweBet,
    'section-resultaten': loadResultaten,
    'section-bets':       loadBets,
    'section-balans':     loadBalans,
    'section-overzicht':  loadOverzicht,
    'section-spelers':    loadSpelers,
    'section-odds':       loadOdds,
  };
  if (loaders[id]) loaders[id]();
}

/* ── API helpers ──────────────────────────────────────────────────────────── */
async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Onbekende fout');
  return data;
}

/* ── Shared data loaders ──────────────────────────────────────────────────── */
async function fetchActiveRace() {
  try { state.activeRace = await api('/api/races/active'); }
  catch { state.activeRace = null; }
}
async function fetchHorses() { state.horses = await api('/api/horses'); }
async function fetchPlayers() {
  state.players = await api('/api/players');
  state.families = await api('/api/families');
}
function raceBadgeText() {
  if (!state.activeRace) return 'Alle races afgerond';
  return `Race ${state.activeRace.id} · Max €${state.activeRace.bet_cap}`;
}

/* ── Home ─────────────────────────────────────────────────────────────────── */
async function loadHome() {
  await fetchActiveRace();
  document.getElementById('home-race-info').textContent = raceBadgeText();
}

/* ── Nieuwe Bet ───────────────────────────────────────────────────────────── */
async function loadNieuweBet() {
  await Promise.all([fetchActiveRace(), fetchHorses(), fetchPlayers()]);
  if (!state.activeRace) {
    alert('Er zijn geen actieve races meer. Alle 5 races zijn afgerond.');
    showSection('section-home');
    return;
  }
  document.getElementById('bet-race-info').textContent = raceBadgeText();
  resetBetFlow();
}

function resetBetFlow() {
  state.bet = { type: null, player: null, horse1: null, horse2: null, amount: null, predictions: null, editBetId: null };
  betGoToStep('type');
}

function betGoToStep(step) {
  ['type', 'combined', 'success'].forEach(s =>
    document.getElementById(`bet-step-${s}`).classList.add('hidden')
  );
  document.getElementById(`bet-step-${step}`).classList.remove('hidden');
  if (step === 'combined') renderCombinedStep();
}

function selectBetType(type) {
  state.bet.type = type;
  state.bet.player = null;
  state.bet.horse1 = null;
  state.bet.horse2 = null;
  state.bet.predictions = null;
  state.bet.amount = null;
  state.bet.editBetId = null;
  betGoToStep('combined');
}

/* ── Combined bet step ────────────────────────────────────────────────────── */
async function renderCombinedStep() {
  const type = state.bet.type;
  const isEk = type === 'eindklassement';
  const isDouble = type === 'double';

  // Show/hide horse vs EK sections
  document.getElementById('combined-horses-section').classList.toggle('hidden', isEk);
  document.getElementById('combined-ek-section').classList.toggle('hidden', !isEk);

  if (!isEk) {
    document.getElementById('combined-horse-title').textContent = isDouble ? 'Kies eerste paard' : 'Kies paard';
    document.getElementById('combined-horse2-section').classList.toggle('hidden', !isDouble);
    renderCombinedHorseGrid('combined-horse-grid', 1);
    if (isDouble) renderCombinedHorseGrid('combined-horse-grid-2', 2);
  } else {
    await renderCombinedEkStandings();
    renderCombinedEkGrid();
  }

  await renderCombinedPlayerList();
  renderCombinedAmountSection();
}

async function renderCombinedPlayerList() {
  const container = document.getElementById('combined-player-list');
  container.innerHTML = '<p style="color:var(--text-dim);font-size:.85rem">Laden...</p>';

  let ekBetByPlayer = {};
  if (state.bet.type === 'eindklassement') {
    try {
      const bets = await api('/api/eindklassement/bets');
      bets.forEach(b => { ekBetByPlayer[b.player_id] = b; });
    } catch {}
  }

  container.innerHTML = '';
  const byFamily = {};
  state.players.forEach(p => {
    if (!byFamily[p.family_name]) byFamily[p.family_name] = [];
    byFamily[p.family_name].push(p);
  });
  if (Object.keys(byFamily).length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim)">Geen spelers. Voeg eerst een speler toe.</p>';
    return;
  }
  for (const family of Object.keys(byFamily).sort()) {
    const group = document.createElement('div');
    group.className = 'family-group';
    group.innerHTML = `<h4>${family}</h4>`;
    const wrap = document.createElement('div');
    wrap.className = 'family-players';
    byFamily[family].forEach(p => {
      const btn = document.createElement('button');

      const ekBet = ekBetByPlayer[p.id];
      const isEk = state.bet.type === 'eindklassement';
      const canEdit = isEk && ekBet && ekBet.race_status === 'open';
      const isLocked = isEk && ekBet && ekBet.race_status !== 'open';

      if (isLocked) {
        btn.className = 'player-btn player-btn-dimmed';
        btn.disabled = true;
        btn.title = 'Bet geplaatst in afgesloten race';
      } else if (canEdit) {
        btn.className = 'player-btn player-btn-dimmed';
        btn.title = 'Voorspelling bewerken';
      } else {
        btn.className = 'player-btn';
      }

      if (state.bet.player && state.bet.player.id === p.id) btn.classList.add('selected');

      btn.innerHTML = `${p.name}${canEdit ? ' <span class="player-edit-tag">bewerken</span>' : ''}`;

      btn.onclick = async () => {
        document.querySelectorAll('#combined-player-list .player-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.bet.player = p;

        if (isEk && ekBet) {
          try {
            const preds = await api(`/api/bets/${ekBet.bet_id}/predictions`);
            state.bet.predictions = preds.map(pr => ({
              horse_id: pr.horse_id,
              predicted_position: pr.predicted_position,
            }));
          } catch { state.bet.predictions = null; }
          state.bet.amount = ekBet.amount;
          state.bet.editBetId = ekBet.bet_id;
          renderCombinedEkGrid();
          renderCombinedAmountSection();
        } else {
          state.bet.predictions = null;
          state.bet.editBetId = null;
        }
      };
      wrap.appendChild(btn);
    });
    group.appendChild(wrap);
    container.appendChild(group);
  }
}

function renderCombinedHorseGrid(containerId, slot) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  state.horses.forEach(h => {
    const btn = document.createElement('button');
    btn.className = 'horse-btn';
    const other = slot === 1 ? state.bet.horse2 : state.bet.horse1;
    const current = slot === 1 ? state.bet.horse1 : state.bet.horse2;
    if (other && other.id === h.id) btn.disabled = true;
    if (current && current.id === h.id) btn.classList.add('selected');
    btn.innerHTML = `${h.name}<span class="odds-tag">odds: ${h.odds}</span>`;
    btn.onclick = () => {
      if (slot === 1) state.bet.horse1 = h;
      else state.bet.horse2 = h;
      renderCombinedHorseGrid('combined-horse-grid', 1);
      if (state.bet.type === 'double') renderCombinedHorseGrid('combined-horse-grid-2', 2);
    };
    container.appendChild(btn);
  });
}

async function renderCombinedEkStandings() {
  const bar = document.getElementById('combined-ek-standings-info');
  try {
    const standings = await api('/api/eindklassement/standings');
    const hasPoints = standings.some(s => s.total_points > 0);
    if (hasPoints) {
      bar.innerHTML = '<span class="ek-standings-label">Huidige stand:</span> ' +
        standings.slice(0, 8).map(s =>
          `<span class="ek-standing-chip">${s.rank}. ${s.horse_name} (${s.total_points}pt)</span>`
        ).join('');
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  } catch { bar.classList.add('hidden'); }
}

/* ── Numpad: eindklassement predictions ───────────────────────────────────── */
function renderCombinedEkGrid() {
  // Pre-populate from existing predictions (edit mode)
  ekAssignments = {};
  activeEkPos = 1;
  if (state.bet.predictions) {
    state.bet.predictions.forEach(p => { ekAssignments[p.predicted_position] = p.horse_id; });
    for (let pos = 1; pos <= 8; pos++) {
      if (!ekAssignments[pos]) { activeEkPos = pos; break; }
    }
    if (Object.keys(ekAssignments).length === 8) activeEkPos = 1;
  }

  const grid = document.getElementById('combined-ek-grid');
  grid.innerHTML = '';
  grid.className = 'numpad-layout';

  const posSection = document.createElement('div');
  posSection.className = 'numpad-positions';
  posSection.id = 'ek-pos-rows';
  for (let pos = 1; pos <= 8; pos++) posSection.appendChild(buildEkPosRow(pos));

  const horsesSection = document.createElement('div');
  horsesSection.className = 'numpad-horses';
  horsesSection.id = 'ek-horse-btns';
  state.horses.forEach(h => horsesSection.appendChild(buildEkHorseBtn(h)));

  grid.appendChild(posSection);
  grid.appendChild(horsesSection);
}

function buildEkPosRow(pos) {
  const horseId = ekAssignments[pos];
  const horse = horseId ? state.horses.find(h => h.id === horseId) : null;
  const row = document.createElement('div');
  row.className = 'numpad-pos-row' + (pos === activeEkPos ? ' active' : '') + (horse ? ' filled' : '');
  row.id = `ek-posrow-${pos}`;
  row.innerHTML = `
    <span class="numpad-pos-label">${ORDINALS[pos - 1]}</span>
    <span class="numpad-pos-horse">${horse ? horse.name : '—'}</span>
    ${horse ? `<button class="numpad-pos-clear" title="Wissen" onclick="clearEkPos(event,${pos})">×</button>` : ''}
  `;
  row.onclick = () => setActiveEkPos(pos);
  return row;
}

function buildEkHorseBtn(horse) {
  const assigned = Object.values(ekAssignments).includes(horse.id);
  const btn = document.createElement('button');
  btn.className = 'numpad-horse-btn';
  btn.id = `ek-horsebtn-${horse.id}`;
  btn.disabled = assigned;
  btn.innerHTML = `<span class="numpad-horse-num">${horse.id}</span><span class="numpad-horse-name">${horse.name}</span>`;
  btn.onclick = () => selectEkHorse(horse.id);
  return btn;
}

function setActiveEkPos(pos) {
  activeEkPos = pos;
  updateEkNumpadUI();
}

function clearEkPos(event, pos) {
  event.stopPropagation();
  delete ekAssignments[pos];
  activeEkPos = pos;
  updateEkNumpadUI();
}

function selectEkHorse(horseId) {
  ekAssignments[activeEkPos] = horseId;
  let next = activeEkPos + 1;
  while (next <= 8 && ekAssignments[next]) next++;
  if (next <= 8) activeEkPos = next;
  updateEkNumpadUI();
}

function updateEkNumpadUI() {
  for (let pos = 1; pos <= 8; pos++) {
    const row = document.getElementById(`ek-posrow-${pos}`);
    if (!row) continue;
    const horseId = ekAssignments[pos];
    const horse = horseId ? state.horses.find(h => h.id === horseId) : null;
    row.className = 'numpad-pos-row' + (pos === activeEkPos ? ' active' : '') + (horse ? ' filled' : '');
    row.innerHTML = `
      <span class="numpad-pos-label">${ORDINALS[pos - 1]}</span>
      <span class="numpad-pos-horse">${horse ? horse.name : '—'}</span>
      ${horse ? `<button class="numpad-pos-clear" title="Wissen" onclick="clearEkPos(event,${pos})">×</button>` : ''}
    `;
    row.onclick = () => setActiveEkPos(pos);
  }
  state.horses.forEach(h => {
    const btn = document.getElementById(`ek-horsebtn-${h.id}`);
    if (btn) btn.disabled = Object.values(ekAssignments).includes(h.id);
  });
}

function renderCombinedAmountSection() {
  const cap = state.activeRace.bet_cap;
  document.getElementById('combined-amount-cap-info').textContent = `Maximum inzet: €${cap}`;

  const btnContainer = document.getElementById('combined-amount-buttons');
  btnContainer.innerHTML = '';
  for (let v = 1; v <= cap; v++) {
    const btn = document.createElement('button');
    btn.className = 'amount-btn';
    btn.textContent = `€${v}`;
    if (state.bet.amount === v) btn.classList.add('selected');
    btn.onclick = () => {
      document.querySelectorAll('#combined-amount-buttons .amount-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('combined-amount-input').value = v;
      state.bet.amount = v;
    };
    btnContainer.appendChild(btn);
  }
  const input = document.getElementById('combined-amount-input');
  input.max = cap;
  if (state.bet.amount) {
    const isInteger = Number.isInteger(state.bet.amount);
    if (!isInteger) input.value = state.bet.amount;
  } else {
    input.value = '';
  }
  if (state.bet.amount && !btnContainer.querySelector('.selected')) {
    input.value = state.bet.amount;
  }
  input.oninput = () => {
    document.querySelectorAll('#combined-amount-buttons .amount-btn').forEach(b => b.classList.remove('selected'));
    state.bet.amount = parseFloat(input.value) || null;
  };
}


async function submitBet() {
  if (!state.bet.player) { alert('Kies een speler.'); return; }

  const amountInput = document.getElementById('combined-amount-input');
  const amount = state.bet.amount || parseFloat(amountInput?.value);
  if (!amount || amount <= 0) { alert('Vul een geldig bedrag in.'); return; }

  // For single/double: validate horse selection
  if (state.bet.type === 'single' && !state.bet.horse1) { alert('Kies een paard.'); return; }
  if (state.bet.type === 'double' && (!state.bet.horse1 || !state.bet.horse2)) { alert('Kies twee paarden.'); return; }

  // For eindklassement: collect predictions from numpad state
  if (state.bet.type === 'eindklassement') {
    const errEl = document.getElementById('combined-ek-error');
    errEl.textContent = '';
    for (let pos = 1; pos <= 8; pos++) {
      if (!ekAssignments[pos]) { errEl.textContent = `Vul positie ${pos} in.`; return; }
    }
    state.bet.predictions = Object.entries(ekAssignments).map(([pos, horseId]) => ({
      horse_id: horseId, predicted_position: parseInt(pos),
    }));
  }

  try {
    if (state.bet.editBetId) {
      // Edit mode: update predictions and amount separately
      await api(`/api/bets/${state.bet.editBetId}/predictions`, 'PUT', {
        predictions: state.bet.predictions,
      });
      await api(`/api/bets/${state.bet.editBetId}`, 'PUT', { amount });
    } else {
      const body = {
        player_id: state.bet.player.id,
        bet_type: state.bet.type,
        horse1_id: state.bet.horse1 ? state.bet.horse1.id : null,
        horse2_id: state.bet.horse2 ? state.bet.horse2.id : null,
        amount,
      };
      if (state.bet.type === 'eindklassement') body.predictions = state.bet.predictions;
      await api(`/api/races/${state.activeRace.id}/bets`, 'POST', body);
    }
    const typeLabel = { single: 'Single', double: 'Double', eindklassement: 'Eindklassement' };
    let horsesText;
    if (state.bet.type === 'eindklassement') {
      horsesText = state.bet.editBetId ? 'Top-8 voorspelling bijgewerkt' : 'Top-8 voorspelling';
    } else {
      horsesText = state.bet.horse1 ? state.bet.horse1.name : '';
      if (state.bet.horse2) horsesText += ` + ${state.bet.horse2.name}`;
    }
    document.getElementById('bet-success-detail').innerHTML =
      `${state.bet.player.name} · ${typeLabel[state.bet.type]}<br>${horsesText} · €${amount}`;
    betGoToStep('success');
  } catch (err) { alert(`Fout: ${err.message}`); }
}

/* ── Race Resultaten ──────────────────────────────────────────────────────── */
async function loadResultaten() {
  await Promise.all([fetchActiveRace(), fetchHorses()]);

  // Reset to history view
  document.getElementById('results-history-view').classList.remove('hidden');
  document.getElementById('results-entry-view').classList.add('hidden');
  document.getElementById('results-summary').classList.add('hidden');

  await renderResultatenHistory();

  // Show/hide enter button
  const btnWrap = document.getElementById('results-enter-btn-wrap');
  if (state.activeRace) {
    btnWrap.style.display = '';
    document.getElementById('btn-race-nr').textContent = state.activeRace.id;
  } else {
    btnWrap.style.display = 'none';
  }
}

async function renderResultatenHistory() {
  const list = document.getElementById('results-history-list');
  const noFinished = document.getElementById('results-no-finished');
  list.innerHTML = '<p style="color:var(--text-dim);font-size:.85rem;padding:8px 0">Laden...</p>';

  let data;
  try { data = await api('/api/results/table'); }
  catch { list.innerHTML = '<p class="detail-error">Kon stand niet laden.</p>'; return; }

  const { race_ids, horses } = data;

  if (!race_ids || race_ids.length === 0) {
    list.innerHTML = '';
    noFinished.classList.remove('hidden');
    return;
  }
  noFinished.classList.add('hidden');
  list.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'standings-table-wrap';

  const table = document.createElement('table');
  table.className = 'standings-table';

  // Header
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>
    <th class="st-rank">#</th>
    <th class="st-horse">Paard</th>
    ${race_ids.map(r => `<th class="st-race">Race ${r}</th>`).join('')}
    <th class="st-total">Totaal</th>
  </tr>`;
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  horses.forEach((h, idx) => {
    const tr = document.createElement('tr');
    const positionCells = race_ids.map(r => {
      const pos = h.positions[String(r)];
      if (pos == null) return `<td class="st-race st-empty">—</td>`;
      const cls = pos === 1 ? 'pos-gold' : pos === 2 ? 'pos-silver' : pos === 3 ? 'pos-bronze' : 'pos-other';
      return `<td class="st-race"><span class="st-pos ${cls}">${pos}</span></td>`;
    }).join('');
    tr.innerHTML = `
      <td class="st-rank">${idx + 1}</td>
      <td class="st-horse">${h.horse_name}</td>
      ${positionCells}
      <td class="st-total">${h.total_points}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  list.appendChild(wrap);
}

function showResultatenForm() {
  resultAssignments = {};
  activeResultPos = 1;
  document.getElementById('results-history-view').classList.add('hidden');
  document.getElementById('results-entry-view').classList.remove('hidden');
  document.getElementById('results-summary').classList.add('hidden');
  document.getElementById('results-race-info').textContent =
    state.activeRace ? `Race ${state.activeRace.id}` : '';
  renderResultPositions();
}

function showResultatenHistory() {
  document.getElementById('results-history-view').classList.remove('hidden');
  document.getElementById('results-entry-view').classList.add('hidden');
  document.getElementById('results-summary').classList.add('hidden');
}

/* ── Numpad: race results ─────────────────────────────────────────────────── */
function renderResultPositions() {
  const container = document.getElementById('results-positions');
  container.innerHTML = '';
  container.className = 'numpad-layout';

  const posSection = document.createElement('div');
  posSection.className = 'numpad-positions';
  posSection.id = 'result-pos-rows';
  for (let pos = 1; pos <= 8; pos++) posSection.appendChild(buildResultPosRow(pos));

  const horsesSection = document.createElement('div');
  horsesSection.className = 'numpad-horses';
  horsesSection.id = 'result-horse-btns';
  state.horses.forEach(h => horsesSection.appendChild(buildResultHorseBtn(h)));

  container.appendChild(posSection);
  container.appendChild(horsesSection);
}

function buildResultPosRow(pos) {
  const horseId = resultAssignments[pos];
  const horse = horseId ? state.horses.find(h => h.id === horseId) : null;
  const row = document.createElement('div');
  row.className = 'numpad-pos-row' + (pos === activeResultPos ? ' active' : '') + (horse ? ' filled' : '');
  row.id = `result-posrow-${pos}`;
  row.innerHTML = `
    <span class="numpad-pos-label">${ORDINALS[pos - 1]}</span>
    <span class="numpad-pos-horse">${horse ? horse.name : '—'}</span>
    ${horse ? `<button class="numpad-pos-clear" title="Wissen" onclick="clearResultPos(event,${pos})">×</button>` : ''}
  `;
  row.onclick = () => setActiveResultPos(pos);
  return row;
}

function buildResultHorseBtn(horse) {
  const assigned = Object.values(resultAssignments).includes(horse.id);
  const btn = document.createElement('button');
  btn.className = 'numpad-horse-btn';
  btn.id = `result-horsebtn-${horse.id}`;
  btn.disabled = assigned;
  btn.innerHTML = `<span class="numpad-horse-num">${horse.id}</span><span class="numpad-horse-name">${horse.name}</span>`;
  btn.onclick = () => selectResultHorse(horse.id);
  return btn;
}

function setActiveResultPos(pos) {
  activeResultPos = pos;
  updateResultNumpadUI();
}

function clearResultPos(event, pos) {
  event.stopPropagation();
  delete resultAssignments[pos];
  activeResultPos = pos;
  updateResultNumpadUI();
}

function selectResultHorse(horseId) {
  resultAssignments[activeResultPos] = horseId;
  // Advance to next unfilled position
  let next = activeResultPos + 1;
  while (next <= 8 && resultAssignments[next]) next++;
  if (next <= 8) activeResultPos = next;
  updateResultNumpadUI();
}

function updateResultNumpadUI() {
  for (let pos = 1; pos <= 8; pos++) {
    const row = document.getElementById(`result-posrow-${pos}`);
    if (!row) continue;
    const horseId = resultAssignments[pos];
    const horse = horseId ? state.horses.find(h => h.id === horseId) : null;
    row.className = 'numpad-pos-row' + (pos === activeResultPos ? ' active' : '') + (horse ? ' filled' : '');
    row.innerHTML = `
      <span class="numpad-pos-label">${ORDINALS[pos - 1]}</span>
      <span class="numpad-pos-horse">${horse ? horse.name : '—'}</span>
      ${horse ? `<button class="numpad-pos-clear" title="Wissen" onclick="clearResultPos(event,${pos})">×</button>` : ''}
    `;
    row.onclick = () => setActiveResultPos(pos);
  }
  state.horses.forEach(h => {
    const btn = document.getElementById(`result-horsebtn-${h.id}`);
    if (btn) btn.disabled = Object.values(resultAssignments).includes(h.id);
  });
}

async function submitResults() {
  for (let pos = 1; pos <= 8; pos++) {
    if (!resultAssignments[pos]) { alert(`Vul positie ${pos} in.`); return; }
  }
  const positions = Object.entries(resultAssignments).map(([pos, horseId]) => ({
    position: parseInt(pos), horse_id: horseId,
  }));
  try {
    const result = await api(`/api/races/${state.activeRace.id}/results`, 'POST', { positions });
    document.getElementById('results-race-nr').textContent = state.activeRace.id;
    await renderPayoutSummary(result.payouts);
    document.getElementById('results-history-view').classList.add('hidden');
    document.getElementById('results-entry-view').classList.add('hidden');
    document.getElementById('results-summary').classList.remove('hidden');
  } catch (err) { alert(`Fout: ${err.message}`); }
}

async function renderPayoutSummary(payouts) {
  // FIX: use p.name (not p.player_name) — /api/players returns field 'name'
  const players = await api('/api/players');
  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  const container = document.getElementById('results-payout-list');
  container.innerHTML = '';

  const totals = {};
  payouts.forEach(p => {
    if (!totals[p.player_id]) totals[p.player_id] = 0;
    totals[p.player_id] += p.amount;
  });

  if (Object.keys(totals).length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim)">Geen bets voor deze race.</p>';
    return;
  }

  Object.entries(totals).sort((a, b) => b[1] - a[1]).forEach(([pid, total]) => {
    const p = playerMap[parseInt(pid)];
    const row = document.createElement('div');
    row.className = 'payout-row';
    // p.name is the player's first name; p.family_name is the family
    const name = p ? `${p.name} (${p.family_name})` : `Speler ${pid}`;
    row.innerHTML = `
      <span>${name}</span>
      <span class="payout-amount ${total > 0 ? '' : 'zero'}">€${total.toFixed(2)}</span>
    `;
    container.appendChild(row);
  });
}

/* ── Bets tab ─────────────────────────────────────────────────────────────── */
let betsRaceId = null;
let betsRaceStatus = null;

async function loadBets() {
  await fetchActiveRace();
  let races;
  try { races = await api('/api/races'); } catch { races = []; }

  const tabsContainer = document.getElementById('bets-race-tabs');
  tabsContainer.innerHTML = '';

  if (races.length === 0) {
    document.getElementById('bets-no-race').classList.remove('hidden');
    document.getElementById('bets-content').classList.add('hidden');
    return;
  }

  document.getElementById('bets-no-race').classList.add('hidden');
  document.getElementById('bets-content').classList.remove('hidden');

  // Build race tabs
  races.forEach((r, idx) => {
    const tab = document.createElement('button');
    tab.className = 'race-tab';
    tab.textContent = `Race ${r.id}`;
    if (r.status === 'finished') tab.classList.add('race-tab-done');
    tab.onclick = () => selectBetsRace(r.id, r.status, races);
    tabsContainer.appendChild(tab);
    // Default: last race
    if (idx === races.length - 1) tab.classList.add('race-tab-active');
  });

  const latest = races[races.length - 1];
  await selectBetsRace(latest.id, latest.status, races);
}

async function selectBetsRace(raceId, raceStatus, races) {
  betsRaceId = raceId;
  betsRaceStatus = raceStatus;

  // Update tab active states
  const tabs = document.querySelectorAll('.race-tab');
  tabs.forEach((tab, idx) => {
    tab.classList.toggle('race-tab-active', (races || [])[idx]?.id === raceId);
  });

  // If races array not passed, re-derive from DOM (for calls not passing it)
  document.getElementById('bets-status-badge').textContent =
    `Race ${raceId}${raceStatus === 'finished' ? ' — afgerond' : ' — open'}`;

  const actionsEl = document.getElementById('bets-actions');
  actionsEl.style.display = raceStatus === 'open' ? '' : 'none';

  await renderBetsList(raceId, raceStatus);
}

async function renderBetsList(raceId, raceStatus) {
  const container = document.getElementById('bets-list');
  container.innerHTML = '';

  let bets;
  try { bets = await api(`/api/races/${raceId}/bets`); }
  catch { container.innerHTML = '<p class="info-msg">Kon bets niet laden.</p>'; return; }

  if (bets.length === 0) {
    container.innerHTML = '<p class="info-msg">Geen bets voor deze race.</p>';
    return;
  }

  const typeLabel = { single: 'Single', double: 'Double', eindklassement: 'Eindklassement' };
  const cap = state.activeRace ? state.activeRace.bet_cap : 15;
  const isOpen = raceStatus === 'open';

  bets.forEach(bet => {
    const isEk = bet.bet_type === 'eindklassement';
    const horses = isEk
      ? '8 paarden voorspeld'
      : [bet.horse1_name, bet.horse2_name].filter(Boolean).join(' + ');
    const card = document.createElement('div');
    card.className = 'bet-card';
    card.id = `bet-card-${bet.id}`;
    card.innerHTML = `
      <div class="bet-card-main">
        <div class="bet-card-info">
          <span class="bet-player-name">${bet.player_name}</span>
          <span class="bet-family-tag">${bet.family_name}</span>
        </div>
        <div class="bet-card-detail">
          <span class="bet-type-tag">${typeLabel[bet.bet_type] || bet.bet_type}</span>
          <span class="bet-horse-name">${horses}</span>
          <span class="bet-card-amount">€${bet.amount.toFixed(2)}</span>
        </div>
        ${isEk ? `
        <div class="bet-card-actions">
          <button class="btn-edit-bet" onclick="toggleEkPredictions(${bet.id})">Voorspelling tonen</button>
          ${isOpen ? `<button class="btn-delete-bet" onclick="deleteSingleBet(${bet.id})">Verwijderen</button>` : ''}
        </div>` : isOpen ? `
        <div class="bet-card-actions">
          <button class="btn-edit-bet" onclick="toggleEditBet(${bet.id}, ${bet.amount})">Bewerken</button>
          <button class="btn-delete-bet" onclick="deleteSingleBet(${bet.id})">Verwijderen</button>
        </div>` : ''}
      </div>
      ${isEk ? `<div class="ek-predictions-panel hidden" id="ek-panel-${bet.id}"><p class="detail-loading">Laden...</p></div>` : ''}
      <div class="bet-edit-form hidden" id="bet-edit-${bet.id}">
        <label>Nieuw bedrag (max €${cap}):</label>
        <div class="bet-edit-row">
          <input type="number" id="bet-edit-amount-${bet.id}" value="${bet.amount}" min="1" max="${cap}" step="1">
          <button onclick="saveEditBet(${bet.id}, ${raceId})">Opslaan</button>
          <button onclick="toggleEditBet(${bet.id})">Annuleren</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

async function toggleEkPredictions(betId) {
  const panel = document.getElementById(`ek-panel-${betId}`);
  const isHidden = panel.classList.contains('hidden');
  document.querySelectorAll('.ek-predictions-panel').forEach(p => p.classList.add('hidden'));
  if (!isHidden) return;

  panel.classList.remove('hidden');
  if (panel.querySelector('.detail-loading')) {
    try {
      const preds = await api(`/api/bets/${betId}/predictions`);
      panel.innerHTML = '';
      const medalLabels = { 1: '🥇', 2: '🥈', 3: '🥉' };
      preds.forEach(p => {
        const row = document.createElement('div');
        row.className = 'rhistory-row';
        const medal = medalLabels[p.predicted_position] || `${p.predicted_position}e`;
        row.innerHTML = `<span class="rhistory-pos">${medal}</span><span class="rhistory-horse">${p.horse_name}</span>`;
        panel.appendChild(row);
      });
    } catch (err) {
      panel.innerHTML = `<p class="detail-error">${err.message}</p>`;
    }
  }
}

function toggleEditBet(betId, currentAmount) {
  const form = document.getElementById(`bet-edit-${betId}`);
  const isHidden = form.classList.contains('hidden');
  document.querySelectorAll('.bet-edit-form').forEach(f => f.classList.add('hidden'));
  if (isHidden) {
    form.classList.remove('hidden');
    if (currentAmount !== undefined)
      document.getElementById(`bet-edit-amount-${betId}`).value = currentAmount;
  }
}

async function saveEditBet(betId, raceId) {
  const amount = parseFloat(document.getElementById(`bet-edit-amount-${betId}`).value);
  if (!amount || amount <= 0) { alert('Vul een geldig bedrag in.'); return; }
  try {
    await api(`/api/bets/${betId}`, 'PUT', { amount });
    await renderBetsList(raceId, 'open');
  } catch (err) { alert(`Fout: ${err.message}`); }
}

async function deleteSingleBet(betId) {
  if (!confirm('Weet je zeker dat je deze bet wilt verwijderen?')) return;
  try {
    await api(`/api/bets/${betId}`, 'DELETE');
    await renderBetsList(betsRaceId, 'open');
  } catch (err) { alert(`Fout: ${err.message}`); }
}

async function confirmDeleteAllBets() {
  if (!betsRaceId) return;
  if (!confirm(`Alle bets voor Race ${betsRaceId} verwijderen?`)) return;
  try {
    await api(`/api/races/${betsRaceId}/bets`, 'DELETE');
    await renderBetsList(betsRaceId, 'open');
  } catch (err) { alert(`Fout: ${err.message}`); }
}

async function confirmDeleteRace() {
  if (!betsRaceId) return;
  if (!confirm(
    `Race ${betsRaceId} volledig verwijderen?\n\n` +
    `Dit reset Race ${betsRaceId} en verwijdert alle latere races, bets en resultaten.`
  )) return;
  try {
    await api(`/api/races/${betsRaceId}`, 'DELETE');
    await loadBets();
  } catch (err) { alert(`Fout: ${err.message}`); }
}

/* ── Balans ───────────────────────────────────────────────────────────────── */
let openBalansPlayer = null;

async function loadBalans() {
  openBalansPlayer = null;
  await buildBalansFilter();
  await renderBalans();
}

async function buildBalansFilter() {
  const chips = document.getElementById('balans-race-chips');
  chips.innerHTML = '';
  let races;
  try { races = await api('/api/races'); } catch { return; }

  const finished = races.filter(r => r.status === 'finished');
  finished.forEach(r => {
    const chip = document.createElement('button');
    chip.className = 'race-chip';
    chip.textContent = `Race ${r.id}`;
    chip.dataset.raceId = r.id;
    if (state.balansSelectedRaces.includes(r.id)) chip.classList.add('race-chip-active');
    chip.onclick = () => toggleBalansRace(r.id, chip);
    chips.appendChild(chip);
  });
}

function toggleBalansRace(raceId, chipEl) {
  const idx = state.balansSelectedRaces.indexOf(raceId);
  if (idx === -1) {
    state.balansSelectedRaces.push(raceId);
    chipEl.classList.add('race-chip-active');
  } else {
    state.balansSelectedRaces.splice(idx, 1);
    chipEl.classList.remove('race-chip-active');
  }
  renderBalans();
}

async function clearBalansFilter() {
  state.balansSelectedRaces = [];
  document.querySelectorAll('.race-chip').forEach(c => c.classList.remove('race-chip-active'));
  await renderBalans();
}

async function renderBalans() {
  const qs = state.balansSelectedRaces.length
    ? `?races=${state.balansSelectedRaces.join(',')}`
    : '';
  const balans = await api(`/api/balance${qs}`);
  const container = document.getElementById('balans-list');
  container.innerHTML = '';
  openBalansPlayer = null;

  const byFamily = {};
  balans.forEach(p => {
    if (!byFamily[p.family_name]) byFamily[p.family_name] = [];
    byFamily[p.family_name].push(p);
  });

  if (Object.keys(byFamily).length === 0) {
    container.innerHTML = '<p class="info-msg">Geen spelers gevonden.</p>';
    return;
  }

  for (const family of Object.keys(byFamily).sort()) {
    const block = document.createElement('div');
    block.className = 'family-block';
    block.innerHTML = `<h4>${family}</h4>`;

    byFamily[family].forEach(p => {
      const row = document.createElement('div');
      row.className = 'balans-row';
      row.id = `balans-row-${p.player_id}`;
      row.innerHTML = `
        <span class="balans-name">${p.player_name}</span>
        <span class="balans-right">
          <span class="balans-total ${p.total > 0 ? 'positive' : 'zero'}">€${p.total.toFixed(2)}</span>
          <span class="balans-chevron" id="chevron-${p.player_id}">▼</span>
        </span>
      `;
      row.onclick = () => togglePlayerDetail(p.player_id);
      block.appendChild(row);

      const detail = document.createElement('div');
      detail.className = 'player-detail hidden';
      detail.id = `detail-${p.player_id}`;
      detail.innerHTML = '<p class="detail-loading">Laden...</p>';
      block.appendChild(detail);
    });

    container.appendChild(block);
  }
}

async function togglePlayerDetail(playerId) {
  const detail = document.getElementById(`detail-${playerId}`);
  const chevron = document.getElementById(`chevron-${playerId}`);
  const isOpen = !detail.classList.contains('hidden');

  document.querySelectorAll('.player-detail').forEach(d => d.classList.add('hidden'));
  document.querySelectorAll('.balans-chevron').forEach(c => c.textContent = '▼');
  document.querySelectorAll('.balans-row').forEach(r => r.classList.remove('balans-row-open'));

  if (isOpen) { openBalansPlayer = null; return; }

  openBalansPlayer = playerId;
  detail.classList.remove('hidden');
  chevron.textContent = '▲';
  document.getElementById(`balans-row-${playerId}`).classList.add('balans-row-open');

  if (detail.querySelector('.detail-loading')) {
    await loadPlayerDetail(playerId, detail);
  }
}

async function loadPlayerDetail(playerId, container) {
  try {
    const qs = state.balansSelectedRaces.length
      ? `?races=${state.balansSelectedRaces.join(',')}`
      : '';
    const data = await api(`/api/balance/${playerId}${qs}`);
    container.innerHTML = '';

    if (data.bets.length === 0) {
      container.innerHTML = '<p class="detail-empty">Geen bets geplaatst.</p>';
      return;
    }

    const typeLabel = { single: 'Single', double: 'Double', eindklassement: 'Eindklassement' };

    // Scrollable table wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'detail-table-wrap';

    const table = document.createElement('table');
    table.className = 'detail-table';
    table.innerHTML = `
      <thead><tr>
        <th>Race</th>
        <th>Paard(en)</th>
        <th>Positie</th>
        <th>Inzet</th>
        <th>Berekening</th>
        <th>Uitbetaling</th>
        <th>Uitbetaald</th>
      </tr></thead>
    `;
    const tbody = document.createElement('tbody');

    data.bets.forEach(b => {
      const isEk = b.bet_type === 'eindklassement';
      const horses = isEk
        ? '8 paarden voorspeld'
        : [b.horse1_name, b.horse2_name].filter(Boolean).join(' + ');
      const pending = isEk ? !b.has_payout : b.race_status !== 'finished';

      // Build position string
      let posText = '—';
      if (!pending) {
        const p1 = b.horse1_position ? `${b.horse1_position}e` : null;
        const p2 = b.horse2_position ? `${b.horse2_position}e` : null;
        posText = [p1, p2].filter(Boolean).join(' / ') || '—';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="detail-race">Race ${b.race_id}<br><small>${typeLabel[b.bet_type] || b.bet_type}</small></td>
        <td class="detail-horses">${horses}</td>
        <td class="detail-pos">${posText}</td>
        <td class="detail-inzet">€${b.amount.toFixed(2)}</td>
        <td class="detail-formula">${pending ? '(lopend)' : b.formula}</td>
        <td class="detail-payout ${b.payout > 0 ? 'win' : 'lose'}">
          ${pending ? '—' : '€' + b.payout.toFixed(2)}
        </td>
        <td class="detail-paid-out ${b.paid_out > 0 ? 'paid' : 'unpaid'}">
          ${b.paid_out > 0 ? '€' + b.paid_out.toFixed(2) : '—'}
        </td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);

    const totalRow = document.createElement('div');
    totalRow.className = 'detail-total-row';
    totalRow.innerHTML = `<span>Totaal</span><span class="detail-total-amount">€${data.total.toFixed(2)}</span>`;
    container.appendChild(totalRow);
  } catch (err) {
    container.innerHTML = `<p class="detail-error">${err.message}</p>`;
  }
}

async function confirmUitbetalen() {
  if (!confirm('Weet je zeker dat je de balans wilt uitbetalen en resetten?')) return;
  try {
    await api('/api/balance/uitbetalen', 'POST');
    state.balansSelectedRaces = [];
    loadBalans();
  } catch (err) { alert(`Fout: ${err.message}`); }
}

/* ── Overzicht ────────────────────────────────────────────────────────────── */
async function loadOverzicht() {
  const container = document.getElementById('overzicht-list');
  container.innerHTML = '';

  let overview;
  try { overview = await api('/api/races/overview'); }
  catch { container.innerHTML = '<p class="info-msg">Kon overzicht niet laden.</p>'; return; }

  if (overview.length === 0) {
    container.innerHTML = '<p class="info-msg">Geen races gevonden.</p>';
    return;
  }

  overview.forEach(r => {
    const card = document.createElement('div');
    card.className = `overzicht-card ${r.status === 'finished' ? 'overzicht-done' : 'overzicht-open'}`;
    card.innerHTML = `
      <div class="overzicht-card-header">
        <span class="overzicht-race-title">Race ${r.id}</span>
        <span class="overzicht-status-badge ${r.status === 'finished' ? 'badge-done' : 'badge-open'}">
          ${r.status === 'finished' ? 'Afgerond' : 'Open'}
        </span>
      </div>
      <div class="overzicht-stats">
        <div class="overzicht-stat">
          <span class="stat-label">Aantal bets</span>
          <span class="stat-value">${r.bet_count}</span>
        </div>
        <div class="overzicht-stat">
          <span class="stat-label">Totaal ingezet</span>
          <span class="stat-value">€${r.total_wagered.toFixed(2)}</span>
        </div>
        <div class="overzicht-stat">
          <span class="stat-label">Totaal uitbetaald</span>
          <span class="stat-value ${r.total_payout > 0 ? 'stat-win' : ''}">€${r.total_payout.toFixed(2)}</span>
        </div>
      </div>
      <button class="btn-danger overzicht-reset-btn" onclick="confirmResetRaceFromOverzicht(${r.id})">
        Race Resetten
      </button>
    `;
    container.appendChild(card);
  });
}

async function confirmResetRaceFromOverzicht(raceId) {
  if (!confirm(
    `Race ${raceId} resetten?\n\nAlle bets, resultaten en uitbetalingen voor Race ${raceId} ` +
    `en alle latere races worden verwijderd. Race ${raceId} wordt opnieuw opengesteld.`
  )) return;
  try {
    await api(`/api/races/${raceId}`, 'DELETE');
    await loadOverzicht();
  } catch (err) { alert(`Fout: ${err.message}`); }
}

/* ── Spelers ──────────────────────────────────────────────────────────────── */
async function loadSpelers() {
  await fetchPlayers();
  renderSpelersList();
  populateFamilyDropdown();
  document.getElementById('new-player-name').value = '';
  document.getElementById('new-player-msg').textContent = '';
  document.getElementById('new-player-msg').className = 'form-msg';
}

function renderSpelersList() {
  const container = document.getElementById('spelers-list');
  container.innerHTML = '';
  const byFamily = {};
  state.players.forEach(p => {
    if (!byFamily[p.family_name]) byFamily[p.family_name] = [];
    byFamily[p.family_name].push(p);
  });
  if (state.players.length === 0) {
    container.innerHTML = '<p class="info-msg">Nog geen spelers toegevoegd.</p>';
    return;
  }
  for (const family of Object.keys(byFamily).sort()) {
    const block = document.createElement('div');
    block.className = 'family-block';
    block.innerHTML = `<h4>${family}</h4>`;
    byFamily[family].forEach(p => {
      const row = document.createElement('div');
      row.className = 'speler-row';
      row.innerHTML = `
        <span class="speler-name">${p.name}</span>
        <button class="btn-delete-speler" onclick="deletePlayer(${p.id}, '${p.name.replace(/'/g, "\\'")}')">Verwijderen</button>
      `;
      block.appendChild(row);
    });
    container.appendChild(block);
  }
}

function populateFamilyDropdown() {
  const select = document.getElementById('new-player-family');
  select.innerHTML = '<option value="">-- Kies familie --</option>';
  state.families.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    select.appendChild(opt);
  });
}

async function deletePlayer(playerId, playerName) {
  if (!confirm(`${playerName} verwijderen?\nAlle bets van deze speler worden ook verwijderd.`)) return;
  try {
    await api(`/api/players/${playerId}`, 'DELETE');
    await fetchPlayers();
    renderSpelersList();
  } catch (err) { alert(`Fout: ${err.message}`); }
}

async function createPlayer() {
  const name = document.getElementById('new-player-name').value.trim();
  const familyId = parseInt(document.getElementById('new-player-family').value);
  const msgEl = document.getElementById('new-player-msg');
  if (!name || !familyId) {
    msgEl.textContent = 'Vul alle velden in.';
    msgEl.className = 'form-msg err';
    return;
  }
  try {
    await api('/api/players', 'POST', { name, family_id: familyId });
    msgEl.textContent = `${name} is toegevoegd!`;
    msgEl.className = 'form-msg ok';
    document.getElementById('new-player-name').value = '';
    document.getElementById('new-player-family').value = '';
    await fetchPlayers();
    renderSpelersList();
  } catch (err) {
    msgEl.textContent = `Fout: ${err.message}`;
    msgEl.className = 'form-msg err';
  }
}

/* ── Odds ─────────────────────────────────────────────────────────────────── */
async function loadOdds() {
  await fetchHorses();
  const container = document.getElementById('odds-list');
  container.innerHTML = '';
  state.horses.forEach(h => {
    const row = document.createElement('div');
    row.className = 'odds-row';
    row.innerHTML = `
      <span class="horse-name">${h.name}</span>
      <input type="number" id="odds-${h.id}" value="${h.odds}" min="0.1" step="0.5">
    `;
    container.appendChild(row);
  });
  document.getElementById('odds-msg').textContent = '';
}

async function saveAllOdds() {
  const msgEl = document.getElementById('odds-msg');
  msgEl.textContent = '';
  try {
    for (const h of state.horses) {
      const val = parseFloat(document.getElementById(`odds-${h.id}`).value);
      if (isNaN(val) || val <= 0) throw new Error(`Ongeldige odds voor ${h.name}`);
      await api(`/api/horses/${h.id}`, 'PUT', { odds: val });
    }
    await fetchHorses();
    msgEl.textContent = 'Odds opgeslagen!';
    msgEl.className = 'form-msg ok';
  } catch (err) {
    msgEl.textContent = `Fout: ${err.message}`;
    msgEl.className = 'form-msg err';
  }
}

/* ── Keyboard shortcuts for numpad entry ──────────────────────────────────── */
document.addEventListener('keydown', e => {
  // Only handle digit keys 1-8, ignore when focus is on an input/button
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  const num = parseInt(e.key);
  if (isNaN(num) || num < 1 || num > 8) return;

  // Race results entry active?
  const resultsEntry = document.getElementById('results-entry-view');
  if (resultsEntry && !resultsEntry.classList.contains('hidden')) {
    const btn = document.getElementById(`result-horsebtn-${num}`);
    if (btn && !btn.disabled) selectResultHorse(num);
    return;
  }

  // Eindklassement numpad active (combined bet step)?
  const ekSection = document.getElementById('combined-ek-section');
  const combinedStep = document.getElementById('bet-step-combined');
  if (
    ekSection && !ekSection.classList.contains('hidden') &&
    combinedStep && !combinedStep.classList.contains('hidden')
  ) {
    const btn = document.getElementById(`ek-horsebtn-${num}`);
    if (btn && !btn.disabled) selectEkHorse(num);
  }
});

/* ── Init ─────────────────────────────────────────────────────────────────── */
showSection('section-home');
