// Cotação EUR→BRL p/ a comissão das casas. As casas nos informam o CPA em EUR
// (valor fixo). Em vez de regravar o valor em R$ toda vez que o câmbio mexe,
// GRAVAMOS o CPA em EUR (inteiro) e convertemos no PONTO DE USO pela cotação ao
// vivo da AwesomeAPI — assim a comissão acompanha o câmbio sozinha, sem update
// diário. Núcleo puro (eurToBrl/parseEurBrlRate) + um cache de módulo p/ a
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

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Formata um número em R$ pt-BR (ex.: 887 → "R$ 887,00"). num() guarda contra NaN.
export function formatBrl(v: number | null | undefined): string {
  return brl.format(num(v));
}
