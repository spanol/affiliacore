# API do Parceiro (read-only)

Superfície **versionada e somente-leitura** que a Agência Boost expõe a um parceiro
externo. Separada da API interna (que usa login Firebase): o parceiro autentica por
uma **API key emitida pela Boost**, não tem conta nem acessa o app.

Base: `https://agencyboost.com.br/api/partner/v1`

## Rotas abertas (resumo)

| Método | Rota                    | Scope                  | Retorna                                                  |
| ------- | ----------------------- | ---------------------- | -------------------------------------------------------- |
| GET     | `/pending-affiliates` | `pending-affiliates` | Aprovados na aguardando produção (dado-chave)      |
| GET     | `/affiliates`         | `affiliates`         | Reconciliados/ativos (id, nome, marca, link)             |
| GET     | `/results`            | `results`            | Produção agregada —**só contagem, nada de R$** |

Todas read-only, autenticadas por API key da Boost, com envelope fixo `{ data, total, generatedAt }`.

## Autenticação

Toda requisição envia a key no header:

```
x-boost-api-key: bsk_xxxxxxxxxxxxxxxxxxxx
```

- A key é emitida pelo admin (`scripts/partners/create-partner.mjs`) e mostrada **uma vez**.
- Rate limit: 120 req/min por key.

Respostas de erro: `401` (key ausente/inválida), `403` (key desativada ou sem o scope),
`4xx/5xx` com `{ "error": "..." }`.

## Envelope

Todas as rotas retornam:

```json
{ "data": [ ... ], "total": 123, "generatedAt": "2026-06-17T12:00:00.000Z" }
```

## Endpoints

### GET /pending-affiliates  · scope `pending-affiliates`

Afiliados **aprovados na aguardando produção** (o dado-chave). Filtros opcionais:
`?status=pending|reconciled` · `?house=Superbet`.

Campos por item: `id, name, nameKey, house, status, social, registerUrl, affiliateId (quando reconciliado), createdAt, updatedAt`.

```bash
curl -H "x-boost-api-key: $KEY" \
  "https://agencyboost.com.br/api/partner/v1/pending-affiliates?status=pending"
```

### GET /affiliates  · scope `affiliates`

Afiliados reconciliados/ativos.
Campos: `id, name, siteId, brand, registerUrl` (link de cadastro quando disponível).

### GET /results  · scope `results`

Produção agregada. **Obrigatório**: `startDate`, `endDate`
(`YYYY-MM-DD`). Opcional: `groupBy=affiliate|brand|date|campaign` (default `affiliate`),
`affiliateIds=a,b`.

Campos por item:

- **Métricas (contagem):** `registrations` (cadastros), `first_deposits` (depósitos/FTD),
  `qualified_cpa` (CPA qualificado).
- **Dimensões** (conforme `groupBy`): `affiliate_id`/`affiliate_name`/`id`/`label`,
  `brand`/`brand_id`/`brand_name`, `date`, `campaign`/`campaign_id`/`campaign_name`.

```bash
curl -H "x-boost-api-key: $KEY" \
  "https://agencyboost.com.br/api/partner/v1/results?startDate=2026-06-01&endDate=2026-06-30&groupBy=affiliate"
```
