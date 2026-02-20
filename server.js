const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const UPDATE_API_KEY = process.env.UPDATE_API_KEY || '';
const DATA_FILE = process.env.BOARD_DATA_FILE || path.join(__dirname, 'data', 'board.json');
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const PAGES_DIR = process.env.PAGES_DIR || path.join(__dirname, 'data', 'pages');
const PAGES_INDEX_FILE = path.join(PAGES_DIR, 'index.json');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function createDefaultBoard() {
  return {
    meta: {
      title: 'Sala de Guerra — Motor 100k',
      updatedAt: new Date().toISOString(),
      target: 100000,
      closedRevenue: 0,
    },
    columns: [
      { id: 'p0', title: 'P0 — Dinheiro na Mesa' },
      { id: 'p1', title: 'P1 — Pipeline Ativo' },
      { id: 'p2', title: 'P2 — Geração de Demanda' },
      { id: 'doing', title: 'Em Execução' },
      { id: 'done', title: 'Concluído' }
    ],
    cards: [
      {
        id: 'card-1',
        columnId: 'p0',
        title: 'Definir 3 ações de caixa para hoje',
        notes: 'Escolher ações com impacto em receita em <48h.',
        owner: 'Diego',
        priority: 'alta',
        due: null,
        tags: ['motor100k']
      }
    ]
  };
}

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createDefaultBoard(), null, 2));
  }
}

function ensurePages() {
  if (!fs.existsSync(PAGES_DIR)) fs.mkdirSync(PAGES_DIR, { recursive: true });
  if (!fs.existsSync(PAGES_INDEX_FILE)) {
    const initial = [{ slug: 'motor100k', title: 'Motor 100k', createdAt: new Date().toISOString() }];
    fs.writeFileSync(PAGES_INDEX_FILE, JSON.stringify(initial, null, 2));
  }
  const defaultPageFile = path.join(PAGES_DIR, 'motor100k.json');
  if (!fs.existsSync(defaultPageFile)) {
    fs.writeFileSync(defaultPageFile, JSON.stringify(createDefaultBoard(), null, 2));
  }
}

function readBoard() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeBoard(board) {
  board.meta = board.meta || {};
  board.meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(board, null, 2));
}

function sanitizeSlug(slug) {
  return String(slug || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function readPagesIndex() {
  ensurePages();
  return JSON.parse(fs.readFileSync(PAGES_INDEX_FILE, 'utf8'));
}

function writePagesIndex(list) {
  fs.writeFileSync(PAGES_INDEX_FILE, JSON.stringify(list, null, 2));
}

function getPageFile(slug) {
  return path.join(PAGES_DIR, `${sanitizeSlug(slug)}.json`);
}

function readPage(slug) {
  const file = getPageFile(slug);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writePage(slug, board) {
  const file = getPageFile(slug);
  board.meta = board.meta || {};
  board.meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(board, null, 2));
}

function auth(req, res, next) {
  if (!UPDATE_API_KEY) return res.status(500).json({ ok: false, error: 'UPDATE_API_KEY não configurada' });
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (key !== UPDATE_API_KEY) return res.status(401).json({ ok: false, error: 'não autorizado' });
  next();
}

function isValidBoard(board) {
  return board && Array.isArray(board.columns) && Array.isArray(board.cards);
}

app.get('/health', (_, res) => res.json({ ok: true, service: 'saladeguerra-mvp' }));
app.get('/api/board', (_, res) => res.json(readBoard()));

app.post('/api/board', auth, (req, res) => {
  const board = req.body;
  if (!isValidBoard(board)) {
    return res.status(400).json({ ok: false, error: 'payload inválido' });
  }
  writeBoard(board);
  res.json({ ok: true, updatedAt: new Date().toISOString() });
});

app.post('/api/cards', auth, (req, res) => {
  const board = readBoard();
  const card = req.body || {};
  if (!card.title || !card.columnId) return res.status(400).json({ ok: false, error: 'title e columnId obrigatórios' });
  const id = `card-${Date.now()}`;
  board.cards.push({
    id,
    title: card.title,
    columnId: card.columnId,
    notes: card.notes || '',
    owner: card.owner || '',
    priority: card.priority || 'media',
    due: card.due || null,
    tags: Array.isArray(card.tags) ? card.tags : []
  });
  writeBoard(board);
  res.json({ ok: true, id });
});

app.patch('/api/cards/:id', auth, (req, res) => {
  const board = readBoard();
  const idx = board.cards.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: 'card não encontrado' });
  board.cards[idx] = { ...board.cards[idx], ...req.body };
  writeBoard(board);
  res.json({ ok: true });
});

// Pages API (subpáginas infinitas)
app.get('/api/pages', (_, res) => {
  const pages = readPagesIndex();
  res.json({ pages });
});

app.get('/api/pages/:slug', (req, res) => {
  const slug = sanitizeSlug(req.params.slug);
  const page = readPage(slug);
  if (!page) return res.status(404).json({ ok: false, error: 'página não encontrada' });
  res.json(page);
});

app.post('/api/pages', auth, (req, res) => {
  const slug = sanitizeSlug(req.body?.slug);
  const title = String(req.body?.title || slug || '').trim();
  const board = req.body?.board || createDefaultBoard();
  if (!slug || !title) return res.status(400).json({ ok: false, error: 'slug e title são obrigatórios' });
  if (!isValidBoard(board)) return res.status(400).json({ ok: false, error: 'board inválido' });

  const list = readPagesIndex();
  if (!list.find(p => p.slug === slug)) {
    list.push({ slug, title, createdAt: new Date().toISOString() });
    writePagesIndex(list);
  }
  writePage(slug, board);
  res.json({ ok: true, slug, title });
});

app.post('/api/pages/:slug', auth, (req, res) => {
  const slug = sanitizeSlug(req.params.slug);
  const board = req.body;
  if (!slug) return res.status(400).json({ ok: false, error: 'slug inválido' });
  if (!isValidBoard(board)) return res.status(400).json({ ok: false, error: 'board inválido' });

  const list = readPagesIndex();
  if (!list.find(p => p.slug === slug)) {
    list.push({ slug, title: slug, createdAt: new Date().toISOString() });
    writePagesIndex(list);
  }

  writePage(slug, board);
  res.json({ ok: true, slug, updatedAt: new Date().toISOString() });
});

app.get('/api/config', (_, res) => {
  res.json({
    publicUrl: PUBLIC_URL,
    hasApiKey: Boolean(UPDATE_API_KEY)
  });
});

app.get('/p/:slug', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  ensureDataFile();
  ensurePages();
  console.log(`Sala de Guerra rodando na porta ${PORT}`);
});
