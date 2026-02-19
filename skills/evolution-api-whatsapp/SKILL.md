---
name: evolution-api-whatsapp
description: >
  Control WhatsApp via Evolution API (instances, chats/messages, sending messages/media, webhooks/events, QR/login, read receipts). Use when interacting with WhatsApp programmatically through an Evolution API server.
---

# Evolution API (WhatsApp)

## O que sabemos do seu deployment
- Base URL: `$EVOLUTION_BASE_URL`
- API version: `2.3.7`
- Instância principal: `guyfolkiz`

## Autenticação
Header obrigatório na maioria dos endpoints:

```bash
apikey: <YOUR_AUTHENTICATION_API_KEY>
```

## Endpoints Principais

### Listar chats
```bash
curl -sS -X POST "${EVOLUTION_BASE_URL}/chat/findChats/${EVOLUTION_INSTANCE_GUYFOLKIZ}" \
  -H "apikey: ${EVOLUTION_APIKEY_GUYFOLKIZz}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Buscar mensagens de um chat
```bash
curl -sS -X POST "${EVOLUTION_BASE_URL}/chat/findMessages/${EVOLUTION_INSTANCE_GUYFOLKIZ}" \
  -H "apikey: ${EVOLUTION_APIKEY_GUYFOLKIZz}" \
  -H "Content-Type: application/json" \
  -d '{ "where": { "key": {"remoteJid": "5511999999999@s.whatsapp.net"} }, "limit": 50 }'
```

### Enviar mensagem de texto
```bash
curl -sS -X POST "${EVOLUTION_BASE_URL}/message/sendText/${EVOLUTION_INSTANCE_GUYFOLKIZ}" \
  -H "apikey: ${EVOLUTION_APIKEY_GUYFOLKIZz}" \
  -H "Content-Type: application/json" \
  -d '{ "number": "5511999999999", "text": "Olá! Esta é uma mensagem de teste." }'
```

### Enviar mídia (imagem/vídeo)
```bash
curl -sS -X POST "${EVOLUTION_BASE_URL}/message/sendMedia/${EVOLUTION_INSTANCE_GUYFOLKIZ}" \
  -H "apikey: ${EVOLUTION_APIKEY_GUYFOLKIZz}" \
  -H "Content-Type: application/json" \
  -d '{ "number": "5511999999999", "mediatype": "image", "media": "https://exemplo.com/imagem.jpg", "caption": "Legenda da imagem" }'
```

### Verificar estado da instância
```bash
curl -sS -X GET "${EVOLUTION_BASE_URL}/instance/connectionState/${EVOLUTION_INSTANCE_GUYFOLKIZ}" \
  -H "apikey: ${EVOLUTION_APIKEY_GUYFOLKIZz}"
```

### Obter QR Code
```bash
curl -sS -X GET "${EVOLUTION_BASE_URL}/instance/qrcode/${EVOLUTION_INSTANCE_GUYFOLKIZ}" \
  -H "apikey: ${EVOLUTION_APIKEY_GUYFOLKIZz}"
```

## IDs: phone vs jid vs lid
WhatsApp identifiers podem aparecer como:
- Número de telefone (E.164): `5511999999999`
- JID: `5511999999999@s.whatsapp.net`
- LID: formato alternativo

Sempre logar qual tipo de ID está sendo usado.

## Variáveis de Ambiente
```bash
EVOLUTION_BASE_URL=<url do servidor>
EVOLUTION_INSTANCE_GUYFOLKIZ=guyfolkiz
EVOLUTION_APIKEY_GUYFOLKIZz=<api key>
```

## Segurança
- Nunca enviar mensagens para números novos sem instrução explícita
- Nunca fazer broadcast em massa sem solicitação
- Não vazar apikeys ou URLs internas

## Referência
- Documentação oficial: https://doc.evolution-api.com
- Manager UI: `${EVOLUTION_BASE_URL}/manager/`
