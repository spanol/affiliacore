// ISS retido no repasse ao afiliado — POR CASA.
//
// O que o afiliado recebe não é o repasse bruto: a agência retém ISS sobre ele e
// paga o líquido. E a alíquota **varia por casa** (no legado da Infinity: 5% na
// Super Bet V2, 2% na Stake, 2% na Esportiva) — não é constante do sistema, então
// não existe "o ISS da instância". Um percentual global daria número errado no
// extrato de quem produz em mais de uma casa.
//
// Núcleo PURO e sem Firebase, como `commission.ts`: o servidor também precisa
// dele (extrato/saque) e não pode importar `services/affiliateService`.
//
// ⚠️ AUSÊNCIA DE ALÍQUOTA = SEM RETENÇÃO (0%), de propósito. Inventar uma
// dedução que o admin não configurou tiraria dinheiro do afiliado em silêncio.
// É o oposto da regra de comissão ("ausência ≠ R$ 0") justamente porque aqui o
// default seguro é não descontar. A tela de casas sinaliza quem está sem
// alíquota definida para o admin decidir.

import { num, calcAffiliatePayout, type AffiliateConfig } from './commission';

export const ISS_MAX_PERCENT = 100;

export interface IssHouse {
  id?: string | null; // brandId da OTG, quando houver
  slug?: string | null;
  issPercent?: number | null;
}

/** Alíquota saneada da casa, em PERCENTUAL (5 = 5%). Fora da faixa/ausente → 0. */
export function resolveIssPercent(house: IssHouse | null | undefined): number {
  const pct = num(house?.issPercent);
  if (!(pct > 0)) return 0;
  return Math.min(pct, ISS_MAX_PERCENT);
}

/**
 * Mapa chave-de-marca -> alíquota. A chave segue a MESMA convenção do resto do
 * app (`brandKeyOf`: brandId da OTG quando existe, senão o slug da casa manual),
 * e ambas são indexadas quando existem — a linha de resultado pode vir por
 * qualquer uma das duas.
 */
export function issRateMap(houses: IssHouse[] | null | undefined): Record<string, number> {
  const map: Record<string, number> = {};
  for (const house of Array.isArray(houses) ? houses : []) {
    const pct = resolveIssPercent(house);
    if (!pct) continue;
    for (const key of [house?.id, house?.slug]) {
      const k = String(key ?? '').trim();
      if (k) map[k] = pct;
    }
  }
  return map;
}

// Arredondamento em CENTAVOS. Cada casa é uma linha do extrato (e do documento
// fiscal), então o ISS é arredondado POR CASA e o total é a soma das linhas
// arredondadas — assim o total exibido é sempre igual à soma do que está à
// vista. Somar antes e arredondar depois criaria divergência de centavo entre o
// cabeçalho e o detalhamento.
const cents = (v: number): number => Math.round((num(v) + Number.EPSILON) * 100) / 100;

export interface NetLine {
  brandKey: string;
  gross: number; // repasse bruto do afiliado naquela casa
  issPercent: number;
  iss: number; // valor retido
  net: number; // o que o afiliado recebe
}

export interface NetPayout {
  lines: NetLine[];
  gross: number;
  iss: number;
  net: number;
}

/**
 * Repasse LÍQUIDO do afiliado a partir do breakdown POR CASA.
 *
 * `rows` é o retorno de `fetchAffiliateResultsByBrand` (que já funde OTG + casas
 * manuais); cada linha traz a chave da marca em `id`. O bruto sai de
 * `calcAffiliatePayout` com o `brandId` — nunca reimplementado aqui — de modo que
 * a taxa `byBrand` do afiliado continua valendo. Casa sem alíquota entra com
 * ISS 0 e `net === gross`.
 */
export function computeNetPayout(
  rows: any[] | null | undefined,
  config: AffiliateConfig | null | undefined,
  issByBrand: Record<string, number> | null | undefined,
): NetPayout {
  const lines: NetLine[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const brandKey = String(row?.id ?? '').trim();
    const gross = cents(calcAffiliatePayout(row, config, brandKey));
    const issPercent = Math.min(num(issByBrand?.[brandKey]), ISS_MAX_PERCENT);
    // Retenção só faz sentido sobre valor positivo. Repasse zerado (ou negativo,
    // que o RevShare negativo de algumas casas produz) não gera imposto a reter.
    const iss = gross > 0 && issPercent > 0 ? cents((gross * issPercent) / 100) : 0;
    lines.push({ brandKey, gross, issPercent, iss, net: cents(gross - iss) });
  }
  const gross = cents(lines.reduce((s, l) => s + l.gross, 0));
  const iss = cents(lines.reduce((s, l) => s + l.iss, 0));
  return { lines, gross, iss, net: cents(gross - iss) };
}

/** Casas ativas sem alíquota definida — a tela avisa o admin em vez de assumir. */
export function housesMissingIss<T extends IssHouse & { active?: boolean; name?: string }>(
  houses: T[] | null | undefined,
): T[] {
  return (Array.isArray(houses) ? houses : []).filter((h) => h?.active !== false && !resolveIssPercent(h));
}
