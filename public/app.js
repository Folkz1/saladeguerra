async function loadBoard() {
  const res = await fetch('/api/board');
  const board = await res.json();

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

loadBoard().catch(err => {
  document.body.innerHTML = `<pre>Erro ao carregar board: ${err.message}</pre>`;
});
