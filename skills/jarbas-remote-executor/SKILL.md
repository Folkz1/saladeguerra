---
name: jarbas-remote-executor
description: Remotely execute commands and file operations on the user's local Windows PC via Jarbas Remote Executor Bridge, preferably through Jarbas Memory Core proxy. Use when the user asks to run PowerShell/cmd/python/node, open local apps, or read/write/edit/delete files on Windows paths like D:\\ or C:\\.
---

# Jarbas Remote Executor

## Prefer secure route via Memory Core proxy

Always prefer calling the bridge through Jarbas Memory Core:

1. Check current bridge:
   - `POST {JARBAS_MEMORY_URL}/bridge/current`
2. Verify health:
   - `POST {JARBAS_MEMORY_URL}/bridge/healthcheck`
3. Execute proxied request:
   - `POST {JARBAS_MEMORY_URL}/bridge/proxy`

Use `Authorization: Bearer {JARBAS_MEMORY_AUTH_TOKEN}`.

## Proxy request format

Send a JSON body in this shape:

```json
{
  "method": "POST",
  "path": "/run",
  "payload": {
    "tool": "powershell",
    "command": "echo Hello from Jarbas"
  },
  "timeout_ms": 60000
}
```

## Common calls

### Run command

```json
{
  "method": "POST",
  "path": "/run",
  "payload": {
    "tool": "powershell",
    "command": "echo Hello from Jarbas"
  }
}
```

### List directory

```json
{
  "method": "POST",
  "path": "/files/list",
  "payload": {
    "path": "D:\\jarbas_vida",
    "recursive": false
  }
}
```

### Write file

```json
{
  "method": "POST",
  "path": "/files/write",
  "payload": {
    "path": "D:\\jarbas_vida\\teste.md",
    "content": "# Olá Mundo\n\nConteúdo do arquivo.",
    "createDirs": true
  }
}
```

### Read file

```json
{
  "method": "POST",
  "path": "/files/read",
  "payload": {
    "path": "D:\\jarbas_vida\\teste.md"
  }
}
```

### Delete file

```json
{
  "method": "POST",
  "path": "/files/delete",
  "payload": {
    "path": "D:\\jarbas_vida\\teste.md"
  }
}
```

### Long task

```json
{
  "method": "POST",
  "path": "/jobs/run",
  "payload": {
    "tool": "powershell",
    "command": "npm run build",
    "cwd": "D:\\projetos\\meu-projeto",
    "timeout": 600000
  }
}
```

## Guardrails

- Confirm destructive actions (delete directories, system-wide changes) before executing.
- Prefer `/jobs/run` for long-running tasks.
- Always set `cwd` when a command depends on a specific project folder.
- Validate that target paths are real Windows paths on the remote host (avoid writing Linux `/app/D:\\...` artifacts).
