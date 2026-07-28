# Migração da plataforma legada da Infinity → AffiliaCore

**Levantamento: 2026-07-27.** Recon read-only das duas pontas da plataforma que a Infinity usava antes da AffiliaCore.
Fornecedor legado: **G8 Agency** (assina o rodapé do painel *e* é o CNPJ emissor da NFE — 55.088.898/0001-93).

| Ponta | URL | Acesso |
|---|---|---|
| Admin (backoffice) | `admininfinityaffiliates.shop/admin/*` | login do Vinicius |
| Afiliado | `infinityaffiliates.online/menu/*` | conta de teste criada 27/07/2026 |

> Nenhuma escrita foi feita — só `GET`. Ressalva: o admin legado audita **visualizações** com IP, então a varredura
> deixou ~60 linhas "Visualizou" na trilha de auditoria deles. Não é removível e não é dado nosso.

---

## 1. Arquitetura legada (e por que ela não se copia)

PHP puro com sessão + CSRF, e **um banco de dados por casa**, trocado pelo query param `?db=`.
As chaves internas denunciam que a plataforma foi reciclada de uma operação anterior:
`BET365`=Galera Bet, `BETANO`=Lider Bet, `BETFAIR`=Sorte Online, `KTO`=LottoLand.

**Armadilha crítica:** `?db=` com chave desconhecida **cai silenciosamente no banco `main`** — a tela mostra dados
de outro banco sem avisar. Validei com 11 variantes (`melbetinfi`, `melbetinfini`, `BET15`, `SUPERBET`, `KTO`…):
todas renderizaram "Infinity Affiliates". Qualquer leitura do legado **tem que conferir o rótulo `Banco:` da resposta**,
nunca confiar no parâmetro enviado.

Consequência direta: **o menu anuncia 10 casas, mas só 3 têm banco real.** As outras 7 são fachada.

---

## 2. Inventário de dados — o que existe de verdade

### 2.1 Pessoas

**160 afiliados únicos.** O banco `main` é **superconjunto estrito** de todos os outros
(V2 138/138 ⊆ main, Stake 39/39 ⊆ main, Esportiva 19/19 ⊆ main; Stake 39 ⊆ V2).
Só 11 e-mails aparecem em um único banco. Ou seja: **migra-se 160 pessoas, não 356 linhas.**

`main` tem os 160 cadastros e **zero produção** — é o diretório mestre, não uma casa.

### 2.2 Produção por casa

| Banco | Usuários | Lançamentos diários | Período coberto | Registros | FTD | CPAs | Deposits | CPA base |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Super Bet V2 | 138 | 146 | 19/05 → **29/06/2026** | 123 | 76 | 67 | R$ 31.770 | R$ 300 |
| Stake | 39 | 2.140 | 11/04 → **26/07/2026** | 151 | 83 | 58 | R$ 8.039 | R$ 185 |
| Esportiva Bet | 19 | 54 | 22/06 → **25/07/2026** | 77 | 49 | 50 | R$ 3.794 | R$ 120 |
| `main` | 160 | 0 | — | 0 | 0 | 0 | — | R$ 125 |
| **Total** | **160 únicos** | **2.340** | 11/04 → 26/07/2026 | **351** | **208** | **175** | **R$ 43.603** | |

Os totais **reconciliam com os KPIs do próprio painel** em cada banco (conferido bank a bank).

**Leitura operacional:** Super Bet V2 parou em 29/06. A operação viva hoje é **Stake** (até 26/07) e Esportiva (25/07).

### 2.3 Cobertura de links/tags

| Banco | Com link | Sem link | Standby | Com link s/ resultado | **Produzindo** |
|---|---:|---:|---:|---:|---:|
| Super Bet V2 | 61 | 77 | 41 | 34 | **27** |
| Stake | 20 | 19 | 0 | 2 | **18** |
| Esportiva Bet | 11 | 8 | **288** ⚠️ | 6 | **5** |
| `main` | 0 | 160 | 0 | 0 | 0 |

**Só ~50 afiliados produzem resultado** (27+18+5, com sobreposição de pessoas). Dimensione o onboarding por esse número,
não pelos 160.

⚠️ A Esportiva reporta **288 links em standby para 19 usuários** — número do próprio painel, não erro de extração.
É lixo de banco reciclado (pool de tags pré-geradas sem dono). **Não migrar.**

### 2.4 Passivo financeiro em aberto — ponto de atenção

| Banco | CPAs | Bruto (repasse) | ISS | Líquido a pagar | Lançado | Pago |
|---|---:|---:|---:|---:|---:|---:|
| Super Bet V2 | 67 | R$ 18.760,00 | R$ 938,00 (5%) | R$ 17.822,00 | R$ 0,00 | R$ 0,00 |
| Stake | 58 | R$ 9.280,00 | R$ 185,60 (2%) | R$ 9.094,40 | R$ 0,00 | R$ 0,00 |
| Esportiva Bet | 50 | R$ 5.500,00 | R$ 110,00 (2%) | R$ 5.390,00 | R$ 0,00 | R$ 0,00 |
| **Total** | **175** | **R$ 33.540,00** | **R$ 1.233,60** | **R$ 32.306,40** | **R$ 0,00** | **R$ 0,00** |

**R$ 32.306,40 líquidos devidos a afiliados, com nada lançado e nada pago.** Um único afiliado concentra
R$ 15.694 disso (Super Bet V2). **O ISS varia por casa** (5% na V2, 2% nas outras) — não é constante do sistema.

Receita da operação (CPAs × base) = R$ 36.830 → **margem da agência R$ 3.290 (8,9%)**, com spread por casa de
R$ 20/CPA (V2), R$ 25/CPA (Stake) e R$ 10/CPA (Esportiva).

---

## 3. Modelo econômico legado × AffiliaCore

CPA em **três camadas**, não duas:

```
CPA Sistema (300)  →  o que a casa paga à agência
CPA Agente  (280)  →  repasse ao afiliado direto
CPA Afiliado(270)  →  repasse ao indicado (sub)
```

A margem sai do spread, e o gerente ganha **"lucro sobre equipe"** pela diferença entre o que recebe e o que repassa
(visível no painel: *"Abaixo: 19 pessoa(s) · Repasse: R$ 500,00 · Lucro sobre equipe: R$ 60,00"*).

No painel do afiliado isso aparece como **"Limite de repasse"**: o próprio afiliado define o CPA do indicado,
com teto no próprio CPA. Hoje na AffiliaCore quem define a taxa do sub é o admin.

**Rede de 4 níveis** (N1 direto + N2/N3/N4 indiretos) contra o modelo especial+sub-rede atual.

---

## 4. Mapa de campos → schema AffiliaCore

| Legado | Origem | AffiliaCore | Observação |
|---|---|---|---|
| Nome | `afiliados` / `config` | `affiliates/{id}.name` | mirror **name-only**, `source:'boost'` |
| E-mail | `afiliados` | `affiliate_email_aliases/{normEmail}` | **PII — nunca no mirror `affiliates`** |
| E-mail (login) | idem | `users/{uid}.email` + `role:'client'` | via convite/`createInviteDoc` |
| WhatsApp, Instagram | `config` (users) | campo novo no perfil | 118 dos 160 têm contato |
| Gerente (`#id`) | `config` (users) | `special_affiliates` / sub-rede | **todos os 160 têm upline** |
| REV (%) | `config` (users) | `affiliate_configs.revPercentage` | **0% em 100% dos casos hoje** |
| CPA Unit. (por casa) | `comissoes` | `affiliate_configs.byBrand[brandId].cpaValue` | 280 / 160 / 110 — **taxa por casa, obrigatório** |
| Tag (`NakataAgency###`) | `regras` | não migra (ver §6) | é da conta da G8 |
| Casa | `?db=` | `houses/{id}` com `dataSource:'manual'` | 3 casas: Super Bet V2, Stake, Esportiva |
| `date, registers, nqftd, cpas, revshare_value, deposits` | `comissoes` (linha/dia) | `house_results` | **2.340 linhas** — shape quase 1:1 |

### Invariantes do repo que o conversor tem que respeitar

- **`num()` NÃO parseia vírgula pt-BR** (`'2.400,50'` → 0). Todo valor extraído vem formatado em pt-BR
  (`"R$ 3.360,00"`) → o conversor **tem que normalizar antes**, nunca passar a string crua para `num()`.
  Esta é a falha mais provável da migração.
- **Ausência de config ≠ R$ 0.** Afiliado sem taxa no legado não pode virar `{cpaValue:0}` — use
  `buildBrandConfigTopPayload`, que devolve `null` quando não há nada a gravar.
- **Taxa por casa via `byBrand[brandId]`** — as três casas têm CPA diferente; gravar só no topo corrompe o cálculo.
- **E-mail de afiliado nunca no mirror `affiliates`** (vazaria a todo signed-in) → `affiliate_email_aliases`, server-only.
- Casa manual cruza resultado **pelo e-mail de login na AffiliaCore**, não pela identidade legada.

---

## 5. Método de extração (endpoints validados)

Todos `GET`, autenticados por sessão do admin. **Confira sempre o rótulo `Banco:` da resposta** (§1).

| Endpoint | Conteúdo | Paginação |
|---|---|---|
| `/admin/afiliados?db=<db>&page=N` | roster: nome, e-mail, upline, registros, CPAs, comissão, deposits, criado | `page`, 20/pág |
| `/admin/config?db=<db>&page=N` | users: WhatsApp, Instagram, gerente, REV%, flag admin | `page`, 50/pág |
| `/admin/comissoes?db=<db>&from=<iso>&to=<iso>&p=N` | **lançamentos diários** | ⚠️ `p`, **não** `page`; 15/pág |
| `/admin/regras?db=<db>&view=<V>&page=N` | tag + link + resultado; `V` ∈ `com_link`, `sem_link`, `standby`, `com_link_sem_resultado`, `com_link_com_resultado` | `page`, 20/pág |
| `/admin/pagamentos.php?export=xlsx&payment_mode=<structure\|individual>&db=<db>` | XLSX, 21 colunas | — |

**Duas pegadinhas que custaram tempo:**
1. `comissoes` **sem** `from`/`to` devolve só o período padrão (últimos 30 dias) e **agregado por afiliado**.
   Com intervalo amplo, a mesma tela vira a tabela de **lançamentos diários** — que é o que interessa.
2. O `📥 XLSX` da tela Links é **import**, não export. O único export é o de Pagamentos, e ele cobre
   **apenas usuários com saldo a receber** (3 linhas na Super Bet V2) — insuficiente como fonte de migração.

O XLSX de Pagamentos (21 colunas) foi baixado e parseado; serve para **conferir o passivo**, não para migrar o cadastro:
`ID, Gerente/estrutura, E-mail, Chave PIX, Tag, Período inicial/final, CPAs próprios/equipe/estrutura, CPA/Deal atual, REV aplicado, Lucro da equipe, Valor bruto, ISS (%), ISS (R$), Valor líquido, Pago, Em aberto, Saldo a receber, NFE pendentes`.

---

## 6. Riscos e decisões pendentes

1. **Passivo de R$ 32.306,40** — quem honra? Se a AffiliaCore assume, migra como saldo inicial de carteira
   (a carteira do Tier 1, na branch `feat/integracao-affility`, é o lugar). Se a G8 honra, migra só o histórico.
   **Bloqueia o go-live da tela de Financeiro.**
2. **De quem é a conta de afiliado na casa?** — pergunta comercial em aberto, mas o lado técnico está resolvido
   (ver §6.2.1). As tags são séries por casa: `NakataAgency###` (Super Bet V2), `aff###` (Stake) e
   **`infinitw###`** (Esportiva). O prefixo `infinitw` é claramente Infinity-branded, o que sugere sub-conta da
   Infinity; mas **a NFE do legado era emitida pela G8**. Ou seja: a marca é da Infinity, o fluxo de pagamento
   passava pela G8. Confirmar com a casa quem detém o contrato **antes** de prometer atribuição a terceiros.
   ⚠️ Correção de uma afirmação anterior deste documento: as tags **não** são obviamente "da G8" — a evidência
   do prefixo aponta para o contrário.

### 6.2.1 Não é preciso reemitir link: há um pool pronto

O painel legado **não gera** link — ele só **registra** link cunhado na plataforma da casa. As duas formas de
entrada são "cole links (1 por linha), tag extraída de `?tag=` ou `?afp2=`" e import XLSX (`Coluna A: Link,
Coluna B: Tag`). Mas ele tem um terceiro fluxo, que resolve o problema: **atribuir um link do Standby a um
usuário** (`action + user_id + standby_id`).

E o Standby da Esportiva tem **288 links prontos e sem dono**, todos em `go.aff.esportiva.bet`, mesmo path,
param `afp`, com **288 tags distintas** da série `infinitw###` (ex.: `infinitw291`…`infinitw296`).

Consequência prática: para dar um link rastreável a um afiliado novo na Esportiva **não é preciso gerar nada na
casa nem escrever no painel legado** — basta tomar a URL de um standby não usado e apontá-la como `registerUrl`
do afiliado na AffiliaCore. O `/go/:code` embrulha, conta o clique do nosso lado, e a casa reporta pela tag do
link. Zero impacto em qualquer link existente (são links nunca atribuídos).
3. **CPA de 3 camadas com repasse self-service** vira requisito da AffiliaCore ou a Infinity aceita 2 camadas?
   Idem **rede de 4 níveis** vs especial+sub-rede.
4. **ISS varia por casa** (5% / 2% / 2%) — o modelo atual assume taxa única.
5. **REV é 0% em 100% dos cadastros** — a operação legada é CPA-puro. Migrar REV é no-op.
6. Não migrar: os 288 standby da Esportiva, as 7 casas fantasma, e a Universidade (é stub).

---

## 7. Catálogo de features mapeadas

### Portar (sem equivalente na AffiliaCore)

| Feature | O que faz |
|---|---|
| **CPA Abuser** | Detecta CPA abusado e **desconta do saque**, com detalhamento por tag/afiliado no extrato |
| **WhatsApp via Evolution API** | Cria grupo, adiciona participantes e promove admins fixos direto do painel, com seleção de usuários por banco (`evo.devmotion.com.br`, instância única) |
| **Triagem de tag/link** | As 5 visões (com/sem link, standby, com link e sem resultado, produzindo) — é o painel operacional do dia a dia |
| **Acesso de Bets por usuário** | Quais casas cada afiliado enxerga |
| **Meta de CPA mensal** | Meta por competência com progresso ("Feito / Faltam / %"), **zera na virada do mês** |
| **Aprovação com CPA no ato** | Fila pendente/aprovado/rejeitado, define o CPA do indicado ao aprovar; perfil traz nicho e faixa de audiência |

### Médio valor

Chat interno afiliado↔admin com anexo · popups gerenciáveis com dismissal · rede de 4 níveis com árvore expansível ·
premiações (Silver 100K → Diamond 10M, placas) · 2FA Google Authenticator · materiais/banners por categoria +
carrossel no dashboard do afiliado.

### Já coberto (ou melhor) na AffiliaCore

Saque PIX + NFE + ISS + export XLSX (é o Tier 1 da branch `feat/integracao-affility`, ainda **não pushado**) ·
auditoria — a nossa é server-authoritative e append-only; **a deles loga view+IP, que a nossa não faz** (vale portar
o registro de visualização) · avisos/sino · ranking diário.

### Não copiar

Um banco por casa · o fallback silencioso de `?db=` para `main` · Universidade (stub "disponível em breve").

---

## 8. Próximos passos

1. **Decidir o item 6.1** (quem honra os R$ 32.306,40) — bloqueia o Financeiro.
2. Escrever o conversor em `scripts/migracao-infinity/` consumindo os endpoints da §5, com o parser pt-BR
   explícito e os invariantes da §4. Saída: `affiliates`, `affiliate_email_aliases`, `affiliate_configs` (byBrand),
   `houses` (3, manual), `house_results` (2.340 linhas).
3. Seed das 3 casas na instância Infinity com `dataSource:'manual'` e CPA por casa (280/160/110).
4. Links das contas produtivas: consumir o pool de Standby (§6.2.1) em vez de reemitir na casa — a URL vira
   `registerUrl` do afiliado na AffiliaCore, sem escrever no painel legado. Confirmar antes o item §6.2
   (quem detém o contrato na casa).
5. Backlog de features: **CPA Abuser** e **Meta de CPA mensal** primeiro (baratas e de impacto direto no dinheiro);
   **WhatsApp/Evolution** como diferencial comercial.

---

## Anexo — dados extraídos

Planilha de pagamentos (Super Bet V2, modo estrutura) e o dump das tabelas ficaram **fora do repo**, no scratchpad
da sessão, por conterem PII (nome, e-mail, WhatsApp, Instagram, chave PIX). **Não commitar.**
Este documento contém apenas agregados e schema.
