# SD Beach Info Scraper

Cópia do scraper para condições de água em San Diego (`sdbeachinfo.com`).

## Arquivos
- `sdbeachinfo_scraper.py`

## Uso
```bash
python3 sdbeachinfo_scraper.py
python3 sdbeachinfo_scraper.py --json
```

## O que ele consulta
- Página principal: `https://sdbeachinfo.com/`
- Endpoint interno: `POST https://sdbeachinfo.com/Home/GetData` com:
  - `name=_AdvisoryPartialView`
  - `name=_WarningPartialView`
  - `name=_ClosurePartialView`

## Sobre "outras praias"
Este site é específico de San Diego County. Para outras praias/lugares:
1. usar a API/site oficial da região,
2. criar um scraper adaptado para a estrutura daquele site.

Se quiser filtrar praias dentro do próprio resultado, use o JSON e aplique filtro por nome (ex.: `La Jolla`, `Imperial Beach`, `Coronado`).
