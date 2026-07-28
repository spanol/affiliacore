# Migração Infinity — runbook de importação dos resultados

Extração feita em 2026-07-28 do painel legado (`admininfinityaffiliates.shop`).
Contexto, inventário e riscos: **`MIGRACAO-INFINITY-LEGADO.md`** na raiz.

> ## ✅ EXECUTADA em 2026-07-28
>
> Casas criadas (manuais) e os 3 arquivos importados na instância `infinity-affiliacore`
> (build `196440c`). **Conferido no `/admin` com período 01/04→28/07/2026 — bate 100% com o legado:**
> 30 afiliados · 351 cadastros · 208 FTD · 175 CPA · comissão **R$ 36.830,00** · depositado R$ 43.602,48.
>
> Os 30 afiliados foram criados como nativos Boost pelo próprio import (idempotente por e-mail:
> os 146 itens da 1ª casa viraram 27 afiliados; a Stake achou 18 dos 19 já criados). **Convite de acesso
> NÃO foi gerado** — ninguém recebeu login, é migração histórica.
>
> **⚠️ FALTA o passo 5 (taxas por afiliado).** Sem `affiliate_configs`, o repasse é 0 e o
> "lucro líquido da agência" do `/admin` exibe a comissão inteira (R$ 36.830) como lucro.
> O real é **R$ 36.830 − R$ 33.540 = R$ 3.290**. Enquanto o passo 5 não rodar, esse número está inflado.

## Os arquivos

Ficam **fora do repo** (contêm PII: nome + e-mail), no scratchpad da sessão:

```
<scratchpad>/migracao-infinity/
  infinity-superbet-v2.tsv        146 linhas
  infinity-stake.tsv               57 linhas
  infinity-esportiva-bet.tsv       32 linhas
  infinity-afiliados-roster.tsv    30 afiliados distintos (18 em +de 1 casa)
```

**Nunca commitar.** Se sumirem, reextrair pelo procedimento da §5 do documento raiz.

Formato = o do importador (`TEMPLATE_COLUMNS` em `src/lib/houseResults.ts`), separado por **TAB**:

```
data  afiliado  email  cadastros  ftd  cpa  rev  deposito  comissao
```

TAB e não vírgula de propósito: `splitLine` é um `split` cru **sem tratamento de aspas**, e há nomes
com vírgula. `detectDelimiter` testa tab antes de `;` e `,`.

### Conferência (já feita, refazer se reextrair)

Os totais batem **exatamente** com os KPIs do painel legado em cada casa:

| Arquivo | Linhas | Cadastros | FTD | CPAs | Comissão | Afiliados |
|---|---:|---:|---:|---:|---:|---:|
| superbet-v2 | 146 | 123 | 76 | 67 | R$ 20.100 | 27 |
| stake | 57 | 151 | 83 | 58 | R$ 10.730 | 19 |
| esportiva-bet | 32 | 77 | 49 | 50 | R$ 6.000 | 5 |
| **Total** | **235** | **351** | **208** | **175** | **R$ 36.830** | **30 distintos** |

Só entraram linhas com algum dado. O legado tinha **2.140 linhas na Stake, das quais 57 com conteúdo**
— o resto eram linhas diárias vazias criadas por afiliado. Descartá-las não perde informação (conferido
pelas somas) e deixa o import 40× menor.

## ⚠️ A armadilha do EUR — leia antes de cadastrar as casas

`house.defaultCpa` é **gravado em EUR** (`Houses.tsx:309`, `Math.trunc(Number(defaultCpa)) // EUR inteiro`)
e convertido para BRL na leitura pela cotação ao vivo. **Os deals da Infinity são em REAIS.**

Se a comissão fosse derivada da taxa da casa, cada valor sairia ~6× maior e flutuaria com o câmbio.
Por isso a coluna `comissao` das planilhas vem **preenchida** (CPAs × base BRL da casa: 300 / 185 / 120):
`houseCommissionForRow` devolve o valor importado quando `total_commission > 0` e **nunca chega na
conversão de EUR**.

→ **Não preencha `CPA padrão` nas casas** achando que é BRL. Ou deixe vazio, ou trate como EUR de verdade.

## Passo a passo

1. **Criar as 3 casas** em `/casas` da instância Infinity, com `dataSource: manual`:
   `Super Bet V2`, `Stake`, `Esportiva Bet`. Anote o slug de cada uma.
2. **Importar os resultados**, uma casa por vez: `/casas` → casa → **Importar resultados** → colar o
   conteúdo do `.tsv` correspondente (ou subir o arquivo).
3. **Onboardar os não-encontrados na hora.** O import lista quem não casou por e-mail e oferece
   *"Cadastrar na Boost"* (cria afiliado nativo `boost_<uuid>`, mirror name-only + `affiliate_email_aliases`
   para a PII) e *"Vincular a existente"*. São os 30 do roster. **O import só grava depois de resolver
   todos** — é proposital, para não criar atribuição fantasma.
4. **Conferir** que o total por casa bate com a tabela acima. Se não bater, pare: algum afiliado casou errado.
5. **Taxas por afiliado** (`affiliate_configs.byBrand`) — repasse praticado no legado:
   Super Bet V2 **R$ 280**, Stake **R$ 160**, Esportiva Bet **R$ 110** por CPA. REV é **0% em 100%** dos
   cadastros (a operação era CPA-puro), então não há REV a migrar.
   ⚠️ Use o editor inline da lista de afiliados / `PATCH /api/affiliate-configs/:id` — **nunca monte o
   payload à mão**: gravar `{cpaValue:0}` em quem não tem taxa faz `rateStatus` ler "configurado"
   (ausência ≠ R$ 0).

## O que este runbook NÃO cobre

- **Os outros ~130 afiliados sem produção** (o legado tem 160 pessoas; 30 produziram). O cadastro completo
  com WhatsApp/Instagram/upline está no legado e pode ser exportado à parte — é a carteira de contatos.
- **O passivo de R$ 32.306,40** em aberto (§6.1 do doc raiz): decisão comercial pendente, **bloqueia o
  Financeiro**, não bloqueia esta importação.
- **Links/tags**: não migram. Ver §6.2.1 do doc raiz (pool de Standby) e o gargalo de atribuição na §5.1.
