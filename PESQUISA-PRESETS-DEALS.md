# Pesquisa: catálogo de presets de acordos (deal presets) para nova agência

> 2026-07-21. Pergunta: como uma agência que está começando na AffiliaCore poderia
> **selecionar um ou mais acordos de um catálogo pronto** e disponibilizá-los aos
> afiliados, em vez de criar cada `Deal` do zero em `/acordos`? Continuação de
> `PESQUISA-AFFILITY.md`/`PLANO-INTEGRACAO-AFFILITY.md` (P2, marketplace já
> entregue) e ponte com `PESQUISA-INTEGRACAO-CASAS.md` (mapa casa→plataforma).

## TL;DR

1. **Dá pra montar um catálogo real** — pesquisei os programas de afiliados públicos
   dos operadores que já aparecem no repo (Superbet, Betano, KTO, Sportingbet/Entain,
   bet365, Betfair, Estrela Bet, Brazino777) + faixas gerais do mercado BR. A maioria
   publica o **modelo** (CPA/RevShare/Híbrido) e uma **faixa** de %, raramente o valor
   exato — isso já é o suficiente pra um preset **de referência**, não pra um preset
   **autoritativo**.
2. **Achado que muda o design:** os números publicados são **material de marketing do
   operador pra recrutar afiliado**, não o termo realmente negociado por uma agência
   específica. Publicar isso como se fosse "o acordo" seria enganoso — o preset tem
   que nascer como **rascunho/referência**, igual fizemos com o Jurídico (`modo soft`):
   o admin confirma o valor real com o gerente de afiliados do operador antes de ativar.
3. **Sinergia forte com `PESQUISA-INTEGRACAO-CASAS.md`:** aquele doc já mapeou QUAL
   plataforma de software cada operador usa (Income Access/MyAffiliates/proprietário) —
   isso vira o campo "nota de integração" do preset, avisando de cara se dá pra puxar
   dado automatizado depois ou só planilha manual.
4. **Arquitetura recomendada:** catálogo **estático, versionado no repo** (mesmo padrão
   de `DEFAULT_BRANDS`/`knownHouses.ts`) — não uma coleção Firestore "meta" nem scraping
   ao vivo. Ativar um preset cria a `house` (se não existir) + um `Deal` com
   `active: false` (rascunho) pros valores sugeridos — nunca publica direto no
   marketplace sem o admin revisar.

## 1. Dados de mercado coletados (por operador)

Todos os valores abaixo são **faixas publicamente divulgadas pelos próprios programas
de afiliados** (material de recrutamento) — NÃO são termos negociados de nenhuma
agência real. Tratar como ponto de partida, sempre confirmar com o gerente de contas.

| Operador | Modelo(s) | RevShare | CPA | Ciclo | Moeda/mín. | Sub-afiliado | Integração (ver §2) | Fonte |
|---|---|---|---|---|---|---|---|---|
| **Superbet** | RevShare + CPA (sob consulta) | não publicado | sob consulta | Mensal | R$, mín. R$100 | Sim | Income Access — sem API pública de afiliado | [StatsDrone](https://statsdrone.com/affiliate-programs/superbet-affiliates/) |
| **Betano** | RevShare + CPA (sob consulta) | 20–30% | sob consulta | — | — | Sim (plano sob consulta) | Income Access — mesma limitação | [StatsDrone](https://statsdrone.com/affiliate-programs/betano-affiliates/) |
| **KTO** | RevShare + CPA + Híbrido | 25–40% (escalonado por volume) | por depósito mín., sob consulta | Mensal | mín. €200 | **Sim — 5%** | MyAffiliates — **API XML pro afiliado, confirmado** | [3SNET/AskGamblers](https://3snet.co/en/gambling/kto/); PESQUISA-INTEGRACAO-CASAS [V] |
| **Sportingbet/BetMGM (Entain)** | RevShare | 25–35% | — | — | — | — | Proprietário (Entain Partners) | PESQUISA-INTEGRACAO-CASAS |
| **bet365** | RevShare (CPA só "super-afiliado") | até 30% (faixa 25–35%) | sob consulta, exceção | — | mín. €100, cookie 45d | — | Proprietário, sem API pública | [StatsDrone](https://statsdrone.com/affiliate-programs/bet365-partners/) |
| **Betfair** | RevShare + CPA + Híbrido | 25–35% (até 40% escalonado) | £25–£60 | Mensal | mín. £50 | — | Income Access (mesma família Superbet) | [StatsDrone](https://statsdrone.com/affiliate-programs/betfair-affiliates/) |
| **Estrela Bet** | CPA + RevShare + Híbrido | até 40% (híbrido) | qualifica com R$50 depositado | Mensal, PIX | R$ | — | Plataforma própria | [olhardigital](https://olhardigital.com.br/apostas/programa-de-afiliados-estrelabet/) |
| **Brazino777** | RevShare escalonado (4 níveis) | 25%→35%→42%→50% por volume (10/35/65+ jogadores) | ~US$22–25 (via rede) | — | — | — | Plataforma própria (BrazPartners) | [affplus](https://www.affplus.com/o/brazino777) |
| **Deuces** *(observado ao vivo na Affility — ver `PESQUISA-AFFILITY.md`)* | CPA | — | **R$80** (valor real de um acordo aprovado) | Quinzenal | Crypto, México | — | — | Scrape próprio 2026-07-21 |

## 2. Faixas gerais do mercado BR (fallback quando o operador não tem preset dedicado)

Fonte: [track360 — RevShare vs CPA apostas, guia operador 2026](https://track360.io/pt-br/blog/revshare-vs-cpa-apostas-operador-2026) + agregados internacionais (Business of Apps, AffPapa).

- **CPA esportivo/cassino BR:** R$80 a R$350 por depósito qualificado (varia por vertical/qualificação).
- **RevShare esportivo:** 25–40% do NGR.
- **RevShare cassino:** tende mais alto, 35–50% do NGR.
- **Híbrido comum:** CPA menor + RevShare menor simultâneos (ex.: R$100 CPA + 20% RevShare) — reduz risco pras duas partes.

Esses números viram os **presets genéricos por vertical** (não amarrados a um operador
específico) — úteis quando o admin quer "um esportivo padrão BR" sem escolher operador.

## 3. Framing de risco (por que isso NÃO pode ser "autoritativo")

Mesma lição do Jurídico versionado (`modo soft`): dado de terceiro, desatualiza, e uma
agência que publicasse "Superbet — CPA R$300" pro afiliado sem ter esse acordo de
verdade estaria **mentindo pro próprio afiliado** — e pior, se o Deal fosse aprovado e
`byBrand` aplicado, isso venceria como **taxa real de repasse** (o núcleo de dinheiro
não distingue "preset" de "confirmado"). Logo:

- Todo preset carrega **`source` + `asOf`** (data da coleta) exibidos na UI.
- Ativar um preset **nunca publica direto** — cria o `Deal` com `active: false`
  (mesmo campo que já existe) e um aviso "valores de referência — confirme com o
  operador antes de ativar", pro admin editar os números reais e só então ativar.
- Isso é **zero mudança no núcleo de dinheiro** (`commission.ts`, `deal.ts`) — só mais
  uma fonte de PREENCHIMENTO inicial do formulário que já existe em `/acordos`.

## 4. Arquitetura proposta

### 4.1 Onde o catálogo vive
**Estático, no repo**, mesmo padrão de `src/lib/brand.ts` (`DEFAULT_BRANDS`). Motivos:
- É dado de produto (compartilhado entre TODAS as instâncias), não dado de tenant —
  não faz sentido numa coleção Firestore por-instância.
- Versionado/revisável em PR — errar um número e corrigir é um commit, não uma
  migração de dado em N projetos Firebase.
- Sem infra nova, sem custo de manutenção de scraping ao vivo (que a pesquisa acima
  já mostra que seria frágil — a maioria dos operadores nem publica o número exato).
- Atualização periódica (trimestral?) é um processo humano de research, não um cron.

### 4.2 Modelo de dados (novo, puro — `src/lib/dealPresets.ts`)
```ts
interface DealPreset {
  operatorSlug: string;        // 'superbet', 'kto', 'betano'...
  operatorName: string;
  market: string[];            // ['Brasil'] — geo(s) cobertos
  category: 'esportivo' | 'cassino' | 'ambos';
  model: DealModel;            // reusa o enum de deal.ts
  cpaRange?: [number, number]; // [min, max] em R$; ausente = não publicado
  revRange?: [number, number]; // [min, max] em %; ausente = não publicado
  cycle: PaymentCycle;         // reusa deal.ts
  currency: DealCurrency;
  subAffiliateAvailable?: boolean;
  integrationNote?: string;    // do PESQUISA-INTEGRACAO-CASAS: "Income Access, sem API..."
  source: string;              // URL da pesquisa
  asOf: string;                // 'YYYY-MM' da coleta
}
```
Reusa 100% dos tipos de `src/lib/deal.ts` (`DealModel`, `PaymentCycle`, `DealCurrency`)
— o preset é literalmente "um `Deal` incompleto + metadados de proveniência".

### 4.3 Fluxo de ativação (server, `POST /api/deals/from-preset`)
1. Admin escolhe 1+ presets no catálogo (UI: aba "Catálogo" em `/acordos`).
2. Servidor, por preset: cria `houses/{operatorSlug}` se não existir (dataSource:
   'manual', nome do preset) — reusa exatamente `POST /api/houses` já existente.
3. Cria `deals/{id}` com `active: false`, `cpaValue`/`revPercentage` = **ponto médio da
   faixa** (só de largada — o admin edita antes de ativar), `houseId` apontando pra
   casa criada no passo 2. Audita `deal.create_from_preset` com `metadata: {presetSlug,
   source}`.
4. Admin vê o rascunho em `/acordos`, edita os valores reais (negociados com o
   operador) e clica "Ativar" — **mesmo fluxo que já existe hoje**, nada novo aqui.

### 4.4 UI
Aba **"Catálogo"** em `/acordos` (ao lado de "Acordos"/"Solicitações"): cards por
operador, badge de categoria/mercado, faixa de valores com "valores de referência,
[fonte] · coletado em [asOf]", checkbox multi-seleção + "Adicionar N ao meus acordos
(como rascunho)". Design idêntico ao já usado nos cards de `/acordos` e `/parcerias`
(reaproveita `buildDealLabel`).

### 4.5 Sinergia com onboarding de instância nova
A skill `provision-instance` já cobre o provisionamento técnico (projeto Firebase →
App Hosting → marca → rollout). O catálogo de presets é o próximo degrau natural:
depois que a instância está no ar, o playbook de onboarding do CLIENTE (não do
projeto) pode incluir "abra `/acordos` → Catálogo → selecione os operadores que vai
rodar" como o primeiro passo de configuração comercial — reduz o "tela vazia" que a
Infinity tem hoje (0 acordos cadastrados).

## 5. Escopo sugerido para a 1ª entrega

- 8–10 presets (os operadores desta pesquisa) + 2–3 genéricos por vertical (fallback
  do §2, sem operador nomeado — "CPA esportivo padrão BR", "RevShare cassino padrão BR").
- Só o catálogo + fluxo de ativação (rascunho). **Não** inclui: atualização automática
  do catálogo, logos dos operadores (usar iniciais como já faz `Partnerships.tsx`),
  edição do catálogo pela UI (é código, PR pra atualizar).
- Reusa 100% do núcleo `deal.ts`/`houses` já testado — o trabalho novo é pequeno
  (a lib de presets + 1 endpoint + 1 aba de UI), o risco é baixo (nada no core de
  dinheiro muda, só preenchimento inicial de formulário).

## Fontes
- Superbet: https://statsdrone.com/affiliate-programs/superbet-affiliates/
- Betano: https://statsdrone.com/affiliate-programs/betano-affiliates/
- KTO: https://3snet.co/en/gambling/kto/ · https://www.askgamblers.com/casino-affiliate-programs/kto-affiliates-review
- bet365: https://statsdrone.com/affiliate-programs/bet365-partners/
- Betfair: https://statsdrone.com/affiliate-programs/betfair-affiliates/
- Estrela Bet: https://olhardigital.com.br/apostas/programa-de-afiliados-estrelabet/
- Brazino777: https://www.affplus.com/o/brazino777 · https://www.brazino77.com.br/programa-de-afiliados-brazino777-tenha-renda-extra-mensal-e-sem-burocracia/
- Faixas gerais BR: https://track360.io/pt-br/blog/revshare-vs-cpa-apostas-operador-2026
- Faixas gerais internacionais: https://affpapa.com/best-sports-betting-affiliate-programs/ · https://www.businessofapps.com/affiliate/betting/
- Interno: `PESQUISA-INTEGRACAO-CASAS.md` (mapa casa→plataforma, base do campo `integrationNote`), `PESQUISA-AFFILITY.md` (o exemplo real "Deuces")
