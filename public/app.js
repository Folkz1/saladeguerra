function getCurrentSlug() {
  const m = window.location.pathname.match(/^\/p\/([a-zA-Z0-9-_]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const state = {
  board: null,
  query: '',
  owner: '',
  priority: '',
  view: 'kanban',
  selectedId: null
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

async function addComment(cardId, text, author) {
  const res = await fetch('/api/cards/' + encodeURIComponent(cardId) + '/comments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': localStorage.getItem('war_api_key') || ''
    },
    body: JSON.stringify({ text, author })
  });

  if (!res.ok) {
    if (res.status === 401) {
      const key = prompt('Digite sua UPDATE_API_KEY para comentar:');
      if (!key) throw new Error('Sem chave para comentar');
      localStorage.setItem('war_api_key', key);
      return addComment(cardId, text, author);
    }
    throw new Error(await res.text());
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

function collectReferences(card) {
  const refs = [];
  const fromFields = [];
  if (Array.isArray(card.references)) fromFields.push(...card.references);
  if (Array.isArray(card.materials)) fromFields.push(...card.materials);
  if (typeof card.references === 'string') fromFields.push(card.references);
  if (typeof card.materials === 'string') fromFields.push(card.materials);

  fromFields.forEach((r) => {
    const s = String(r || '').trim();
    if (s) refs.push(s);
  });

  const raw = `${card.fullContext || ''} ${card.notes || ''} ${card.summary || ''}`;
  const urls = raw.match(/https?:\/\/[^\s)]+/g) || [];
  urls.forEach((u) => refs.push(u));

  return [...new Set(refs)].slice(0, 30);
}

function renderComments(card) {
  const root = document.getElementById('drawerComments');
  root.innerHTML = '';
  const comments = Array.isArray(card.comments) ? card.comments : [];

  if (!comments.length) {
    root.innerHTML = '<li>Sem comentários ainda.</li>';
    return;
  }

  [...comments].slice(-20).reverse().forEach((c) => {
    const li = document.createElement('li');
    const when = formatDue(c.createdAt);
    li.innerHTML = `<strong>${esc(c.author || 'Diego')}</strong> <small>${esc(when)}</small><br>${esc(c.text || '')}`;
    root.appendChild(li);
  });
}

function openDrawer(card) {
  state.selectedId = card.id;
  const drawer = document.getElementById('taskDrawer');
  drawer.classList.remove('hidden');
  drawer.setAttribute('aria-hidden', 'false');

  document.getElementById('drawerTitle').textContent = card.title || 'Tarefa';
  document.getElementById('drawerSummary').textContent = card.summary || card.notes || '';

  const meta = [];
  meta.push(`<span class="badge ${esc(toPriority(card.priority || card.columnId))}">${esc(String(card.priority || card.columnId || '').toUpperCase())}</span>`);
  if (card.owner) meta.push(`<span class="badge owner">${esc(card.owner)}</span>`);
  if (card.due || card.prazo) meta.push(`<span class="badge due ${isOverdue(card.due || card.prazo) ? 'overdue' : ''}">prazo: ${esc(formatDue(card.due || card.prazo))}</span>`);
  if (card['impactR$']) meta.push(`<span class="badge">impacto: ${esc(card['impactR$'])}</span>`);
  (card.tags || []).forEach((t) => meta.push(`<span class="badge">${esc(t)}</span>`));
  document.getElementById('drawerMeta').innerHTML = meta.join(' ');

  document.getElementById('drawerNext').textContent = card.proximo_passo || '-';
  document.getElementById('drawerDod').textContent = card.DoD || '-';
  document.getElementById('drawerRisk').textContent = card.risco || '-';

  const refs = collectReferences(card);
  const refsEl = document.getElementById('drawerRefs');
  refsEl.innerHTML = '';
  if (refs.length === 0) {
    refsEl.innerHTML = '<li>Sem referência cadastrada.</li>';
  } else {
    refs.forEach((r) => {
      const li = document.createElement('li');
      if (/^https?:\/\//i.test(r)) {
        li.innerHTML = `<a href="${esc(r)}" target="_blank" rel="noreferrer">${esc(r)}</a>`;
      } else {
        li.textContent = r;
      }
      refsEl.appendChild(li);
    });
  }

  document.getElementById('drawerContext').textContent = card.fullContext || card.notes || card.summary || '-';
  renderComments(card);

  const authorInput = document.getElementById('commentAuthor');
  if (authorInput && !authorInput.value) {
    authorInput.value = localStorage.getItem('war_comment_author') || 'Diego';
  }
  const textInput = document.getElementById('commentText');
  if (textInput) textInput.value = '';
}

function closeDrawer() {
  const drawer = document.getElementById('taskDrawer');
  drawer.classList.add('hidden');
  drawer.setAttribute('aria-hidden', 'true');
  state.selectedId = null;
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
  card.setAttribute('data-cardid', String(c.id || ''));
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
  if (btn) {
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
    return;
  }

  const cardEl = ev.target.closest('[data-cardid]');
  if (!cardEl) return;
  const cardId = cardEl.getAttribute('data-cardid');
  const card = (state.board.cards || []).find(c => String(c.id) === String(cardId));
  if (card) openDrawer(card);
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

  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  const form = document.getElementById('commentForm');
  if (form) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!state.selectedId) return;
      const author = document.getElementById('commentAuthor').value.trim() || 'Diego';
      const text = document.getElementById('commentText').value.trim();
      if (!text) return;
      localStorage.setItem('war_comment_author', author);

      try {
        const out = await addComment(state.selectedId, text, author);
        const idx = (state.board.cards || []).findIndex(c => String(c.id) === String(state.selectedId));
        if (idx >= 0) state.board.cards[idx] = out.card;
        openDrawer(out.card);
        renderBoard(state.board);
      } catch (err) {
        alert(`Falha ao comentar: ${err.message}`);
      }
    });
  }

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeDrawer();
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
