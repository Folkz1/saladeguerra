#!/usr/bin/env node

/**
 * Evolution WhatsApp Summary
 *
 * Uso:
 *   node scripts/evolution-whatsapp-summary.mjs
 *   node scripts/evolution-whatsapp-summary.mjs --limit 25 --pending 12 --json
 */

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  const val = args[idx + 1];
  return val && !val.startsWith('--') ? val : true;
};

const LIMIT = Number(getArg('--limit', 30));
const PENDING_LIMIT = Number(getArg('--pending', 12));
const AS_JSON = args.includes('--json');

const BASE = process.env.EVOLUTION_BASE_URL;
const INSTANCE = process.env.EVOLUTION_INSTANCE_GUYFOLKIZ || 'guyfolkiz';
const APIKEY = process.env.EVOLUTION_APIKEY_GUYFOLKIZz;

if (!BASE || !APIKEY) {
  console.error('Erro: faltam variáveis de ambiente EVOLUTION_BASE_URL e/ou EVOLUTION_APIKEY_GUYFOLKIZz');
  process.exit(1);
}

const headers = {
  apikey: APIKEY,
  'Content-Type': 'application/json',
};

const now = Date.now();

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

function extractText(lastMessage) {
  const m = lastMessage?.message || {};
  return (
    clean(m?.conversation) ||
    clean(m?.extendedTextMessage?.text) ||
    clean(m?.imageMessage?.caption) ||
    clean(m?.videoMessage?.caption) ||
    clean(m?.documentMessage?.caption) ||
    clean(m?.buttonsResponseMessage?.selectedDisplayText) ||
    clean(m?.listResponseMessage?.title) ||
    '[sem texto]'
  );
}

function toTs(chat) {
  const t = chat?.updatedAt || chat?.lastMessage?.messageTimestamp;
  if (!t) return 0;
  if (typeof t === 'number') {
    return t > 10_000_000_000 ? t : t * 1000;
  }
  const parsed = Date.parse(t);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function hoursAgo(ts) {
  if (!ts) return 9999;
  return (now - ts) / 36e5;
}

function formatAge(ts) {
  const h = hoursAgo(ts);
  if (h < 1) return '<1h';
  if (h < 24) return `${Math.floor(h)}h`;
  return `${Math.floor(h / 24)}d`;
}

function detectPriority(item) {
  const text = (item.preview || '').toLowerCase();
  const intent = /orcamento|orçamento|proposta|valor|preco|preço|pagamento|call|demo|fechar|contrato|agenda|horario|horário/.test(text);
  if (item.unread > 0) return 'alta';
  if (!item.fromMe && item.ageH <= 72 && intent) return 'alta';
  if (!item.fromMe && item.ageH <= 168) return 'media';
  return 'baixa';
}

function firstLine(s, max = 140) {
  const one = String(s || '').replace(/\s+/g, ' ').trim();
  if (!one) return '[sem texto]';
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

async function call(path, method = 'POST', body = undefined) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status} em ${path}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  const state = await call(`/instance/connectionState/${INSTANCE}`, 'GET');
  const chatsRaw = await call(`/chat/findChats/${INSTANCE}`, 'POST', {});
  const chats = Array.isArray(chatsRaw) ? chatsRaw : (chatsRaw?.chats || []);

  const mapped = chats
    .filter((c) => c?.remoteJid && !String(c.remoteJid).endsWith('@g.us'))
    .map((c) => {
      const ts = toTs(c);
      const unread = Number(c?.unreadCount || 0);
      const fromMe = Boolean(c?.lastMessage?.key?.fromMe);
      const preview = extractText(c.lastMessage);
      const jid = c.remoteJid;
      const number = jid.includes('@') ? jid.split('@')[0] : jid;
      const name = c.pushName || number;
      const ageH = hoursAgo(ts);
      const item = {
        name,
        number,
        jid,
        unread,
        fromMe,
        ageH,
        age: formatAge(ts),
        updatedAt: ts ? new Date(ts).toISOString() : null,
        preview: firstLine(preview),
      };
      return { ...item, priority: detectPriority(item) };
    })
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const pending = mapped
    .filter((x) => x.unread > 0 || !x.fromMe)
    .sort((a, b) => {
      const score = (p) => (p.priority === 'alta' ? 3 : p.priority === 'media' ? 2 : 1);
      if (score(b) !== score(a)) return score(b) - score(a);
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    })
    .slice(0, PENDING_LIMIT);

  const summary = {
    instance: INSTANCE,
    connectionState: state?.instance?.state || 'unknown',
    generatedAt: new Date().toISOString(),
    totalDirectChats: mapped.length,
    pendingCount: mapped.filter((x) => x.unread > 0 || !x.fromMe).length,
    highPriorityCount: mapped.filter((x) => x.priority === 'alta' && (x.unread > 0 || !x.fromMe)).length,
    pending,
    recent: mapped.slice(0, LIMIT),
  };

  if (AS_JSON) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`# WhatsApp Summary (${INSTANCE})`);
  console.log(`- Gerado em: ${summary.generatedAt}`);
  console.log(`- Conexão: ${summary.connectionState}`);
  console.log(`- Chats diretos: ${summary.totalDirectChats}`);
  console.log(`- Pendências: ${summary.pendingCount}`);
  console.log(`- Alta prioridade: ${summary.highPriorityCount}`);

  console.log(`\n## Pendências prioritárias (top ${PENDING_LIMIT})`);
  if (!pending.length) {
    console.log('- Nenhuma pendência detectada.');
  } else {
    for (const p of pending) {
      const icon = p.priority === 'alta' ? '🔴' : p.priority === 'media' ? '🟡' : '⚪';
      const dir = p.fromMe ? 'última msg sua' : 'aguardando você';
      console.log(`- ${icon} ${p.name} (${p.number}) | ${p.age} | ${dir} | unread=${p.unread}`);
      console.log(`  ↳ ${p.preview}`);
    }
  }

  console.log(`\n## Recentes (top ${LIMIT})`);
  for (const r of summary.recent) {
    console.log(`- ${r.name} (${r.number}) | ${r.age} | prioridade=${r.priority}`);
  }
}

main().catch((err) => {
  console.error('Falha ao gerar resumo:', err.message);
  process.exit(1);
});
