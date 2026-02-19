# Evolution Notes

## Instância padrão
- `EVOLUTION_INSTANCE_GUYFOLKIZ=guyfolkiz`

## Operação segura
1. Confirmar `connectionState` antes de qualquer leitura/envio.
2. Para acompanhar conversas, preferir:
   - `/chat/findChats/{instance}` para listar chats ativos
   - `/chat/findMessages/{instance}` para puxar histórico por `remoteJid`
3. Só enviar mensagens quando houver comando explícito do Diego.

## CURLs úteis

### Connection state
```bash
curl -sS -X GET "${EVOLUTION_BASE_URL}/instance/connectionState/${EVOLUTION_INSTANCE_GUYFOLKIZ}" \
  -H "apikey: ${EVOLUTION_APIKEY_GUYFOLKIZz}"
```

### List chats
```bash
curl -sS -X POST "${EVOLUTION_BASE_URL}/chat/findChats/${EVOLUTION_INSTANCE_GUYFOLKIZ}" \
  -H "apikey: ${EVOLUTION_APIKEY_GUYFOLKIZz}" \
  -H "Content-Type: application/json" \
  -d '{}'
```
