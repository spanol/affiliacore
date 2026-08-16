# Plano: taxa com vigência (a comissão nova não reprecifica o passado)

> 2026-08-16. Origem: resposta 10 do cliente Infinity ("sim o gerente pode mudar
> a comissão após o link já gerado, mas dentro disso já criar um filtro onde a
> nova comissão não altere o que foi gerado antes da mudança"). Levantado no §10
> do `PLANO-TIPOS-DE-DEAL.md`, onde ficou bloqueado.
>
> Decisão do Vinicius (16/08): seguir pela **opção 2** (fechamento congela o
> apurado; a taxa nova vale dali em diante), e não pela opção 1 (datar a taxa no
> núcleo).

## TL;DR

1. **As duas opções convergem.** Ao desenhar a opção 2 a fundo, ela vira a opção
   1: o objeto durável tem que ser uma **linha do tempo de taxas**, e o
   "fechamento" é só o gesto que corta um segmento novo. Congelar o VALOR não
   compõe (§2). Estou entregando o gesto que você escolheu, com o
   armazenamento que sobrevive ao uso real.
2. **Retrocompatível por construção.** `byBrand[casa]` continua sendo a taxa
   ATUAL; a novidade é um `history` ao lado, com os segmentos passados. Config
   sem `history` se comporta exatamente como hoje, então nada no parque muda.
3. **É tratável na Infinity porque a produção deles é datada.** Toda linha de
   `house_results` tem `date` (o doc id é `slug__date__afiliado`) e a instância é
   OTG-free: 100% do que eles apuram sabe em que dia caiu. A limitação fica no
   agregado OTG sem data, e ela é declarada, não silenciosa (§5).
4. **O problema é maior que o gerente.** Hoje QUALQUER edição de taxa, inclusive
   a do admin no `/admin`, reprecifica o histórico inteiro. O pedido dele expõe
   um comportamento que já existia.

## 1. O que existe hoje

Não há ledger. Toda comissão é derivada ao vivo:
`calcAffiliatePayout(linha, configAtual, brandId)`. O próprio
`src/lib/withdrawal.ts` registra a ausência com todas as letras: "saldo apurado
NÃO é recalculado/validado aqui (isso ficaria pra uma v2 com ledger)".

A carteira (`Financeiro.tsx`) busca `fetchAffiliateResultsByBrand(afiliado,
range)` para um **range escolhido pelo usuário** e aplica `computeNetPayout`
sobre a config atual. São 18 arquivos consumindo o payout.

Consequência: trocar a taxa de 100 para 80 hoje reprecifica o FTD do mês
passado.

## 2. Por que congelar o VALOR não resolve

O desenho ingênuo da opção 2 é `commission_closings/{afiliado}__{casa}__{período}`
guardando `{ gross, iss, net }`. Ele quebra no primeiro uso real:

- A carteira não tem período fixo, tem **range livre**. Um pedido de 10/08 a
  20/08 atravessa um fechamento pela metade, e de um total congelado não se
  extrai a fatia. Não dá para ratear: as métricas não são uniformes no tempo.
- Os 18 consumidores teriam que saber somar "fechamentos inteiros + cauda ao
  vivo". Quem esquecesse mostraria um número diferente do da carteira, e a
  invariante "agregado == Σ dos cards" do `CLAUDE.md` cairia sem erro na tela.

O que compõe é congelar a **taxa por janela**, não o total. Como
`calcAffiliatePayout` é LINEAR nas métricas (o repo já usa essa propriedade em
`network.ts:365` e `perHousePayout.ts`), o payout de um range qualquer é a soma
dos payouts por janela. Qualquer recorte de data continua fechando.

E é a MESMA experiência para o cliente: a comissão nova não toca no que foi
gerado antes.

## 3. Modelo de dado

`affiliate_configs/{afiliado}` ganha, dentro de cada casa:

```ts
byBrand: {
  betano: {
    cpaValue: 80, revPercentage: 0,        // taxa ATUAL (inalterado, é o que existe hoje)
    history: [                             // segmentos ENCERRADOS, append-only
      { from: '2026-06-01', to: '2026-08-15', cpaValue: 100, revPercentage: 0 },
    ],
    since: '2026-08-16',                   // início da vigência da taxa atual
  }
}
```

Decisões:

- **A taxa atual continua onde estava.** Todo consumidor que não conhece
  vigência lê `byBrand[casa].cpaValue` e acerta o presente. Zero migração, zero
  regressão.
- **`history` é append-only e só guarda o passado.** Ausente = a taxa sempre foi
  essa, que é a verdade para todo mundo hoje.
- **Granularidade de DIA** (`YYYY-MM-DD`), a mesma de `house_results`. Não faz
  sentido ser mais fino que o dado que se apura.
- **Fechamento é meia-aberto no fim:** `to` é o último dia coberto pela taxa
  antiga, e a nova vale a partir do dia seguinte. A mudança nunca reprecifica o
  dia que já correu.
- Crescimento não é preocupação: troca de taxa é evento raro. Se um dia for,
  o corte vira subcoleção sem mudar a função pura.

## 4. Núcleo puro

`src/lib/rateHistory.ts` (novo, sem Firebase, importável pelo server):

```ts
export interface RateSegment { from: string; to: string; cpaValue: number; revPercentage: number }

// Corta o segmento: fecha a taxa vigente em `effectiveFrom - 1 dia` e devolve o
// byBrand novo. É a operação que a rota de precificação passa a fazer.
export function closeRateSegment(entry, next, effectiveFrom): BrandRateEntry

// Qual taxa valia nesta data? Sem data → a atual (idêntico ao de hoje).
export function ratesOn(entry, date?): BrandRates

// Fatia um range pelas fronteiras de vigência, p/ o consumidor somar por janela.
export function splitRangeByRate(entry, from, to): { from, to, rates }[]
```

E em `commission.ts`, ao lado de `resolveBrandRates` (para ninguém achar que são
fontes concorrentes):

```ts
export function resolveBrandRatesAt(config, brandId?, date?): BrandRates
```

Sem `date`, é `resolveBrandRates` byte a byte. É o que garante que ligar isso não
mexe em nada até alguém passar uma data.

## 5. Limitação declarada: agregado OTG

Uma linha de resultado OTG agregada sobre um range não carrega dia, então não há
onde aplicar a janela. Nessas linhas a taxa ATUAL continua valendo, como hoje.

Isso **não afeta a Infinity**, que é OTG-free e apura 100% em `house_results`
datado. Afeta a instância nº 0 e qualquer futura que use OTG, e nelas o
comportamento fica igual ao de hoje. A alternativa (paginar `results` por
sub-range e somar) é possível e cara; fica registrada aqui, não implementada.

**Regra para não mentir na tela:** quando um afiliado tem histórico de taxa numa
casa cuja produção é OTG agregada, a apuração daquele range usa a taxa atual.
Se essa combinação aparecer, ela precisa de aviso, não de silêncio.

## 6. Fases

**F1 · Núcleo puro.** `rateHistory.ts` + `resolveBrandRatesAt` em
`commission.ts`, com testes: `ratesOn` sem data == `resolveBrandRates`;
segmento cortado no dia certo; range que atravessa duas taxas soma as duas;
config sem `history` idêntica a hoje; property test de que Σ das janelas ==
payout total quando a taxa não mudou.

**F2 · Escrita. ✅ ENTREGUE.** As QUATRO portas que gravam taxa passam pelo helper
único `withRateHistory` (admin no `/admin`, especial no `sub-config`, gerente na
precificação, aprovação de parceria). Sem porta única, uma delas sobrescreveria
enquanto as outras respeitam a vigência, e a divergência só apareceria no extrato
do afiliado. Reprecificar parceria APROVADA liberado via
`nextStatusAfterPricing`: ela continua aprovada, o link segue valendo, muda só a
taxa (mandá-la de volta para "aguardando link" seria errado, o link já existe).

**Duas armadilhas que os testes existentes pegaram**, ambas da família
"ausência ≠ R$ 0":
- Completar o par no chamador (`revPercentage: num(cur.revPercentage)`) gravava um
  **REV 0 fantasma** em quem só tinha CPA. A completação virou papel do núcleo,
  que preserva o campo ausente.
- `brandRateEntry` coagia a ausência para 0 via `num()`, o que fazia
  `isRateConfigured` responder `true` para afiliado sem config nenhuma. Agora só
  se aplica `num` na hora de CALCULAR (`ratesOn`); o dado guarda a ausência.

Daí duas regras que ficaram no núcleo: **primeira configuração não cria vigência**
(não há passado a proteger) e **o trecho congelado também não afirma zero** para
um campo que nunca existiu.

**F3 · Leitura da carteira. ✅ ENTREGUE.** É onde o cliente vê o efeito.

A peça que barateou tudo é **`projectConfigAt(config, dia)`**: em vez de ensinar
cada consumidor a somar por janela, entrega-se a ele a config COMO ELA ERA
naquele dia, e a conta que já existe continua valendo sem mudar de assinatura.
A receita para qualquer consumidor vira: `unionRateWindows` → uma busca por
janela → `projectConfigAt` → a função de sempre → soma.

Na carteira (`Financeiro.tsx`) a config passou a ser buscada ANTES dos
resultados, porque é ela que diz em quantos pedaços o período se divide. Sem
troca de taxa no período (o caso de todo o parque hoje) é UMA janela, ou seja,
uma busca só, exatamente como era. `computeNetPayoutWindows` (`tax.ts`) soma as
janelas e FUNDE as linhas por casa, para o detalhamento continuar sendo uma
linha por casa e não uma por casa×janela.

Detalhe que quase passou: o filtro de casa recorta DENTRO de cada janela. Achatar
as janelas antes de filtrar precificaria linha de julho com a taxa de agosto, que
é exatamente o que a vigência existe para impedir.

**F4 · Resto dos consumidores.** Dashboards, ranking, rede, extrato
(`exportExtract.ts`). Todos seguem a mesma receita de 4 passos acima. Vale medir
antes: se a divergência for só a cauda do dia da troca, talvez não valha tocar em
tudo de uma vez.

**F5 · Tela.** O gerente vê a vigência ao mudar a taxa ("vale a partir de
amanhã; o que já foi gerado fica a R$ 100") e o histórico da casa.

## 7. Confirmado com o cliente (16/08)

As três premissas foram levadas à equipe e confirmadas como fiéis ao desejo dela:

1. **"O que foi gerado antes" é por DIA.** A taxa nova vale a partir do dia
   seguinte à mudança (`scheduleRateChange`). O dia corrente fica com a taxa
   antiga porque a granularidade do dado é o dia: um FTD das 10h e outro das 16h
   caem no mesmo `house_results.date`, e não há como dizer qual veio antes da
   troca. Ficar com a antiga é a leitura conservadora e fiel.
2. **Não há mudança retroativa.** Vigência sempre para a frente;
   `closeRateSegment` recusa `effectiveFrom` dentro de trecho já fechado.
3. **A mesma regra vale para o admin.** Deixar só o gerente com vigência criaria
   dois comportamentos para o mesmo campo.
