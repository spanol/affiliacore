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
// AUSÊNCIA ≠ R$ 0 vale também DENTRO do trecho congelado: se o afiliado nunca teve
// REV, o trecho não pode afirmar que o REV dele era 0. Por isso as duas taxas são
// OPCIONAIS aqui e só viram número na hora de calcular (`num`, em `ratesOn`).
export interface RateSegment extends Partial<BrandRates> {
  from: string;
  to: string;
}

// A taxa de um afiliado numa casa: o valor vigente + os trechos já encerrados.
export interface BrandRateEntry extends Partial<BrandRates> {
  since?: string;            // início da vigência ATUAL (ausente = "desde sempre")
  history?: RateSegment[];   // append-only, só o PASSADO
}

// Descarta chave ausente em vez de gravar `undefined`: o Firestore recusa undefined,
// e um `revPercentage: undefined` no doc seria lido como campo EXISTENTE por
// `'revPercentage' in cfg`, ressuscitando o zero fantasma pela porta dos fundos.
function definedOnly<T extends Record<string, any>>(o: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
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
    .map((s) => ({ from: s.from, to: s.to, ...definedOnly({ cpaValue: s.cpaValue, revPercentage: s.revPercentage }) }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

function currentRates(entry?: BrandRateEntry | null): BrandRates {
  return { cpaValue: num(entry?.cpaValue), revPercentage: num(entry?.revPercentage) };
}

// AUSÊNCIA ≠ R$ 0. Uma entrada sem NENHUMA das duas taxas nunca foi configurada:
// não há passado a preservar, e inventar um trecho `{cpa: 0}` afirmaria que a taxa
// dele já foi zero — o mesmo engano que `rateStatus` existe para evitar. Quem chega
// aqui sem taxa anterior está configurando pela PRIMEIRA vez, o que não é mudança.
export function isRateConfigured(entry?: BrandRateEntry | null): boolean {
  return typeof entry?.cpaValue === 'number' || typeof entry?.revPercentage === 'number';
}

// QUE TAXA VALIA NESTE DIA. Sem `date`, devolve a atual — é o que garante que ligar
// a vigência não muda nada até alguém passar uma data.
// Data ANTERIOR a todo o histórico conhecido: cai no segmento mais antigo, não na
// taxa atual. Quem tem histórico começando em junho e recebe uma linha de maio
// estava, na prática, sob a taxa de junho; devolver a ATUAL seria justamente o
// efeito retroativo que este arquivo existe para impedir.
export function ratesOn(entry?: BrandRateEntry | null, date?: string): BrandRates {
  const raw = rawRatesOn(entry, date);
  // `num` só AQUI, na hora de calcular: o dado guarda a ausência, o cálculo a trata
  // como zero. Os dois comportamentos convivem sem se contaminar.
  return { cpaValue: num(raw.cpaValue), revPercentage: num(raw.revPercentage) };
}

// A mesma busca, devolvendo os valores CRUS (com a ausência preservada). Interna
// porque quem calcula quer número; quem PROJETA a config precisa da ausência.
function rawRatesOn(entry?: BrandRateEntry | null, date?: string): Partial<BrandRates> {
  const current = definedOnly({ cpaValue: entry?.cpaValue, revPercentage: entry?.revPercentage });
  if (!date || !isDay(date)) return current;
  const history = cleanHistory(entry?.history);
  if (history.length === 0) return current;
  const hit = history.find((s) => date >= s.from && date <= s.to);
  if (hit) return definedOnly({ cpaValue: hit.cpaValue, revPercentage: hit.revPercentage });
  const oldest = history[0];
  if (date < oldest.from) return definedOnly({ cpaValue: oldest.cpaValue, revPercentage: oldest.revPercentage });
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
  next: Partial<BrandRates>,
  effectiveFrom: string
): BrandRateEntry {
  if (!isDay(effectiveFrom)) return { ...(entry ?? {}) };
  const history = cleanHistory(entry?.history);

  // A taxa nova é o que veio POR CIMA do que já valia. Completar o par é papel deste
  // núcleo, não do chamador: um campo que nunca foi configurado e não veio agora
  // CONTINUA ausente. Completar com 0 lá fora foi o que criou o zero fantasma.
  const pick = (k: 'cpaValue' | 'revPercentage'): number | undefined =>
    next && next[k] != null ? num(next[k])
      : typeof entry?.[k] === 'number' ? entry[k]
        : undefined;
  const wanted = definedOnly({ cpaValue: pick('cpaValue'), revPercentage: pick('revPercentage') });

  // Primeira configuração: não há passado a proteger, então grava a taxa e pronto —
  // sem `since` nem `history`, para não sujar o doc de quem nunca mudou de taxa.
  if (!isRateConfigured(entry)) return { ...(entry ?? {}), ...wanted };

  const last = history[history.length - 1];
  if (last && effectiveFrom <= last.to) return { ...(entry ?? {}), history };

  // Salvar o mesmo valor não é mudança: devolve a entrada como estava, sem sequer
  // criar um `history: []`. Senão o formulário salvo sem alteração viraria diff, e
  // a trilha de auditoria registraria uma troca de taxa que não houve.
  if (wanted.cpaValue === entry?.cpaValue && wanted.revPercentage === entry?.revPercentage) {
    return { ...(entry ?? {}) };
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
    : [...history, {
      from: since,
      to: prevDay(effectiveFrom),
      ...definedOnly({ cpaValue: entry?.cpaValue, revPercentage: entry?.revPercentage }),
    }];

  return { ...(entry ?? {}), ...wanted, since: effectiveFrom, history: nextHistory };
}

// A REGRA DE NEGÓCIO da troca, num lugar só: a taxa nova vale a partir de AMANHÃ.
// O dia corrente fica com a taxa antiga porque a granularidade do dado é o dia:
// um FTD das 10h e outro das 16h caem no mesmo `house_results.date`, e não há como
// dizer qual veio antes da troca. Ficar com a taxa antiga é a escolha conservadora
// e a leitura fiel de "não altera o que foi gerado antes da mudança".
// `today` tem que vir de `resolveServerToday` (dia BR) — nunca de `new Date()` no
// servidor, que roda em UTC e viraria o dia errado à noite.
export function scheduleRateChange(
  entry: BrandRateEntry | null | undefined,
  next: Partial<BrandRates>,
  today: string
): BrandRateEntry {
  return closeRateSegment(entry, next, addDays(today, 1));
}

// Fatia [from, to] nas fronteiras de vigência, para o consumidor somar janela a
// janela. Fora de qualquer histórico devolve uma janela só com a taxa atual — que é
// o caminho de 100% do parque hoje.
// Fronteiras de vigência de UMA entrada dentro de (from, to]. Percorre por CORTE,
// nunca dia a dia: um range de um ano não pode custar 365 iterações num cálculo de
// dinheiro.
function cutsFor(entry: BrandRateEntry | null | undefined, from: string, to: string): string[] {
  const out: string[] = [];
  const push = (d?: string) => { if (isDay(d) && d! > from && d! <= to) out.push(d!); };
  for (const s of cleanHistory(entry?.history)) {
    push(s.from);
    push(addDays(s.to, 1));
  }
  push(entry?.since);
  return out;
}

function windowsFromCuts(cuts: string[], from: string, to: string): { from: string; to: string }[] {
  const starts = [...new Set([from, ...cuts])].sort();
  return starts.map((start, i) => ({
    from: start,
    to: i + 1 < starts.length ? prevDay(starts[i + 1]) : to,
  }));
}

export function splitRangeByRate(
  entry: BrandRateEntry | null | undefined,
  from: string,
  to: string
): { from: string; to: string; rates: BrandRates }[] {
  if (!isDay(from) || !isDay(to) || from > to) return [];
  const history = cleanHistory(entry?.history);
  if (history.length === 0) return [{ from, to, rates: currentRates(entry) }];
  return windowsFromCuts(cutsFor(entry, from, to), from, to)
    .map((w) => ({ ...w, rates: ratesOn(entry, w.from) }));
}

// As janelas de vigência do afiliado INTEIRO no período: a união dos cortes do
// nível de topo com os de TODAS as casas. Existe porque a apuração busca os
// resultados de todas as casas de uma vez: uma janela global permite uma busca por
// janela em vez de uma por casa×janela. No caso comum (ninguém mudou de taxa) é UMA
// janela, ou seja, exatamente a busca única de hoje.
export function unionRateWindows(
  config: AffiliateConfig | null | undefined,
  from: string,
  to: string
): { from: string; to: string }[] {
  if (!isDay(from) || !isDay(to) || from > to) return [];
  const cuts = cutsFor(brandRateEntry(config), from, to);
  for (const entry of Object.values((config as any)?.byBrand ?? {})) {
    cuts.push(...cutsFor(entry as BrandRateEntry, from, to));
  }
  return windowsFromCuts(cuts, from, to);
}

// A CONFIG COMO ELA ERA naquele dia. É a peça que evita reescrever os 18
// consumidores de payout: em vez de ensinar cada um a somar por janela, entrega-se
// a eles a config histórica e a conta que já existe continua valendo.
// A ausência é preservada (campo nunca configurado continua ausente), senão a
// projeção faria `rateStatus` mentir "configurado" numa tela de exibição.
export function projectConfigAt(
  config: AffiliateConfig | null | undefined,
  date: string
): AffiliateConfig | null | undefined {
  if (!config || !isDay(date)) return config;
  const byBrand = (config as any).byBrand;
  const projected: Record<string, any> = {};
  for (const [key, entry] of Object.entries(byBrand ?? {})) {
    projected[key] = rawRatesOn(entry as BrandRateEntry, date);
  }
  const { cpaValue, revPercentage, ...rest } = config as any;
  return {
    ...rest,
    ...rawRatesOn(brandRateEntry(config), date),
    ...(byBrand ? { byBrand: projected } : {}),
  } as AffiliateConfig;
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
  // Sem `num` aqui: coagir a ausência para 0 apagaria o sinal de "nunca
  // configurado" que `isRateConfigured` (e a vigência inteira) depende.
  return {
    ...definedOnly({ cpaValue: config?.cpaValue, revPercentage: config?.revPercentage }),
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
