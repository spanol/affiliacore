// Núcleo PURO de VIGÊNCIA DE TAXA — SEM Firebase, importável por client e server.
// Responde "que taxa valia no dia X" para que mudar a comissão de um afiliado NÃO
// reprecifique o que ele já gerou (pedido do cliente Infinity, 16/08/2026).
//
// Por que uma LINHA DO TEMPO e não um valor congelado por período: a carteira apura
// sobre um range escolhido pelo usuário, e um total congelado não se fatia. Como
// `calcAffiliatePayout` é LINEAR nas métricas, somar por janela de vigência fecha em
// qualquer recorte. Ver PLANO-COMISSAO-VIGENCIA.md §2.
//
// RETROCOMPATÍVEL POR CONSTRUÇÃO: a taxa ATUAL continua em `cpaValue`/`revPercentage`
// (é o que todo consumidor de hoje lê) e o passado vive em `history`. Entrada sem
// `history` se comporta exatamente como antes deste arquivo existir.

import { num, resolveBrandRates, type BrandRates, type AffiliateConfig } from './commission';

// Um trecho ENCERRADO da linha do tempo: a taxa valeu de `from` até `to`, inclusive
// nas duas pontas. Datas em 'YYYY-MM-DD' (a mesma granularidade de `house_results`,
// cujo doc id é `slug__date__afiliado` — não faz sentido ser mais fino que o dado).
export interface RateSegment extends BrandRates {
  from: string;
  to: string;
}

// A taxa de um afiliado numa casa: o valor vigente + os trechos já encerrados.
export interface BrandRateEntry extends BrandRates {
  since?: string;            // início da vigência ATUAL (ausente = "desde sempre")
  history?: RateSegment[];   // append-only, só o PASSADO
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Início convencional de um trecho cujo começo real é desconhecido: a config que
// nunca teve vigência valia "desde sempre". Ordena antes de qualquer data real.
export const EPOCH_DAY = '1970-01-01';

export function isDay(raw: any): boolean {
  return typeof raw === 'string' && DAY.test(raw);
}

// Aritmética de dia em UTC. Deliberadamente NÃO usa fuso: estas datas são rótulos
// de dia ('2026-08-16'), não instantes — passar por horário local faria o dia virar
// no lugar errado, que é a classe de bug que `resolveServerToday` já existe p/ evitar.
export function addDays(day: string, delta: number): string {
  if (!isDay(day)) return day;
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export const prevDay = (day: string) => addDays(day, -1);

// Ordena e descarta segmento malformado. Defensivo porque isto vem do Firestore.
function cleanHistory(history?: RateSegment[] | null): RateSegment[] {
  return (Array.isArray(history) ? history : [])
    .filter((s) => s && isDay(s.from) && isDay(s.to) && s.from <= s.to)
    .map((s) => ({ from: s.from, to: s.to, cpaValue: num(s.cpaValue), revPercentage: num(s.revPercentage) }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

function currentRates(entry?: BrandRateEntry | null): BrandRates {
  return { cpaValue: num(entry?.cpaValue), revPercentage: num(entry?.revPercentage) };
}

// QUE TAXA VALIA NESTE DIA. Sem `date`, devolve a atual — é o que garante que ligar
// a vigência não muda nada até alguém passar uma data.
// Data ANTERIOR a todo o histórico conhecido: cai no segmento mais antigo, não na
// taxa atual. Quem tem histórico começando em junho e recebe uma linha de maio
// estava, na prática, sob a taxa de junho; devolver a ATUAL seria justamente o
// efeito retroativo que este arquivo existe para impedir.
export function ratesOn(entry?: BrandRateEntry | null, date?: string): BrandRates {
  const current = currentRates(entry);
  if (!date || !isDay(date)) return current;
  const history = cleanHistory(entry?.history);
  if (history.length === 0) return current;
  const hit = history.find((s) => date >= s.from && date <= s.to);
  if (hit) return { cpaValue: hit.cpaValue, revPercentage: hit.revPercentage };
  const oldest = history[0];
  if (date < oldest.from) return { cpaValue: oldest.cpaValue, revPercentage: oldest.revPercentage };
  return current;
}

// CORTA o segmento: fecha a taxa vigente na véspera de `effectiveFrom` e promove a
// nova a atual. É a operação que a escrita de taxa passa a fazer no lugar de
// sobrescrever.
//
// Regras:
//  - Vigência é sempre PARA A FRENTE. `effectiveFrom` no passado reabriria o
//    problema que isto fecha, então é rejeitado (devolve a entrada intacta).
//  - Trocar por um valor IGUAL não corta segmento: evita poluir a linha do tempo
//    com ruído de quem salvou o formulário sem mudar nada.
//  - Duas trocas no MESMO dia não criam segmento de duração zero: a segunda apenas
//    substitui a taxa atual, porque nenhum dia correu sob a primeira.
export function closeRateSegment(
  entry: BrandRateEntry | null | undefined,
  next: BrandRates,
  effectiveFrom: string
): BrandRateEntry {
  const current = currentRates(entry);
  const wanted: BrandRates = { cpaValue: num(next?.cpaValue), revPercentage: num(next?.revPercentage) };
  const history = cleanHistory(entry?.history);
  if (!isDay(effectiveFrom)) return { ...(entry ?? {}), ...current };

  const last = history[history.length - 1];
  if (last && effectiveFrom <= last.to) return { ...(entry ?? {}), ...current, history };

  if (wanted.cpaValue === current.cpaValue && wanted.revPercentage === current.revPercentage) {
    return { ...(entry ?? {}), ...current, history };
  }

  // Desde quando a taxa ATUAL vale? Se a entrada não diz (é o caso de 100% do
  // parque hoje, que nunca teve vigência), o passado é desconhecido mas EXISTE: o
  // segmento nasce na época. Não registrar esse trecho seria justamente aplicar a
  // taxa nova ao passado, o efeito que este arquivo existe para impedir.
  const since = isDay(entry?.since) ? entry!.since!
    : last ? addDays(last.to, 1)
    : EPOCH_DAY;

  // Nenhum dia correu sob a taxa atual (mudou no mesmo dia em que ela passou a
  // valer): não há trecho a congelar, só troca.
  const nextHistory = since >= effectiveFrom
    ? history
    : [...history, { from: since, to: prevDay(effectiveFrom), cpaValue: current.cpaValue, revPercentage: current.revPercentage }];

  return { ...(entry ?? {}), ...wanted, since: effectiveFrom, history: nextHistory };
}

// Fatia [from, to] nas fronteiras de vigência, para o consumidor somar janela a
// janela. Fora de qualquer histórico devolve uma janela só com a taxa atual — que é
// o caminho de 100% do parque hoje.
export function splitRangeByRate(
  entry: BrandRateEntry | null | undefined,
  from: string,
  to: string
): { from: string; to: string; rates: BrandRates }[] {
  if (!isDay(from) || !isDay(to) || from > to) return [];
  const history = cleanHistory(entry?.history);
  if (history.length === 0) return [{ from, to, rates: currentRates(entry) }];

  // Fronteiras = início de cada segmento + início da vigência atual, recortadas ao
  // range pedido. Percorre por corte, nunca dia a dia: um range de um ano não pode
  // custar 365 iterações num cálculo de dinheiro.
  const cuts = new Set<string>([from]);
  for (const s of history) {
    if (s.from > from && s.from <= to) cuts.add(s.from);
    const after = addDays(s.to, 1);
    if (after > from && after <= to) cuts.add(after);
  }
  const starts = [...cuts].sort();
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? prevDay(starts[i + 1]) : to;
    return { from: start, to: end, rates: ratesOn(entry, start) };
  });
}

// A entrada de taxa de uma casa: o override de `byBrand[casa]` quando existe, senão
// o nível de TOPO da config (que também pode ter vigência). Mesma precedência de
// `resolveBrandRates` — a vigência não inventa uma segunda regra de resolução.
export function brandRateEntry(
  config?: AffiliateConfig | null,
  brandId?: string
): BrandRateEntry {
  const byBrand = (config as any)?.byBrand;
  const override = brandId && byBrand ? byBrand[brandId] : null;
  if (override) return override as BrandRateEntry;
  return {
    cpaValue: num(config?.cpaValue),
    revPercentage: num(config?.revPercentage),
    ...((config as any)?.history ? { history: (config as any).history } : {}),
    ...((config as any)?.since ? { since: (config as any).since } : {}),
  };
}

// IRMÃ DATADA de `resolveBrandRates` (commission.ts). SEM `date` ela devolve
// exatamente o mesmo — é o que garante que ligar a vigência não muda nada até
// alguém passar um dia. É a porta que os consumidores devem usar quando têm a data
// da linha em mãos (produção manual: `house_results.date`).
export function resolveBrandRatesAt(
  config?: AffiliateConfig | null,
  brandId?: string,
  date?: string
): BrandRates {
  if (!date || !isDay(date)) return resolveBrandRates(config, brandId);
  return ratesOn(brandRateEntry(config, brandId), date);
}
