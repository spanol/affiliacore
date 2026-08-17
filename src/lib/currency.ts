// Câmbio → BRL. As casas nos informam o CPA em moeda estrangeira (valor fixo).
// Em vez de regravar o valor em R$ toda vez que o câmbio mexe, GRAVAMOS o valor na
// MOEDA e convertemos no PONTO DE USO — assim a comissão acompanha o câmbio
// sozinha, sem update diário. Quem paga em REAL grava o R$ direto
// (`cpaCurrency: 'BRL'`) e pula a conversão.
//
// A COTAÇÃO tem DOIS regimes, escolha da agência (pedido Infinity, 17/08/2026):
//   - `live`  → cotação do dia, da AwesomeAPI (o que a casa já fazia com o euro);
//   - `fixed` → a cotação que a agência digitou no acordo/casa, imune ao mercado.
// `fixed` sem cotação digitada NÃO inventa taxa: `resolveFxRate` devolve null e
// quem chama recusa a gravação. Taxa chutada é dinheiro errado com cara de certo.
//
// Núcleo puro (resolveFxRate/toBrl/houseCpaToBrl/parseFxRates) + um cache de módulo
// p/ a conversão poder ser SÍNCRONA no cálculo de comissão sem martelar a API a cada
// render. Sem Firebase — importável por services/pages (NÃO pelo server.ts).
import { num } from './commission';

// Endpoint público (sem chave) da AwesomeAPI. Uma chamada traz as duas moedas:
// { USDBRL: { bid, ask, ... }, EURBRL: { ... } }.
const FX_URL = 'https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL';

// Cotação de segurança enquanto o 1º fetch não resolve / quando a API falha. É só
// piso — o valor real vem da AwesomeAPI assim que a tela carrega.
export const FALLBACK_EUR_BRL = 6;
export const FALLBACK_USD_BRL = 5.5;

// Cotação não precisa de granularidade fina; 30 min evita martelar a API.
const TTL_MS = 30 * 60 * 1000;

export interface EurBrlQuote {
  rate: number;       // R$ por 1 EUR (bid)
  live: boolean;      // true se já houve um fetch bem-sucedido (senão é o fallback)
  fetchedAt: number;  // epoch ms do último fetch ok (0 = nunca)
}

/** Moedas em que um acordo/casa pode ser fechado. BRL é a moeda do cálculo. */
export type MoneyCurrency = 'BRL' | 'USD' | 'EUR';
export const MONEY_CURRENCIES: MoneyCurrency[] = ['BRL', 'USD', 'EUR'];
/** Moedas que precisam de cotação (tudo menos a moeda de casa, o real). */
export type ForeignCurrency = Exclude<MoneyCurrency, 'BRL'>;
export const FOREIGN_CURRENCIES: ForeignCurrency[] = ['USD', 'EUR'];

export const CURRENCY_LABEL: Record<MoneyCurrency, string> = {
  BRL: 'Real', USD: 'Dólar', EUR: 'Euro',
};
export const CURRENCY_SYMBOL: Record<MoneyCurrency, string> = {
  BRL: 'R$', USD: 'US$', EUR: '€',
};

/** Cotações vivas, uma por moeda estrangeira. O real não entra: vale sempre 1. */
export type FxQuotes = Record<ForeignCurrency, EurBrlQuote>;

let cachedQuotes: FxQuotes = {
  EUR: { rate: FALLBACK_EUR_BRL, live: false, fetchedAt: 0 },
  USD: { rate: FALLBACK_USD_BRL, live: false, fetchedAt: 0 },
};
// Frescor é da RODADA, não de cada moeda: uma resposta que só trouxe o euro não
// pode fazer o dólar parecer vencido e disparar um fetch por render.
let lastFetchAt = 0;
let lastFetchOk = false;
let inflight: Promise<FxQuotes> | null = null;

// Converte um valor em EUR p/ BRL pela cotação dada. Puro; num() guarda contra
// NaN/null/objeto antes de multiplicar (nunca propaga NaN ao dinheiro).
export function eurToBrl(eur: number | null | undefined, rate: number): number {
  return num(eur) * num(rate);
}

// Extrai a cotação (bid) de UMA moeda na resposta da AwesomeAPI. Puro e tolerante:
// devolve null quando a forma não bate, p/ o chamador manter o último valor.
export function parseFxRate(payload: any, currency: ForeignCurrency): number | null {
  const key = `${currency}BRL`;
  const node = payload?.[key]
    ?? (Array.isArray(payload) ? payload.find((x: any) => String(x?.code) === currency) : null);
  const bid = Number(node?.bid ?? node?.ask ?? node?.high);
  return Number.isFinite(bid) && bid > 0 ? bid : null;
}

/** Compat: a resposta só-euro que o ranking do servidor consome. */
export function parseEurBrlRate(payload: any): number | null {
  const legacy = payload?.EURBRL ?? (Array.isArray(payload) ? payload[0] : null);
  const bid = Number(legacy?.bid ?? legacy?.ask ?? legacy?.high);
  return Number.isFinite(bid) && bid > 0 ? bid : null;
}

/** Cotações em cache (síncrono) — é o que o cálculo de comissão consome. */
export function getCachedFxQuotes(): FxQuotes {
  return cachedQuotes;
}

// Último valor conhecido (síncrono) — usado no cálculo de comissão. Fallback até
// o primeiro fetch resolver.
export function getCachedEurBrlRate(): number {
  return cachedQuotes.EUR.rate;
}

// Cotação completa em cache (p/ a UI mostrar "ao vivo" vs. fallback).
export function getCachedEurBrlQuote(): EurBrlQuote {
  return cachedQuotes.EUR;
}

// Busca as cotações na AwesomeAPI com cache/TTL e dedupe de chamadas concorrentes.
// NUNCA lança: em erro mantém/retorna os últimos valores (ou os fallbacks). Moeda
// que não veio na resposta preserva o valor anterior em vez de zerar.
export async function fetchFxQuotes(force = false): Promise<FxQuotes> {
  const fresh = lastFetchOk && Date.now() - lastFetchAt < TTL_MS;
  if (!force && fresh) return cachedQuotes;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(FX_URL, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`AwesomeAPI ${res.status}`);
      const payload = await res.json();
      const now = Date.now();
      const next = { ...cachedQuotes };
      for (const code of FOREIGN_CURRENCIES) {
        const rate = parseFxRate(payload, code);
        if (rate != null) next[code] = { rate, live: true, fetchedAt: now };
      }
      cachedQuotes = next;
      lastFetchAt = now;
      lastFetchOk = true;
      return cachedQuotes;
    } catch {
      return cachedQuotes; // mantém o último/fallback — sem quebrar a tela
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Compat: quem só precisa do euro (o preview do /casas, o AdminDashboard). */
export async function fetchEurBrlRate(force = false): Promise<EurBrlQuote> {
  return (await fetchFxQuotes(force)).EUR;
}

// --- Regime de cotação (escolha da agência) ----------------------------------
// `live`  = cotação do dia (AwesomeAPI). `fixed` = a que a agência digitou.
// `none`  = não converte: o número JÁ está em reais. Existe para o dado LEGADO do
// acordo, cuja moeda era só etiqueta (o valor ia cru para o `byBrand`); ler um
// acordo antigo como conversível multiplicaria a comissão de alguém por 6 sem
// ninguém ter pedido.
export type FxMode = 'live' | 'fixed' | 'none';

const FX_MODES: FxMode[] = ['live', 'fixed', 'none'];

/**
 * Regime de cotação de um doc. O DEFAULT é do chamador de propósito, porque os dois
 * lados têm histórias opostas: a CASA sempre converteu ao vivo (default `live`,
 * nada muda de sentido) e o ACORDO nunca converteu (default `none`).
 */
export function resolveFxMode(v: unknown, fallback: FxMode = 'live'): FxMode {
  const s = String(v ?? '').trim().toLowerCase();
  return (FX_MODES as string[]).includes(s) ? (s as FxMode) : fallback;
}

/** Moeda de um doc. Valor desconhecido cai no fallback do chamador. */
export function resolveMoneyCurrency(v: unknown, fallback: MoneyCurrency = 'BRL'): MoneyCurrency {
  const s = String(v ?? '').trim().toUpperCase();
  return (MONEY_CURRENCIES as string[]).includes(s) ? (s as MoneyCurrency) : fallback;
}

/** O que um acordo/casa guarda sobre câmbio. */
export interface FxSpec {
  currency: MoneyCurrency;
  fxMode: FxMode;
  fxRate?: number | null; // R$ por 1 unidade da moeda; só vale no modo `fixed`
}

/**
 * R$ por 1 unidade da moeda do doc, ou `null` quando não dá para saber.
 *
 * `null` NÃO é "1": é a recusa de inventar cotação. Acontece no modo `fixed` sem
 * cotação digitada, e quem chama tem que barrar a gravação em vez de gravar um
 * valor que parece certo na tela e está errado no extrato.
 */
export function resolveFxRate(spec: FxSpec, quotes: FxQuotes = cachedQuotes): number | null {
  if (spec?.currency === 'BRL') return 1;
  if (spec?.fxMode === 'none') return 1; // o número já está em reais (leitura legada)
  if (spec?.fxMode === 'fixed') {
    const fixed = num(spec?.fxRate);
    return fixed > 0 ? fixed : null;
  }
  const quote = quotes?.[spec?.currency as ForeignCurrency];
  const live = num(quote?.rate);
  return live > 0 ? live : null;
}

/**
 * Valor do doc convertido para R$, ou `null` quando falta cotação.
 *
 * ARREDONDA a centavos porque o resultado é DINHEIRO: 45 × 5,4 dá
 * 243.00000000000003 em ponto flutuante, e esse número ia gravado na taxa do
 * afiliado (visto na verificação de 17/08). Centavo é a menor unidade que existe
 * do outro lado; o resto é lixo que se propaga por toda soma.
 */
export function toBrl(
  value: number | null | undefined,
  spec: FxSpec,
  quotes: FxQuotes = cachedQuotes
): number | null {
  const rate = resolveFxRate(spec, quotes);
  if (rate == null) return null;
  return Math.round(num(value) * rate * 100) / 100;
}

/**
 * Valida o par (regime, cotação) na GRAVAÇÃO e devolve a cotação a gravar.
 *
 * É aqui que "fixa sem cotação" é barrada, do lado do servidor: deixar passar
 * gravaria um acordo/casa cujo valor não converte, e o erro só apareceria depois,
 * como dinheiro faltando. Em real a cotação não existe (vale 1) e vai a `null` em
 * vez de um número morto no doc.
 */
export function normalizeFxInput(
  currency: MoneyCurrency,
  fxMode: FxMode,
  rawRate: unknown
): { fxRate: number | null } | { error: string } {
  if (currency === 'BRL' || fxMode !== 'fixed') return { fxRate: null };
  const rate = num(rawRate);
  if (!(rate > 0)) {
    return { error: `Informe a cotação fixa (R$ por 1 ${CURRENCY_SYMBOL[currency]}) ou use a cotação do dia.` };
  }
  return { fxRate: rate };
}

/**
 * Formata na moeda do doc ("US$ 100,00", "€ 30,00", "R$ 120,00").
 *
 * O espaço do Intl é NBSP; normalizamos para o espaço comum porque o resto do app
 * escreve "R$ 110,00" com espaço normal, e duas grafias do mesmo valor viram
 * comparação quebrada em teste e busca que não acha na tela.
 */
export function formatMoney(v: number | null | undefined, currency: MoneyCurrency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: resolveMoneyCurrency(currency),
  }).format(num(v)).replace(/[  ]/g, ' ');
}

// --- Moeda do CPA da casa ----------------------------------------------------
// A casa pode nos pagar em EURO (convenção original: valor fixo em €, convertido
// no ponto de uso) OU em REAL (casas BR — Esportiva/Superbet — que fecham em R$).
// Forçar tudo a euro impedia gravar o valor EXATO acordado em R$: o operador tinha
// que escolher um € inteiro cuja conversão só se APROXIMA do acordo, e o valor
// ainda balançava com o câmbio. Com 'BRL' o número gravado é o próprio R$.
export type HouseCpaCurrency = MoneyCurrency;

// AUSÊNCIA = EUR: todo `defaultCpa` gravado antes desta opção está em euro, então
// o default nunca pode reinterpretar dado histórico. Só o valor explícito ('BRL',
// 'USD', em qualquer caixa) tira a casa do euro.
export function resolveCpaCurrency(v: unknown): HouseCpaCurrency {
  return resolveMoneyCurrency(v, 'EUR');
}

/** O que a casa guarda sobre câmbio (campos opcionais: doc antigo não os tem). */
export interface HouseFxFields {
  cpaCurrency?: unknown;
  fxMode?: unknown;
  fxRate?: number | null;
}

/** FxSpec de uma casa. Default `live`: é o que a casa em euro sempre fez. */
export function houseFxSpec(house: HouseFxFields | null | undefined): FxSpec {
  return {
    currency: resolveCpaCurrency(house?.cpaCurrency),
    fxMode: resolveFxMode(house?.fxMode, 'live'),
    fxRate: house?.fxRate ?? null,
  };
}

// CPA da casa em R$, seja qual for a moeda em que ela paga. Fonte ÚNICA da
// conversão do CPA da casa: moeda estrangeira passa pela cotação (ao vivo ou fixa);
// BRL é o valor exato. Puro — num() guarda contra NaN/null/objeto.
//
// Cotação ausente (modo fixo sem valor) devolve 0 e NÃO o valor cru: um CPA de
// "US$ 100" lido como R$ 100 é um erro silencioso de 5x no lucro da agência, e
// zero aparece na tela como problema a resolver. A gravação já barra esse estado.
export function houseCpaToBrl(
  cpa: number | null | undefined,
  house: HouseFxFields | null | undefined,
  quotes: FxQuotes = cachedQuotes
): number {
  return toBrl(cpa, houseFxSpec(house), quotes) ?? 0;
}

// Lê o que o operador digitou num campo de dinheiro e devolve o número a GRAVAR
// (na moeda escolhida) ou null p/ campo vazio — ausência ≠ R$0, então texto
// vazio/inválido NUNCA vira 0. Em EUR o valor é inteiro (convenção das casas, que
// informam o CPA em euro cheio); em BRL e USD aceita centavos, que é o motivo de a
// moeda existir: gravar o valor EXATO do acordo. Aceita vírgula pt-BR — o `num()`
// da comissão só entende ponto, então a normalização acontece AQUI.
export function parseHouseCpaInput(
  text: string,
  currency: HouseCpaCurrency
): number | null {
  const raw = String(text ?? '').trim();
  if (raw === '') return null;
  // O ÚLTIMO separador é o decimal; os anteriores são de milhar ("1.234,50" →
  // 1234.5). Trocar só a 1ª vírgula deixava "1,234,50" virar NaN → null → o
  // servidor apagava o CPA da casa em silêncio, em vez de recusar a digitação.
  const lastSep = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('.'));
  const clean = lastSep < 0
    ? raw
    : raw.slice(0, lastSep).replace(/[.,]/g, '') + '.' + raw.slice(lastSep + 1);
  const n = Number(clean);
  if (!Number.isFinite(n) || n < 0) return null;
  return currency === 'EUR' ? Math.trunc(n) : Math.round(n * 100) / 100;
}

// Converte o valor JÁ DIGITADO ao trocar a moeda do campo, preservando o R$
// efetivo (30 € ↔ R$ 177 na cotação 5,9). Sem isto, virar "EUR → BRL" num valor
// antigo passaria a ler 30 como R$ 30 e derrubaria a comissão da casa em silêncio.
// Cada lado usa a cotação do SEU regime (a fixa do doc, ou a do dia), que é a mesma
// que o cálculo vai usar depois. Devolve texto p/ o input, '' quando não há valor.
export function convertHouseCpaInput(
  text: string,
  from: FxSpec,
  to: FxSpec,
  quotes: FxQuotes = cachedQuotes
): string {
  const value = parseHouseCpaInput(text, from.currency);
  // Texto que não parseia (um "," no meio da digitação) volta COMO ESTÁ: apagar o
  // campo sozinho seria perder o CPA da casa por causa de um caractere.
  if (value == null) return String(text ?? '').trim() === '' ? '' : String(text);
  if (from.currency === to.currency) return String(value);
  const fromRate = resolveFxRate(from, quotes);
  const toRate = resolveFxRate(to, quotes);
  // Sem cotação de um dos lados não inventa conversão: mantém o número digitado.
  if (fromRate == null || toRate == null || fromRate <= 0 || toRate <= 0) return String(value);
  const converted = (value * fromRate) / toRate;
  // Piso de 1 € p/ valor positivo: o euro é INTEIRO, e arredondar um CPA baixo
  // (R$ 3 ÷ 5,9) daria 0 — que NÃO é ausência, é um zero CONFIGURADO, e zeraria a
  // comissão derivada da casa (ausência ≠ R$0).
  if (to.currency === 'EUR') return String(Math.max(value > 0 ? 1 : 0, Math.round(converted)));
  // ARREDONDA (não trunca, como faz a digitação em euro): R$ 177 ÷ 5,9 dá 29,99…,
  // e truncar devolveria 29 — a ida-e-volta da moeda comeria um euro do CPA.
  return String(Math.round(converted * 100) / 100);
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Formata um número em R$ pt-BR (ex.: 887 → "R$ 887,00"). num() guarda contra NaN.
export function formatBrl(v: number | null | undefined): string {
  return brl.format(num(v));
}
