// Cotação EUR→BRL p/ a comissão das casas. As casas nos informam o CPA em EUR
// (valor fixo). Em vez de regravar o valor em R$ toda vez que o câmbio mexe,
// GRAVAMOS o CPA em EUR (inteiro) e convertemos no PONTO DE USO pela cotação ao
// vivo da AwesomeAPI — assim a comissão acompanha o câmbio sozinha, sem update
// diário. Casa que paga em REAL grava o R$ direto (`cpaCurrency: 'BRL'`) e pula a
// conversão — ver houseCpaToBrl no fim do arquivo.
// Núcleo puro (eurToBrl/houseCpaToBrl/parseEurBrlRate) + um cache de módulo p/ a
// conversão poder ser SÍNCRONA no cálculo de comissão sem martelar a API a cada
// render. Sem Firebase — importável por services/pages (NÃO pelo server.ts).
import { num } from './commission';

// Endpoint público (sem chave) da AwesomeAPI. Resposta: { EURBRL: { bid, ask, ... } }.
const EUR_BRL_URL = 'https://economia.awesomeapi.com.br/last/EUR-BRL';

// Cotação de segurança enquanto o 1º fetch não resolve / quando a API falha. É só
// piso — o valor real vem da AwesomeAPI assim que a tela carrega.
export const FALLBACK_EUR_BRL = 6;

// Cotação não precisa de granularidade fina; 30 min evita martelar a API.
const TTL_MS = 30 * 60 * 1000;

export interface EurBrlQuote {
  rate: number;       // R$ por 1 EUR (bid)
  live: boolean;      // true se já houve um fetch bem-sucedido (senão é o fallback)
  fetchedAt: number;  // epoch ms do último fetch ok (0 = nunca)
}

let cached: EurBrlQuote = { rate: FALLBACK_EUR_BRL, live: false, fetchedAt: 0 };
let inflight: Promise<EurBrlQuote> | null = null;

// Converte um valor em EUR p/ BRL pela cotação dada. Puro; num() guarda contra
// NaN/null/objeto antes de multiplicar (nunca propaga NaN ao dinheiro).
export function eurToBrl(eur: number | null | undefined, rate: number): number {
  return num(eur) * num(rate);
}

// Extrai a cotação (bid) da resposta da AwesomeAPI. Puro e tolerante: devolve null
// quando a forma não bate, p/ o chamador manter o último valor / o fallback.
export function parseEurBrlRate(payload: any): number | null {
  const node = payload?.EURBRL ?? (Array.isArray(payload) ? payload[0] : null);
  const bid = Number(node?.bid ?? node?.ask ?? node?.high);
  return Number.isFinite(bid) && bid > 0 ? bid : null;
}

// Último valor conhecido (síncrono) — usado no cálculo de comissão. Fallback até
// o primeiro fetch resolver.
export function getCachedEurBrlRate(): number {
  return cached.rate;
}

// Cotação completa em cache (p/ a UI mostrar "ao vivo" vs. fallback).
export function getCachedEurBrlQuote(): EurBrlQuote {
  return cached;
}

// Busca a cotação na AwesomeAPI com cache/TTL e dedupe de chamadas concorrentes.
// NUNCA lança: em erro mantém/retorna o último valor (ou o fallback).
export async function fetchEurBrlRate(force = false): Promise<EurBrlQuote> {
  const fresh = cached.live && Date.now() - cached.fetchedAt < TTL_MS;
  if (!force && fresh) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(EUR_BRL_URL, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`AwesomeAPI ${res.status}`);
      const rate = parseEurBrlRate(await res.json());
      if (rate != null) cached = { rate, live: true, fetchedAt: Date.now() };
      return cached;
    } catch {
      return cached; // mantém o último/fallback — sem quebrar a tela
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// --- Moeda do CPA da casa ----------------------------------------------------
// A casa pode nos pagar em EURO (convenção original: valor fixo em €, convertido
// no ponto de uso) OU em REAL (casas BR — Esportiva/Superbet — que fecham em R$).
// Forçar tudo a euro impedia gravar o valor EXATO acordado em R$: o operador tinha
// que escolher um € inteiro cuja conversão só se APROXIMA do acordo, e o valor
// ainda balançava com o câmbio. Com 'BRL' o número gravado é o próprio R$.
export type HouseCpaCurrency = 'EUR' | 'BRL';

// AUSÊNCIA = EUR: todo `defaultCpa` gravado antes desta opção está em euro, então
// o default nunca pode reinterpretar dado histórico. Só o valor explícito 'BRL'
// (em qualquer caixa) tira a casa da conversão.
export function resolveCpaCurrency(v: unknown): HouseCpaCurrency {
  return String(v ?? '').trim().toUpperCase() === 'BRL' ? 'BRL' : 'EUR';
}

// CPA da casa em R$, seja qual for a moeda em que ela paga. Fonte ÚNICA da
// conversão do CPA: EUR passa pela cotação; BRL é o valor exato (não converte).
// Puro — num() guarda contra NaN/null/objeto antes de multiplicar.
export function houseCpaToBrl(
  cpa: number | null | undefined,
  currency: unknown,
  eurBrlRate: number
): number {
  return resolveCpaCurrency(currency) === 'BRL' ? num(cpa) : eurToBrl(cpa, eurBrlRate);
}

// Lê o que o operador digitou no campo de CPA do /casas e devolve o número a
// GRAVAR (na moeda escolhida) ou null p/ campo vazio — ausência ≠ R$0, então
// texto vazio/inválido NUNCA vira 0. Em EUR o valor é inteiro (convenção da
// casa, que informa o CPA em euro cheio); em BRL aceita centavos, que é o motivo
// de a moeda existir: gravar o valor EXATO do acordo. Aceita vírgula pt-BR — o
// `num()` da comissão só entende ponto, então a normalização acontece AQUI.
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
  return currency === 'BRL' ? Math.round(n * 100) / 100 : Math.trunc(n);
}

// Converte o valor JÁ DIGITADO ao trocar a moeda do campo, preservando o R$
// efetivo (30 € ↔ R$ 177 na cotação 5,9). Sem isto, virar "EUR → BRL" num valor
// antigo passaria a ler 30 como R$ 30 e derrubaria a comissão da casa em silêncio.
// Devolve texto p/ o input (ponto como separador), '' quando não há valor.
export function convertHouseCpaInput(
  text: string,
  from: HouseCpaCurrency,
  to: HouseCpaCurrency,
  eurBrlRate: number
): string {
  const value = parseHouseCpaInput(text, from);
  // Texto que não parseia (um "," no meio da digitação) volta COMO ESTÁ: apagar o
  // campo sozinho seria perder o CPA da casa por causa de um caractere.
  if (value == null) return String(text ?? '').trim() === '' ? '' : String(text);
  if (from === to) return String(value);
  const rate = num(eurBrlRate);
  if (rate <= 0) return String(value); // sem cotação, não inventa conversão
  const converted = to === 'BRL' ? value * rate : value / rate;
  // ARREDONDA (não trunca, como faz a digitação em euro): R$ 177 ÷ 5,9 dá 29,99…,
  // e truncar devolveria 29 — a ida-e-volta da moeda comeria um euro do CPA.
  if (to === 'BRL') return String(Math.round(converted * 100) / 100);
  // Piso de 1 € p/ valor positivo: o euro é inteiro, e arredondar um CPA baixo
  // (R$ 3 ÷ 5,9) daria 0 — que NÃO é ausência, é um zero CONFIGURADO, e zeraria a
  // comissão derivada da casa (ausência ≠ R$0).
  return String(Math.max(value > 0 ? 1 : 0, Math.round(converted)));
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Formata um número em R$ pt-BR (ex.: 887 → "R$ 887,00"). num() guarda contra NaN.
export function formatBrl(v: number | null | undefined): string {
  return brl.format(num(v));
}
