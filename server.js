const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const UPDATE_API_KEY = process.env.UPDATE_API_KEY || '';
const EVOLUTION_WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET || '';
const OPENROUTER_API_KEY = process.env.API_OPENROUTER || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

const DATA_FILE = process.env.BOARD_DATA_FILE || path.join(__dirname, 'data', 'board.json');
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const PAGES_DIR = process.env.PAGES_DIR || path.join(__dirname, 'data', 'pages');
const PAGES_INDEX_FILE = path.join(PAGES_DIR, 'index.json');
const INBOX_FILE = process.env.INBOX_FILE || path.join(__dirname, 'data', 'inbox.json');
const EVENTS_FILE = process.env.EVENTS_FILE || path.join(__dirname, 'data', 'events.jsonl');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
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
      { id: 'p3', title: 'P3 — Infra/Inteligência' },
      { id: 'doing', title: 'Em Execução' },
      { id: 'done', title: 'Concluído' }
    ],
    cards: []
  };
}

function ensureJsonFile(file, defaultValue) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2));
}

function ensureDataFile() {
  ensureJsonFile(DATA_FILE, createDefaultBoard());
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

function ensureInboxFile() {
  ensureJsonFile(INBOX_FILE, []);
}

function ensureEventsFile() {
  const dir = path.dirname(EVENTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, '');
}

function readInbox() {
  ensureInboxFile();
  return JSON.parse(fs.readFileSync(INBOX_FILE, 'utf8'));
}

function writeInbox(items) {
  ensureInboxFile();
  fs.writeFileSync(INBOX_FILE, JSON.stringify(items, null, 2));
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

function authEvolutionWebhook(req, res, next) {
  if (!EVOLUTION_WEBHOOK_SECRET) return auth(req, res, next);
  const key = req.headers['x-evolution-secret'] || req.headers['x-api-key'] || req.query.apiKey;
  if (key !== EVOLUTION_WEBHOOK_SECRET) return res.status(401).json({ ok: false, error: 'não autorizado' });
  next();
}

function isValidBoard(board) {
  return board && Array.isArray(board.columns) && Array.isArray(board.cards);
}

function appendEvent(record) {
  ensureEventsFile();
  fs.appendFileSync(EVENTS_FILE, `${JSON.stringify(record)}\n`);
}

function readEvents(limit = 200) {
  ensureEventsFile();
  const lines = fs.readFileSync(EVENTS_FILE, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-limit).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean).reverse();
}

function getTextMessage(payload) {
  const msg = payload?.data?.message || payload?.message || payload?.data || {};
  return msg?.conversation
    || msg?.extendedTextMessage?.text
    || msg?.imageMessage?.caption
    || msg?.videoMessage?.caption
    || msg?.documentMessage?.caption
    || payload?.data?.body
    || '';
}

function detectMedia(payload) {
  const msg = payload?.data?.message || payload?.message || {};
  if (msg.audioMessage) return { type: 'audio', mimeType: msg.audioMessage?.mimetype || 'audio/ogg', url: msg.audioMessage?.url || '' };
  if (msg.imageMessage) return { type: 'image', mimeType: msg.imageMessage?.mimetype || 'image/jpeg', url: msg.imageMessage?.url || '' };
  if (msg.videoMessage) return { type: 'video', mimeType: msg.videoMessage?.mimetype || 'video/mp4', url: msg.videoMessage?.url || '' };
  if (msg.documentMessage) {
    return {
      type: 'document',
      mimeType: msg.documentMessage?.mimetype || 'application/octet-stream',
      url: msg.documentMessage?.url || '',
      fileName: msg.documentMessage?.fileName || ''
    };
  }
  return null;
}

function normalizeInbound(payload) {
  const key = payload?.data?.key || payload?.key || {};
  const media = detectMedia(payload);
  return {
    id: key.id || payload?.event || `evt-${Date.now()}`,
    createdAt: new Date().toISOString(),
    event: payload?.event || payload?.type || 'unknown',
    instance: payload?.instance || payload?.instanceName || payload?.data?.instance || null,
    remoteJid: key.remoteJid || payload?.data?.remoteJid || null,
    fromMe: Boolean(key.fromMe),
    pushName: payload?.data?.pushName || payload?.pushName || null,
    text: String(getTextMessage(payload) || ''),
    media,
    raw: payload
  };
}

async function analyzeWithOpenRouter(eventItem) {
  if (!OPENROUTER_API_KEY) {
    return { ok: false, skipped: true, reason: 'API_OPENROUTER não configurada' };
  }

  const media = eventItem.media;
  const prompt = [
    'Extraia informações úteis para CRM/kanban em JSON.',
    'Campos: summary, tasks[], entities[], sentiment, urgency(baixa|media|alta), suggestedPriority(p0|p1|p2|p3).',
    'tasks[] item: {title, owner, dueHint, reason}.',
    media ? `Tipo de mídia: ${media.type}; mime: ${media.mimeType}; url: ${media.url || 'N/A'}` : 'Sem mídia.',
    `Texto: ${eventItem.text || '[sem texto]'}`
  ].join('\n');

  const body = {
    model: OPENROUTER_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Você é um parser operacional. Responda apenas JSON válido.' },
      { role: 'user', content: prompt }
    ]
  };

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    return { ok: false, status: resp.status, error: await resp.text() };
  }

  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content || '{}';
  try {
    return { ok: true, data: JSON.parse(content) };
  } catch {
    return { ok: true, data: { raw: content } };
  }
}

function addTasksToBoardFromAnalysis(analysis, sourceEvent) {
  if (!analysis?.ok || !analysis?.data?.tasks || !Array.isArray(analysis.data.tasks)) return [];

  const board = readBoard();
  const created = [];
  for (const task of analysis.data.tasks.slice(0, 5)) {
    const id = `evt-task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const priority = String(analysis.data.suggestedPriority || 'p1').toLowerCase();
    const columnId = ['p0', 'p1', 'p2', 'p3'].includes(priority) ? priority : 'p1';

    board.cards.push({
      id,
      columnId,
      title: String(task.title || 'Novo item do webhook'),
      notes: String(task.reason || analysis.data.summary || '').slice(0, 1200),
      owner: String(task.owner || 'Diego'),
      priority,
      due: task.dueHint || null,
      tags: ['evolution', 'ai', 'autosync', 'manual-review'],
      sourceEventId: sourceEvent.id
    });
    created.push(id);
  }

  if (created.length) writeBoard(board);
  return created;
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
    priority: card.priority || 'p1',
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

// Inbox webhook para receber tarefas/informações externas
app.get('/api/inbox', auth, (_, res) => {
  const items = readInbox();
  res.json({ ok: true, count: items.length, items: items.slice(-100).reverse() });
});

app.post('/api/inbox', auth, (req, res) => {
  const body = req.body || {};
  const text = String(body.text || body.title || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'text/title obrigatório' });

  const item = {
    id: `inbox-${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: String(body.source || 'webhook'),
    type: String(body.type || 'task'),
    title: text,
    notes: String(body.notes || ''),
    owner: String(body.owner || 'Diego'),
    priority: String(body.priority || 'p1').toLowerCase(),
    due: body.due || null,
    tags: Array.isArray(body.tags) ? body.tags : ['webhook', 'manual']
  };

  const items = readInbox();
  items.push(item);
  writeInbox(items);

  const board = readBoard();
  const columnId = ['p0', 'p1', 'p2', 'p3', 'doing', 'done'].includes(item.priority) ? item.priority : 'p1';
  board.cards.push({
    id: item.id,
    columnId,
    title: item.title,
    notes: item.notes,
    owner: item.owner,
    priority: item.priority,
    due: item.due,
    tags: item.tags
  });
  writeBoard(board);

  res.json({ ok: true, id: item.id, columnId });
});

// Webhook Evolution: recebe eventos inbound, normaliza, analisa (OpenRouter opcional) e salva histórico
app.post('/api/evolution/webhook', authEvolutionWebhook, async (req, res) => {
  try {
    const eventItem = normalizeInbound(req.body || {});
    const analysis = await analyzeWithOpenRouter(eventItem);
    const createdCardIds = addTasksToBoardFromAnalysis(analysis, eventItem);

    const record = {
      ...eventItem,
      analysis,
      createdCardIds
    };

    appendEvent(record);
    res.json({ ok: true, eventId: eventItem.id, createdCardIds, analyzed: Boolean(analysis?.ok) });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || error) });
  }
});

app.get('/api/evolution/events', auth, (req, res) => {
  const limit = Number(req.query.limit || 100);
  const q = String(req.query.q || '').toLowerCase();
  let items = readEvents(Math.min(Math.max(limit, 1), 1000));
  if (q) {
    items = items.filter((e) => JSON.stringify(e).toLowerCase().includes(q));
  }
  res.json({ ok: true, count: items.length, items });
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
    hasApiKey: Boolean(UPDATE_API_KEY),
    hasOpenRouter: Boolean(OPENROUTER_API_KEY),
    webhook: {
      inboxPost: '/api/inbox',
      inboxGet: '/api/inbox',
      evolutionWebhookPost: '/api/evolution/webhook',
      evolutionEventsGet: '/api/evolution/events'
    }
  });
});

app.get('/p/:slug', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  ensureDataFile();
  ensurePages();
  ensureInboxFile();
  ensureEventsFile();
  console.log(`Sala de Guerra rodando na porta ${PORT}`);
});
