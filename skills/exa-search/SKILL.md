---
name: exa-search
description: Web search using Exa AI API for high-quality, real-time results. Use when current information is needed from the web (news, companies, people, research papers, tweets). Supports categories: news, company, people, research paper, tweet. Requires EXA_SEARCHING environment variable.
---

# Exa Search

Web search powered by Exa AI for high-relevance results.

## Setup

Use `EXA_SEARCHING` as API key.

## Basic Search

```bash
curl -sS -X POST 'https://api.exa.ai/search' \
  -H "x-api-key: $EXA_SEARCHING" \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "your search query",
    "type": "auto",
    "num_results": 10,
    "contents": {
      "text": { "max_characters": 10000 }
    }
  }'
```

## Parameters

- `type`: `auto` (balanced, default) | `fast` (speed)
- `num_results`: 1-100 (default 10)
- `category`: `news` | `company` | `people` | `research paper` | `tweet`
- `maxAgeHours`: 0-720 (`0` = livecrawl)

## Category examples

### News

```bash
curl -sS -X POST 'https://api.exa.ai/search' \
  -H "x-api-key: $EXA_SEARCHING" \
  -H 'Content-Type: application/json' \
  -d '{"query":"OpenAI announcements","category":"news","type":"auto","num_results":10}'
```

### Company

```bash
curl -sS -X POST 'https://api.exa.ai/search' \
  -H "x-api-key: $EXA_SEARCHING" \
  -H 'Content-Type: application/json' \
  -d '{"query":"AI startup healthcare","category":"company","type":"auto","num_results":10}'
```

### Tweet

```bash
curl -sS -X POST 'https://api.exa.ai/search' \
  -H "x-api-key: $EXA_SEARCHING" \
  -H 'Content-Type: application/json' \
  -d '{"query":"AI safety discussion","category":"tweet","type":"auto","num_results":10}'
```

### Research paper

```bash
curl -sS -X POST 'https://api.exa.ai/search' \
  -H "x-api-key: $EXA_SEARCHING" \
  -H 'Content-Type: application/json' \
  -d '{"query":"transformer architecture","category":"research paper","type":"auto","num_results":10}'
```

## Content options

Full text:

```json
"contents": { "text": { "max_characters": 10000 } }
```

Highlights (faster/cheaper):

```json
"contents": { "highlights": { "max_characters": 2000 } }
```

## Domain filters

```json
"includeDomains": ["arxiv.org", "github.com"]
```

or

```json
"excludeDomains": ["pinterest.com"]
```

## Tips

- Prefer `type: "auto"` for most searches.
- Use `category` to narrow noise.
- Use `maxAgeHours: 0` for near real-time news.
- Reduce `max_characters` to lower token usage.
