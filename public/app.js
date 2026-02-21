function getCurrentSlug() {
  const m = window.location.pathname.match(/^\/p\/([a-zA-Z0-9-_]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const state = {
  board: null,
  query: '',
  owner: '',
  priority: ''
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

async function fetchBoard() {
  const slug = getCurrentSlug();
  const url = slug ? `/api/pages/${slug}` : '/api/board';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar board (${res.status})`);
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
    const blob = norm([c.title, c.notes, c.contexto, c.proximo_passo, (c.tags || []).join(' ')].join(' '));
    const p = toPriority(c.priority || c.P || c.columnId);
    const owner = norm(c.owner);

    if (q && !blob.includes(q)) return false;
    if (state.owner && owner !== norm(state.owner)) return false;
    if (state.priority && p !== state.priority) return false;
    return true;
  });
}

function renderKpis(board, filteredCards) {
  const kpis = document.getElementById('kpis');
  const total = filteredCards.length;
  const p0 = filteredCards.filter(c => toPriority(c.priority || c.P || c.columnId) === 'p0').length;
  const doing = filteredCards.filter(c => c.columnId === 'doing').length;
  const done = filteredCards.filter(c => c.columnId === 'done').length;

  kpis.innerHTML = `
    <article class="kpi"><div class="label">Cards visíveis</div><div class="value">${total}</div></article>
    <article class="kpi"><div class="label">Críticos (P0)</div><div class="value">${p0}</div></article>
    <article class="kpi"><div class="label">Em execução</div><div class="value">${doing}</div></article>
    <article class="kpi"><div class="label">Concluídos</div><div class="value">${done}</div></article>
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

function renderBoard(board) {
  state.board = board;

  document.getElementById('title').textContent = board.meta?.title || 'Sala de Guerra';

  const allCards = board.cards || [];
  renderOwnerFilter(allCards);
  const filteredCards = getFilteredCards(allCards);
  renderKpis(board, filteredCards);

  const el = document.getElementById('board');
  el.innerHTML = '';

  for (const col of board.columns || []) {
    const cards = filteredCards.filter(c => c.columnId === col.id);
    const column = document.createElement('div');
    column.className = 'column';
    column.innerHTML = `<h2><span>${esc(col.title)}</span><span>${cards.length}</span></h2><div class="cards"></div>`;

    const cardsRoot = column.querySelector('.cards');
    if (cards.length === 0) {
      cardsRoot.innerHTML = '<div class="empty">Sem cards com o filtro atual.</div>';
    }

    for (const c of cards) {
      const priority = toPriority(c.priority || c.P || c.columnId);
      const priorityLabel = priority.toUpperCase();
      const owner = c.owner ? `<span class="badge owner">${esc(c.owner)}</span>` : '';
      const dueClass = isOverdue(c.due || c.prazo) ? 'due overdue' : 'due';
      const due = (c.due || c.prazo) ? `<span class="badge ${dueClass}">prazo: ${esc(formatDue(c.due || c.prazo))}</span>` : '';
      const tags = (c.tags || []).map(t => `<span class="badge">${esc(t)}</span>`).join('');
      const notes = esc(c.notes || c.contexto || '');
      const dod = c.DoD ? `<div class="detail"><strong>DoD:</strong> ${esc(c.DoD)}</div>` : '';
      const next = c.proximo_passo ? `<div class="detail"><strong>Próximo:</strong> ${esc(c.proximo_passo)}</div>` : '';
      const risk = c.risco ? `<div class="detail"><strong>Risco:</strong> ${esc(c.risco)}</div>` : '';

      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <div class="title">${esc(c.title || 'Sem título')}</div>
        <div class="notes">${notes}</div>
        ${dod}
        ${next}
        ${risk}
        <div class="badges">
          <span class="badge ${priority}">${priorityLabel}</span>${owner}${due}${tags}
        </div>
      `;
      cardsRoot.appendChild(card);
    }

    el.appendChild(column);
  }
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
