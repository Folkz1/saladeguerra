# Sala de Guerra (MVP)

Kanban simples para operação diária (Motor 100k), com API para atualização automática.

## Rodar local

```bash
npm install
npm start
```

Abra: `http://localhost:3000`

## ENV para EasyPanel

Preencha estas variáveis no serviço:

- `PORT=3000` (ou deixe EasyPanel gerenciar)
- `UPDATE_API_KEY=<chave_forte>`
- `BOARD_DATA_FILE=./data/board.json` (opcional)
- `PUBLIC_URL=https://seu-link-publico` (opcional)

## Endpoints

### Health
`GET /health`

### Ver board principal
`GET /api/board`

### Substituir board principal (automação diária)
`POST /api/board` com header `x-api-key: UPDATE_API_KEY`

### Listar subpáginas
`GET /api/pages`

### Ler subpágina
`GET /api/pages/:slug`

### Criar subpágina
`POST /api/pages` com `x-api-key`

Payload exemplo:
```json
{
  "slug": "dentaly",
  "title": "Dentaly",
  "board": { "meta": {}, "columns": [], "cards": [] }
}
```

### Atualizar subpágina
`POST /api/pages/:slug` com `x-api-key`

Exemplo:

```bash
curl -X POST "https://SEU-LINK/api/board" \
  -H "Content-Type: application/json" \
  -H "x-api-key: SUA_CHAVE" \
  -d '{
    "meta": {"title":"Sala de Guerra — Motor 100k","target":100000,"closedRevenue":0},
    "columns": [
      {"id":"p0","title":"P0 — Dinheiro na Mesa"},
      {"id":"p1","title":"P1 — Pipeline Ativo"},
      {"id":"p2","title":"P2 — Geração de Demanda"},
      {"id":"doing","title":"Em Execução"},
      {"id":"done","title":"Concluído"}
    ],
    "cards": [
      {"id":"c1","columnId":"p0","title":"Mandar follow-up crítico","priority":"alta","owner":"Diego","tags":["whatsapp"]}
    ]
  }'
```

### Criar card
`POST /api/cards` com `x-api-key`

### Atualizar card
`PATCH /api/cards/:id` com `x-api-key`

### Comentar em card
`POST /api/cards/:id/comments` com `x-api-key`

Payload:
```json
{ "author": "Diego", "text": "DECISÃO: focar P0 comercial até 12:00" }
```

## Deploy EasyPanel

- Runtime: Node.js
- Build command: `npm install`
- Start command: `npm start`
- Expor porta `3000`
- Persistência: monte volume para pasta `data/` (para não perder board ao redeploy)
- Notion: configure `NOTION_API_KEY` + `NOTION_DB_ID`; ao subir/redeploy o serviço já dispara sync inicial e segue sincronizando periodicamente (30 min) + a cada atualização de card/board.

---

Quando você me passar a API/URL do EasyPanel, eu já conecto o update diário automático no board.
