function getCurrentSlug() {
  const m = window.location.pathname.match(/^\/p\/([a-zA-Z0-9-_]+)/);
  return m ? decodeURIComponent(m[1]) : null;
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
  } catch (_) {
    // navegação opcional
  }
}

function renderBoard(board) {
  document.getElementById('title').textContent = board.meta?.title || 'Sala de Guerra';
  document.getElementById('target').textContent = `Meta: R$ ${(board.meta?.target || 0).toLocaleString('pt-BR')}`;
  document.getElementById('revenue').textContent = `Fechado: R$ ${(board.meta?.closedRevenue || 0).toLocaleString('pt-BR')}`;
  document.getElementById('updated').textContent = `Atualizado: ${new Date(board.meta?.updatedAt || Date.now()).toLocaleString('pt-BR')}`;

  const el = document.getElementById('board');
  el.innerHTML = '';

  for (const col of board.columns || []) {
    const column = document.createElement('div');
    column.className = 'column';
    column.innerHTML = `<h2>${col.title}</h2><div class="cards"></div>`;

    const cardsRoot = column.querySelector('.cards');
    const cards = (board.cards || []).filter(c => c.columnId === col.id);

    for (const c of cards) {
      const tags = (c.tags || []).map(t => `<span class="badge">${t}</span>`).join('');
      const due = c.due ? `<span class="badge">prazo: ${c.due}</span>` : '';
      const owner = c.owner ? `<span class="badge">${c.owner}</span>` : '';
      const priority = `<span class="badge ${c.priority || 'media'}">${c.priority || 'media'}</span>`;
      const notes = c.notes ? `<div class="notes">${c.notes}</div>` : '';

      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <div class="title">${c.title}</div>
        ${notes}
        <div class="badges">${priority}${owner}${due}${tags}</div>
      `;
      cardsRoot.appendChild(card);
    }

    el.appendChild(column);
  }
}

async function boot() {
  await renderPagesNav();
  const board = await fetchBoard();
  renderBoard(board);
}

boot().catch(err => {
  document.body.innerHTML = `<pre>Erro ao carregar board: ${err.message}</pre>`;
});
