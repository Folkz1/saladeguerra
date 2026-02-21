function getCurrentSlug() {
  const m = window.location.pathname.match(/^\/p\/([a-zA-Z0-9-_]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const state = {
  board: null,
  query: '',
  owner: '',
  priority: '',
  view: 'kanban'
};

function norm(v) {
  return String(v || '').toLowerCase();
}

function esc(v) {
  return String(v || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toPriority(v) {
  const p = norm(v);
  if (['p0', 'alta', 'high', 'urgent'].includes(p)) return 'p0';
  if (['p1', 'media', 'média', 'medium'].includes(p)) return 'p1';
  if (['p2', 'baixa', 'low'].includes(p)) return 'p2';
  if (['p3'].includes(p)) return 'p3';
  return p.startsWith('p') ? p : 'p1';
}

function formatDue(due) {
  if (!due) return '';
  const dt = new Date(due);
  if (Number.isNaN(dt.getTime())) return String(due);
  return dt.toLocaleString('pt-BR');
}

function isOverdue(due) {
  if (!due) return false;
  const dt = new Date(due);
  return !Number.isNaN(dt.getTime()) && dt.getTime() < Date.now();
}

function isToday(due) {
  if (!due) return false;
  const dt = new Date(due);
  if (Number.isNaN(dt.getTime())) return false;
  const now = new Date();
  return dt.getFullYear() === now.getFullYear()
    && dt.getMonth() === now.getMonth()
    && dt.getDate() === now.getDate();
}

function parseImpact(value) {
  if (!value) return 0;
  const s = String(value);
  const nums = s.match(/[\d.,]+/g);
  if (!nums?.length) return 0;
  const raw = nums[0].replace(/\./g, '').replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function fetchBoard() {
  const slug = getCurrentSlug();
  const url = slug ? `/api/pages/${slug}` : '/api/board';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar board (${res.status})`);
  return res.json();
}

async function patchCard(cardId, patch) {
  const slug = getCurrentSlug();
  const path = '/api/cards/' + encodeURIComponent(cardId);
  const res = await fetch(path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': localStorage.getItem('war_api_key') || ''
    },
    body: JSON.stringify(patch)
  });

  if (!res.ok) {
    if (res.status === 401) {
      const key = prompt('Digite sua UPDATE_API_KEY para editar cards:');
      if (!key) throw new Error('Sem chave para edição');
      localStorage.setItem('war_api_key', key);
      return patchCard(cardId, patch);
    }
    const txt = await res.text();
    throw new Error(`Falha ao atualizar card: ${txt}`);
  }

  if (slug) {
    // Em subpágina, persistir board inteiro para refletir rapidamente
    await fetch(`/api/pages/${slug}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': localStorage.getItem('war_api_key') || ''
      },
      body: JSON.stringify(state.board)
    }).catch(() => {});
  }

  return res.json();
}

async function renderPagesNav() {
  try {
    const res = await fetch('/api/pages');
    if (!res.ok) return;
    const data = await res.json();
    const pages = data.pages || [];
    const current = getCurrentSlug();

    const nav = document.getElementById('pages');
    nav.innerHTML = '';

    const home = document.createElement('a');
    home.href = '/';
    home.textContent = 'Geral';
    if (!current) home.classList.add('active');
    nav.appendChild(home);

    for (const p of pages) {
      const a = document.createElement('a');
      a.href = `/p/${p.slug}`;
      a.textContent = p.title || p.slug;
      if (current === p.slug) a.classList.add('active');
      nav.appendChild(a);
    }
  } catch (_) {}
}

function getFilteredCards(cards) {
  return (cards || []).filter((c) => {
    const q = norm(state.query);
    const blob = norm([
      c.title,
      c.summary,
      c.notes,
      c.contexto,
      c.proximo_passo,
      c.owner,
      (c.tags || []).join(' ')
    ].join(' '));

    const p = toPriority(c.priority || c.P || c.columnId);
    const owner = norm(c.owner);

    if (q && !blob.includes(q)) return false;
    if (state.owner && owner !== norm(state.owner)) return false;
    if (state.priority && p !== state.priority) return false;

    if (state.view === 'today') {
      return isToday(c.due || c.prazo) && c.columnId !== 'done';
    }
    if (state.view === 'overdue') {
      return isOverdue(c.due || c.prazo) && c.columnId !== 'done';
    }
    return true;
  });
}

function renderKpis(board, filteredCards) {
  const kpis = document.getElementById('kpis');
  const total = filteredCards.length;
  const p0 = filteredCards.filter(c => toPriority(c.priority || c.P || c.columnId) === 'p0' && c.columnId !== 'done').length;
  const doing = filteredCards.filter(c => c.columnId === 'doing').length;
  const done = filteredCards.filter(c => c.columnId === 'done').length;
  const overdue = filteredCards.filter(c => isOverdue(c.due || c.prazo) && c.columnId !== 'done').length;
  const impact = filteredCards.reduce((acc, c) => acc + parseImpact(c.impactR$ || c.impactRs || c.impact || ''), 0);

  kpis.innerHTML = `
    <article class="kpi"><div class="label">Cards visíveis</div><div class="value">${total}</div></article>
    <article class="kpi"><div class="label">P0 abertos</div><div class="value">${p0}</div></article>
    <article class="kpi"><div class="label">Em execução</div><div class="value">${doing}</div></article>
    <article class="kpi"><div class="label">Concluídos</div><div class="value">${done}</div></article>
    <article class="kpi"><div class="label">Atrasados</div><div class="value">${overdue}</div></article>
    <article class="kpi"><div class="label">Impacto estimado</div><div class="value">R$ ${impact.toLocaleString('pt-BR')}</div></article>
  `;

  document.getElementById('target').textContent = `Meta: R$ ${(board.meta?.target || 0).toLocaleString('pt-BR')}`;
  document.getElementById('revenue').textContent = `Fechado: R$ ${(board.meta?.closedRevenue || 0).toLocaleString('pt-BR')}`;
  document.getElementById('updated').textContent = `Atualizado: ${new Date(board.meta?.updatedAt || Date.now()).toLocaleString('pt-BR')}`;
}

function renderOwnerFilter(cards) {
  const owners = [...new Set((cards || []).map(c => c.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const select = document.getElementById('ownerFilter');
  const prev = state.owner;

  select.innerHTML = '<option value="">Todos os owners</option>';
  owners.forEach((owner) => {
    const opt = document.createElement('option');
    opt.value = owner;
    opt.textContent = owner;
    if (owner === prev) opt.selected = true;
    select.appendChild(opt);
  });
}

function getColumnsForView(columns, cards) {
  if (state.view === 'kanban') return columns;
  return [
    {
      id: 'focus',
      title: state.view === 'today' ? `Hoje (${cards.length})` : `Atrasados (${cards.length})`
    }
  ];
}

function getCardsByColumn(filteredCards, colId) {
  if (state.view === 'kanban') {
    return filteredCards.filter(c => c.columnId === colId);
  }
  return [...filteredCards].sort((a, b) => {
    const pa = toPriority(a.priority || a.P || a.columnId);
    const pb = toPriority(b.priority || b.P || b.columnId);
    if (pa !== pb) return pa.localeCompare(pb);
    return new Date(a.due || a.prazo || 0) - new Date(b.due || b.prazo || 0);
  });
}

function createCardElement(c) {
  const priority = toPriority(c.priority || c.P || c.columnId);
  const priorityLabel = priority.toUpperCase();
  const owner = c.owner ? `<span class="badge owner">${esc(c.owner)}</span>` : '';
  const dueClass = isOverdue(c.due || c.prazo) ? 'due overdue' : 'due';
  const due = (c.due || c.prazo) ? `<span class="badge ${dueClass}">prazo: ${esc(formatDue(c.due || c.prazo))}</span>` : '';
  const tags = (c.tags || []).map(t => `<span class="badge">${esc(t)}</span>`).join('');
  const notes = esc(c.summary || c.notes || c.contexto || '');
  const dod = c.DoD ? `<div class="detail"><strong>DoD:</strong> ${esc(c.DoD)}</div>` : '';
  const next = c.proximo_passo ? `<div class="detail"><strong>Próximo:</strong> ${esc(c.proximo_passo)}</div>` : '';
  const risk = c.risco ? `<div class="detail"><strong>Risco:</strong> ${esc(c.risco)}</div>` : '';
  const impact = (c.impactR$ || c.impactRs || c.impact) ? `<div class="detail"><strong>Impacto:</strong> ${esc(c.impactR$ || c.impactRs || c.impact)}</div>` : '';
  const full = c.fullContext ? `<details class="full-context"><summary>Contexto completo</summary>${esc(c.fullContext)}</details>` : '';

  const card = document.createElement('article');
  card.className = 'card';
  card.innerHTML = `
    <div class="title">${esc(c.title || 'Sem título')}</div>
    <div class="notes">${notes}</div>
    ${dod}
    ${next}
    ${risk}
    ${impact}
    ${full}
    <div class="badges">
      <span class="badge ${priority}">${priorityLabel}</span>${owner}${due}${tags}
    </div>
    <div class="actions">
      <button data-act="doing" data-id="${esc(c.id)}">→ Doing</button>
      <button data-act="done" data-id="${esc(c.id)}">✓ Done</button>
    </div>
  `;
  return card;
}

async function onCardAction(ev) {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  if (!id || !act) return;

  const idx = (state.board.cards || []).findIndex(c => String(c.id) === String(id));
  if (idx === -1) return;

  const patch = { columnId: act === 'done' ? 'done' : 'doing' };
  try {
    await patchCard(id, patch);
    state.board.cards[idx] = { ...state.board.cards[idx], ...patch };
    renderBoard(state.board);
  } catch (err) {
    alert(err.message);
  }
}

function renderBoard(board) {
  state.board = board;
  document.getElementById('title').textContent = board.meta?.title || 'Sala de Guerra';

  const allCards = board.cards || [];
  renderOwnerFilter(allCards);
  const filteredCards = getFilteredCards(allCards);
  renderKpis(board, filteredCards);

  const el = document.getElementById('board');
  el.innerHTML = '';
  el.classList.toggle('list', state.view !== 'kanban');

  const columns = getColumnsForView(board.columns || [], filteredCards);
  for (const col of columns) {
    const cards = getCardsByColumn(filteredCards, col.id);
    const column = document.createElement('div');
    column.className = 'column';
    column.innerHTML = `<h2><span>${esc(col.title)}</span><span>${cards.length}</span></h2><div class="cards"></div>`;

    const cardsRoot = column.querySelector('.cards');
    if (cards.length === 0) {
      cardsRoot.innerHTML = '<div class="empty">Sem cards com o filtro atual.</div>';
    }

    for (const c of cards) {
      cardsRoot.appendChild(createCardElement(c));
    }

    el.appendChild(column);
  }

  el.removeEventListener('click', onCardAction);
  el.addEventListener('click', onCardAction);
}

function bindFilters() {
  const q = document.getElementById('q');
  const owner = document.getElementById('ownerFilter');
  const priority = document.getElementById('priorityFilter');

  q.addEventListener('input', () => {
    state.query = q.value;
    renderBoard(state.board);
  });

  owner.addEventListener('change', () => {
    state.owner = owner.value;
    renderBoard(state.board);
  });

  priority.addEventListener('change', () => {
    state.priority = priority.value;
    renderBoard(state.board);
  });

  document.getElementById('views').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-view]');
    if (!btn) return;
    state.view = btn.getAttribute('data-view');
    [...document.querySelectorAll('#views button')].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderBoard(state.board);
  });
}

async function boot() {
  bindFilters();
  await renderPagesNav();
  const board = await fetchBoard();
  renderBoard(board);
}

boot().catch(err => {
  document.body.innerHTML = `<pre>Erro ao carregar board: ${err.message}</pre>`;
});
