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
const NOTION_API_KEY = process.env.NOTION_API_KEY || '';
const NOTION_DB_ID = process.env.NOTION_DB_ID || '';
const NOTION_VERSION = process.env.NOTION_VERSION || '2022-06-28';

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
  const remoteJid = key.remoteJid || payload?.data?.remoteJid || null;
  return {
    id: key.id || payload?.event || `evt-${Date.now()}`,
    createdAt: new Date().toISOString(),
    event: payload?.event || payload?.type || 'unknown',
    instance: payload?.instance || payload?.instanceName || payload?.data?.instance || null,
    remoteJid,
    contactId: remoteJid,
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

function compactText(text, max = 280) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return { summary: clean, fullContext: '' };
  return { summary: `${clean.slice(0, max - 1)}…`, fullContext: clean };
}

function normalizePriority(v) {
  const p = String(v || '').toLowerCase();
  if (['p0', 'alta', 'high', 'urgent'].includes(p)) return 'p0';
  if (['p1', 'media', 'média', 'medium'].includes(p)) return 'p1';
  if (['p2', 'baixa', 'low'].includes(p)) return 'p2';
  if (['p3'].includes(p)) return 'p3';
  return p.startsWith('p') ? p : 'p1';
}

function inferIntent(title, summary) {
  const t = `${title || ''} ${summary || ''}`.toLowerCase();
  if (t.includes('responder') || t.includes('follow-up') || t.includes('follow up')) return 'followup';
  if (t.includes('proposta') || t.includes('orçamento') || t.includes('orcamento')) return 'proposal';
  if (t.includes('call') || t.includes('reunião') || t.includes('reuniao')) return 'meeting';
  if (t.includes('conteúdo') || t.includes('conteudo') || t.includes('youtube') || t.includes('vídeo') || t.includes('video')) return 'content';
  return 'general';
}

function dedupeCardIndex(cards, contactId, intent, title) {
  const titleNorm = String(title || '').toLowerCase().slice(0, 80);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  return cards.findIndex((c) => {
    const sameContact = String(c.contactId || '') === String(contactId || '');
    const sameIntent = String(c.intent || '') === String(intent || '');
    const sameAuto = Array.isArray(c.tags) && c.tags.includes('autosync');
    const recent = !c.updatedAt || (now - new Date(c.updatedAt).getTime() <= dayMs);
    const similarTitle = String(c.title || '').toLowerCase().includes(titleNorm) || titleNorm.includes(String(c.title || '').toLowerCase());
    return sameAuto && sameContact && sameIntent && recent && similarTitle;
  });
}

let notionSyncState = { running: false, lastRunAt: null, lastResult: null };

function notionEnabled() {
  return Boolean(NOTION_API_KEY && NOTION_DB_ID);
}

async function notionRequest(path, method = 'GET', body) {
  const resp = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await resp.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!resp.ok) throw new Error(`${method} ${path} -> ${resp.status} ${text}`);
  return json;
}

function notionRichText(text) {
  return [{ type: 'text', text: { content: String(text || '').slice(0, 1800) } }];
}

async function syncBoardToNotion(boardInput) {
  if (!notionEnabled()) return { ok: false, skipped: true, reason: 'notion env missing' };
  if (notionSyncState.running) return { ok: true, skipped: true, reason: 'sync already running' };

  notionSyncState.running = true;
  try {
    const board = boardInput || readBoard();
    const cards = Array.isArray(board.cards) ? board.cards : [];

    const existing = new Map();
    let cursor;
    do {
      const q = await notionRequest(`/databases/${NOTION_DB_ID}/query`, 'POST', {
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {})
      });
      for (const row of (q.results || [])) {
        const cid = row.properties?.['Card ID']?.rich_text?.[0]?.plain_text;
        if (cid) existing.set(cid, row.id);
      }
      cursor = q.has_more ? q.next_cursor : null;
    } while (cursor);

    let created = 0;
    let updated = 0;

    for (const c of cards.slice(0, 500)) {
      const rawStatus = String(c.columnId || c.priority || 'p1').toLowerCase();
      const status = ['p0', 'p1', 'p2', 'p3', 'doing', 'done'].includes(rawStatus) ? rawStatus : normalizePriority(rawStatus);
      const props = {
        'Task': { title: notionRichText(c.title || 'Sem título') },
        'Card ID': { rich_text: notionRichText(c.id || '') },
        'Status': { select: { name: ['p0', 'p1', 'p2', 'p3', 'doing', 'done'].includes(status) ? status : 'p1' } },
        'Owner': { rich_text: notionRichText(c.owner || 'Diego') },
        'Due': c.due || c.prazo ? { date: { start: new Date(c.due || c.prazo).toISOString() } } : { date: null },
        'Impact R$': { rich_text: notionRichText(c['impactR$'] || '') },
        'Tags': { multi_select: (c.tags || []).slice(0, 10).map((t) => ({ name: String(t).slice(0, 100) })) },
        'Source': { url: `${PUBLIC_URL || ''}/` || null },
        'Updated At': { date: { start: new Date(c.updatedAt || board.meta?.updatedAt || Date.now()).toISOString() } }
      };

      const rowId = existing.get(c.id);
      if (rowId) {
        await notionRequest(`/pages/${rowId}`, 'PATCH', { properties: props });
        updated++;
      } else {
        await notionRequest('/pages', 'POST', {
          parent: { database_id: NOTION_DB_ID },
          properties: props,
          children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: notionRichText(c.summary || c.notes || '') } }]
        });
        created++;
      }
    }

    notionSyncState.lastRunAt = new Date().toISOString();
    notionSyncState.lastResult = { ok: true, total: cards.length, created, updated };
    return notionSyncState.lastResult;
  } finally {
    notionSyncState.running = false;
  }
}

function triggerNotionSync(boardInput) {
  if (!notionEnabled()) return;
  syncBoardToNotion(boardInput).catch((err) => {
    notionSyncState.lastRunAt = new Date().toISOString();
    notionSyncState.lastResult = { ok: false, error: String(err.message || err) };
  });
}

function addTasksToBoardFromAnalysis(analysis, sourceEvent) {
  if (!analysis?.ok || !analysis?.data?.tasks || !Array.isArray(analysis.data.tasks)) return [];

  const board = readBoard();
  const createdOrUpdated = [];

  for (const task of analysis.data.tasks.slice(0, 5)) {
    const priority = normalizePriority(task.priority || analysis.data.suggestedPriority || 'p1');
    const columnId = ['p0', 'p1', 'p2', 'p3'].includes(priority) ? priority : 'p1';

    const baseReason = String(task.reason || analysis.data.summary || sourceEvent.text || '');
    const { summary, fullContext } = compactText(baseReason, 280);
    const title = String(task.title || 'Novo item do webhook');
    const intent = inferIntent(title, summary);
    const due = task.dueHint || null;
    const impact = String(task.impactR$ || task.impactRs || '');

    const idx = dedupeCardIndex(board.cards || [], sourceEvent.contactId, intent, title);

    if (idx >= 0) {
      board.cards[idx] = {
        ...board.cards[idx],
        columnId,
        title,
        summary,
        notes: summary,
        fullContext: fullContext || board.cards[idx].fullContext || '',
        owner: String(task.owner || board.cards[idx].owner || 'Diego'),
        priority,
        due,
        DoD: String(task.dod || board.cards[idx].DoD || 'Resposta enviada + próximo passo definido.'),
        proximo_passo: String(task.nextStep || task.next || board.cards[idx].proximo_passo || 'Executar próximo passo e atualizar status.'),
        risco: String(task.risk || board.cards[idx].risco || 'Risco não mapeado'),
        impactR$: impact || board.cards[idx]['impactR$'] || '',
        tags: Array.from(new Set([...(board.cards[idx].tags || []), 'autosync', 'whatsapp', 'war-room', 'manual-review'])),
        sourceEventId: sourceEvent.id,
        contactId: sourceEvent.contactId,
        intent,
        updatedAt: new Date().toISOString()
      };
      createdOrUpdated.push(board.cards[idx].id);
      continue;
    }

    const id = `evt-task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    board.cards.push({
      id,
      columnId,
      title,
      summary,
      notes: summary,
      fullContext,
      owner: String(task.owner || 'Diego'),
      priority,
      due,
      'impactR$': impact,
      DoD: String(task.dod || 'Resposta enviada + próximo passo definido.'),
      proximo_passo: String(task.nextStep || task.next || 'Executar próximo passo e atualizar status.'),
      risco: String(task.risk || 'Risco não mapeado'),
      tags: ['evolution', 'ai', 'autosync', 'manual-review', 'whatsapp', 'war-room'],
      sourceEventId: sourceEvent.id,
      contactId: sourceEvent.contactId,
      intent,
      updatedAt: new Date().toISOString()
    });
    createdOrUpdated.push(id);
  }

  if (createdOrUpdated.length) writeBoard(board);
  return createdOrUpdated;
}

app.get('/health', (_, res) => res.json({ ok: true, service: 'saladeguerra-mvp' }));
app.get('/api/board', (_, res) => res.json(readBoard()));

app.post('/api/board', auth, (req, res) => {
  const board = req.body;
  if (!isValidBoard(board)) {
    return res.status(400).json({ ok: false, error: 'payload inválido' });
  }
  writeBoard(board);
  triggerNotionSync(board);
  res.json({ ok: true, updatedAt: new Date().toISOString(), notionSyncTriggered: notionEnabled() });
});

app.post('/api/cards', auth, (req, res) => {
  const board = readBoard();
  const card = req.body || {};
  if (!card.title || !card.columnId) return res.status(400).json({ ok: false, error: 'title e columnId obrigatórios' });
  const id = `card-${Date.now()}`;
  const compact = compactText(String(card.notes || card.summary || card.title), 280);
  board.cards.push({
    id,
    title: card.title,
    columnId: card.columnId,
    summary: compact.summary,
    notes: compact.summary,
    fullContext: compact.fullContext,
    owner: card.owner || '',
    priority: normalizePriority(card.priority || 'p1'),
    due: card.due || null,
    'impactR$': card['impactR$'] || '',
    DoD: card.DoD || '',
    proximo_passo: card.proximo_passo || '',
    risco: card.risco || '',
    tags: Array.isArray(card.tags) ? card.tags : [],
    updatedAt: new Date().toISOString()
  });
  writeBoard(board);
  res.json({ ok: true, id });
});

app.patch('/api/cards/:id', auth, (req, res) => {
  const board = readBoard();
  const idx = board.cards.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: 'card não encontrado' });

  const patch = { ...req.body };
  if (patch.priority) patch.priority = normalizePriority(patch.priority);
  if (patch.notes || patch.summary) {
    const compact = compactText(String(patch.summary || patch.notes || ''), 280);
    patch.summary = compact.summary;
    patch.notes = compact.summary;
    if (compact.fullContext) patch.fullContext = compact.fullContext;
  }

  board.cards[idx] = { ...board.cards[idx], ...patch, updatedAt: new Date().toISOString() };
  writeBoard(board);
  res.json({ ok: true, card: board.cards[idx] });
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

  const compact = compactText(String(body.notes || text), 280);
  const item = {
    id: `inbox-${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: String(body.source || 'webhook'),
    type: String(body.type || 'task'),
    title: text,
    summary: compact.summary,
    fullContext: compact.fullContext,
    notes: String(body.notes || ''),
    owner: String(body.owner || 'Diego'),
    priority: normalizePriority(body.priority || 'p1'),
    due: body.due || null,
    'impactR$': String(body['impactR$'] || body.impactRs || body.impact || ''),
    DoD: String(body.dod || body.DoD || ''),
    proximo_passo: String(body.nextStep || body.proximo_passo || ''),
    risco: String(body.risk || body.risco || ''),
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
    summary: item.summary,
    notes: item.summary,
    fullContext: item.fullContext,
    owner: item.owner,
    priority: item.priority,
    due: item.due,
    'impactR$': item['impactR$'],
    DoD: item.DoD,
    proximo_passo: item.proximo_passo,
    risco: item.risco,
    tags: item.tags,
    updatedAt: new Date().toISOString()
  });
  writeBoard(board);

  res.json({ ok: true, id: item.id, columnId });
});

// Webhook Evolution: recebe eventos inbound, normaliza, analisa (OpenRouter opcional) e salva histórico
app.post('/api/evolution/webhook', authEvolutionWebhook, async (req, res) => {
  try {
    const eventItem = normalizeInbound(req.body || {});
    const analysis = await analyzeWithOpenRouter(eventItem);

    // Segurança operacional: NÃO criar tasks automaticamente por padrão.
    // Só cria se explicitamente solicitado com autoTasks=true
    const autoTasks = String(req.query.autoTasks || req.body?.autoTasks || '').toLowerCase() === 'true';
    const createdCardIds = autoTasks ? addTasksToBoardFromAnalysis(analysis, eventItem) : [];

    const record = {
      ...eventItem,
      analysis,
      autoTasks,
      createdCardIds
    };

    appendEvent(record);
    res.json({ ok: true, eventId: eventItem.id, autoTasks, createdCardIds, analyzed: Boolean(analysis?.ok) });
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

app.post('/api/notion/sync', auth, async (_, res) => {
  try {
    const result = await syncBoardToNotion(readBoard());
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || error) });
  }
});

app.get('/api/notion/sync/status', auth, (_, res) => {
  res.json({
    ok: true,
    enabled: notionEnabled(),
    dbId: notionEnabled() ? NOTION_DB_ID : null,
    state: notionSyncState
  });
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
    hasNotion: notionEnabled(),
    webhook: {
      inboxPost: '/api/inbox',
      inboxGet: '/api/inbox',
      evolutionWebhookPost: '/api/evolution/webhook',
      evolutionEventsGet: '/api/evolution/events',
      autoTaskModeDefault: false
    },
    sync: {
      notionSyncPost: '/api/notion/sync',
      notionSyncStatusGet: '/api/notion/sync/status',
      notionIntervalMinutes: 30
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

  if (notionEnabled()) {
    setInterval(() => triggerNotionSync(readBoard()), 30 * 60 * 1000);
    triggerNotionSync(readBoard());
  }

  console.log(`Sala de Guerra rodando na porta ${PORT}`);
});
