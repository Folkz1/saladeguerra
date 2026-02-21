---
name: war-board-operator
description: Operate and maintain the Sala de Guerra board safely (read current state, apply incremental updates, preserve working cards, clean noisy autosync output, sync to Notion). Use when user asks to update tasks, reprioritize P0/P1, refresh board with real project context, or sync board data to Notion.
---

# War Board Operator

1) Read current state first (mandatory)
- GET `/api/board`.
- Never overwrite blindly.
- Preserve manual cards (`tags` containing `manual`, `vida`, `pessoal`) and `done` unless user asks to remove.

2) Update strategy
- Prefer incremental changes over full replacement.
- If full replacement is requested, keep columns and meta coherent.
- Keep card fields consistent:
  - `id`, `columnId`, `title`, `summary`, `notes`, `owner`, `priority`, `due`, `DoD`, `proximo_passo`, `risco`, `tags`.

3) Priority model
- `p0`: money/blocker <48h
- `p1`: active pipeline / critical follow-up
- `p2`: demand/content
- `p3`: infra/research

4) Quality guardrails
- Avoid generic AI-invented tasks.
- Use concrete evidence from user updates and WhatsApp history.
- Keep summaries short and actionable.
- Add references/materials (URLs, docs, chat source) when available.

5) Safe write
- POST `/api/board` with `x-api-key`.
- Re-read `/api/board` and confirm `meta.updatedAt` changed.

6) Optional Notion sync (when requested)
- Ensure Notion token valid (`/v1/users/me`).
- Use/create database `War Tasks` under `CENTRAL DE PROJETOS`.
- Upsert by `Card ID`.

7) Regression check (mandatory)
- After any update, validate:
  - no loss of critical manual cards
  - columns intact
  - P0/P1 still visible
  - front still renders and task details open.

## Quick execution checklist
- [ ] Snapshot current board
- [ ] Prepare patch/update
- [ ] Apply update
- [ ] Verify updatedAt + key cards
- [ ] (If requested) sync to Notion
- [ ] Report what changed clearly
