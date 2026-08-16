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

**F2 · Escrita.** A rota de precificação (`POST /api/partnerships/:id/price`) e o
`PATCH /api/affiliate-configs` do admin passam a cortar o segmento em vez de
sobrescrever. Libera `canTransition('approved', 'priced')`, que hoje está
bloqueado justamente por isso. Auditoria registra o segmento fechado.

**F3 · Leitura.** Carteira e extrato somam por janela
(`splitRangeByRate`). É onde o cliente vê o efeito.

**F4 · Resto dos consumidores.** Dashboards, ranking, rede. Aqui vale medir: se
a divergência for só a cauda do dia da troca, talvez não valha tocar em tudo de
uma vez.

**F5 · Tela.** O gerente vê a vigência ao mudar a taxa ("vale a partir de
amanhã; o que já foi gerado fica a R$ 100") e o histórico da casa.

## 7. Em aberto com o cliente

1. **"O que foi gerado antes" é por DIA ou por ciclo de pagamento fechado?** O
   plano assume dia (a taxa nova vale a partir do dia seguinte à mudança), que é
   o mais fiel à frase dele e o mais fino que o dado permite. Se for por ciclo
   (a taxa nova só vale no próximo fechamento semanal/mensal), muda o cálculo do
   `effectiveFrom` e nada mais.
2. **O gerente pode mudar a taxa retroativamente?** O plano diz não: vigência
   sempre para a frente. Retroativo reabriria o problema que ele quer fechar.
3. **A mesma regra vale para o admin?** O plano diz sim: a taxa do admin no
   `/admin` passa a ter vigência também. Deixar só o gerente com vigência criaria
   dois comportamentos para o mesmo campo.
