import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Navigate, Link } from 'react-router-dom';
import { Network as NetworkIcon, Loader2, AlertTriangle, CornerDownRight, Users, ArrowRight, Pencil } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  fetchAffiliates,
  fetchAffiliateConfigs,
  fetchSpecialAffiliates,
  fetchAffiliateUplines,
  fetchAllResults,
  fetchManualResults,
  saveAffiliateUpline,
  buildNetworkNodes,
  buildNetworkTree,
  groupDropsByReason,
  buildEligibleUpline,
  buildRootConfigMap,
  calcNetworkPayouts,
  flattenTree,
  descendantsOf,
  AffiliateConfig,
  SpecialAffiliate,
  NetworkRow,
} from '../services/affiliateService';
import { StoredManualRow } from '../lib/houseResults';
import { getKnownBrands, buildBrandIdOf, getBrandName, ALL_BRANDS } from '../lib/brand';
import {
  buildNetworkSourceRows,
  summarizeNetworkSources,
  filterRowsByHouse,
  HOUSE_UNKNOWN,
} from '../lib/networkSources';
import BrandFilter from '../components/BrandFilter';
import BrandLogo from '../components/BrandLogo';
import DateRangePicker from '../components/DateRangePicker';
import { DateRange, getDefaultRange } from '../lib/dateRange';
import { humanizeName, cn } from '../lib/utils';

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Rede de afiliados (ADMIN). Mostra a árvore de uplines em N níveis e, para o
// período escolhido, quanto cada afiliado leva de repasse PRÓPRIO e de "lucro
// sobre equipe" (o override que a agência paga aos uplines além do repasse
// direto). É a tela onde o admin define quem é upline de quem.
//
// ⚠️ Página de MASTER: mostra o custo da agência. Nada aqui pode migrar para a
// view do afiliado sem revisar o invariante de visibilidade (REDE-AFILIADOS.md §6).
export default function Network() {
  const { profile } = useAuth();
  const { push } = useToast();
  const isAdmin = profile?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(() => getDefaultRange());
  // Casa selecionada (nome) ou ALL_BRANDS. Recorta só a produção — ver `rows`.
  const [houseFilter, setHouseFilter] = useState<string>(ALL_BRANDS);
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [configs, setConfigs] = useState<Record<string, AffiliateConfig>>({});
  const [specials, setSpecials] = useState<Record<string, SpecialAffiliate>>({});
  const [uplines, setUplines] = useState<Record<string, string>>({});
  const [results, setResults] = useState<any[]>([]);
  const [manualRows, setManualRows] = useState<StoredManualRow[]>([]);
  // Motivos de descarte expandidos no painel de anomalias (agrupado por motivo).
  const [expandedDrops, setExpandedDrops] = useState<Set<string>>(() => new Set());
  // Linha com o seletor de upline ABERTO. O seletor lista a rede inteira, então
  // renderizar um <select> populado por linha custa N×N <option> no DOM — era o
  // que travava a página em rede grande. Só a linha em edição monta o select.
  const [editingUpline, setEditingUpline] = useState<string | null>(null);

  const loadStructure = async () => {
    const [affs, cfgs, sp, ups] = await Promise.all([
      fetchAffiliates(),
      fetchAffiliateConfigs(),
      fetchSpecialAffiliates(),
      fetchAffiliateUplines(),
    ]);
    setAffiliates(Array.isArray(affs) ? affs : []);
    setConfigs(cfgs || {});
    setSpecials(sp || {});
    setUplines(ups || {});
  };

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    Promise.all([loadStructure(), fetchAllResults(range), fetchManualResults(range)])
      .then(([, res, manual]) => {
        setResults(Array.isArray(res) ? res : []);
        setManualRows(Array.isArray(manual) ? manual : []);
      })
      .catch((err) => console.error('Erro ao carregar a rede:', err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, range.startDate, range.endDate]);

  // Nomes já humanizados UMA vez (não por chamada: nameOf roda em toda linha e
  // dentro de sort — humanizar no acesso multiplicava o custo).
  const nameOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of affiliates) {
      const id = String(a.id ?? a._id ?? '');
      if (id) m[id] = humanizeName(a.name || a.label || '') || `#${id}`;
    }
    return (id: string) => m[String(id)] || `#${id}`;
  }, [affiliates]);

  // Resolvedor afiliado→casa. SEM ele, a elegibilidade cai em `rateStatus(cfg,
  // undefined)`, que só enxerga a taxa de TOPO — quem tem apenas taxa POR CASA
  // (`byBrand`, o caso de toda instância de casas manuais) seria lido como "sem
  // taxa" e perderia a aresta. [[brandIdOf]]
  const brandIdOf = useMemo(() => buildBrandIdOf(affiliates), [affiliates]);

  // Nome da casa de cada afiliado (mirror) — a MESMA atribuição do `brandById` do
  // /admin, e o que dá nome às fontes e ao filtro.
  const brandNameOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of affiliates) {
      const id = String(a?.id ?? a?._id ?? '');
      const name = getBrandName(a);
      if (id && name) m[id] = name;
    }
    return (id: string) => m[String(id)] ?? null;
  }, [affiliates]);

  // Árvore saneada: aresta explícita (affiliate_uplines) + vínculo derivado dos
  // especiais ativos. Upline sem taxa configurada perde a aresta (ausência ≠ R$ 0).
  const tree = useMemo(
    () => buildNetworkTree(buildNetworkNodes({ ids: affiliates, specials, uplines }), {
      isEligibleUpline: buildEligibleUpline(configs, brandIdOf),
    }),
    [affiliates, specials, uplines, configs, brandIdOf]
  );

  // Linhas de produção no shape da rede (OTG + manuais atribuídas), CADA UMA com a
  // casa de origem e o mesmo brandId que o /admin usa nos cards por casa. A casa da
  // linha OTG é a do AFILIADO (o groupBy=affiliate não quebra por casa); a da manual
  // é a da própria linha. Levar o brandId na linha OTG também CORRIGE o pagamento de
  // quem só tem taxa POR CASA: antes ele caía na taxa de topo aqui e no byBrand no
  // /admin — dois números para a mesma produção.
  const sourceRows = useMemo(
    () => buildNetworkSourceRows({
      results,
      manualRows,
      otgHouseOf: (id) => {
        const name = brandNameOf(id);
        return name ? { name, brandId: brandIdOf(id) } : null;
      },
      manualHouseOf: (slug) => {
        const meta = getKnownBrands().find((b) => b.slug === slug);
        return meta ? { name: meta.name, brandId: meta.id ?? meta.slug } : null;
      },
    }),
    [results, manualRows, brandNameOf, brandIdOf]
  );

  // Fontes do período (casas que produziram) — é o que a tela lista p/ deixar
  // explícito de onde vêm os números, e de onde saem as opções do filtro.
  const sources = useMemo(() => summarizeNetworkSources(sourceRows), [sourceRows]);

  // Opções do filtro: as casas que produziram + a selecionada (que pode ter ficado
  // sem produção ao trocar o período). Casa "não identificada" não vira opção — é
  // um diagnóstico, exibido na faixa de fontes.
  const houseOptions = useMemo(() => {
    const names = sources.map((s) => s.house).filter((h) => h !== HOUSE_UNKNOWN);
    if (houseFilter !== ALL_BRANDS && !names.includes(houseFilter)) names.push(houseFilter);
    return names;
  }, [sources, houseFilter]);

  // O filtro recorta só a PRODUÇÃO: a árvore de uplines continua inteira, o dinheiro
  // é que passa a ser o daquela casa.
  const rows: NetworkRow[] = useMemo(
    () => filterRowsByHouse(sourceRows, houseFilter),
    [sourceRows, houseFilter]
  );

  const payouts = useMemo(() => calcNetworkPayouts(tree, rows, configs), [tree, rows, configs]);
  const flat = useMemo(() => flattenTree(tree), [tree]);
  const rootConfig = useMemo(() => buildRootConfigMap(tree, configs), [tree, configs]);

  // Rede inteira ordenada por nome UMA vez (Intl.Collator é muito mais barato que
  // localeCompare por comparação; antes ordenava por linha).
  const sortedIds = useMemo(() => {
    const collator = new Intl.Collator('pt-BR');
    return [...tree.ids].sort((a, b) => collator.compare(nameOf(a), nameOf(b)));
  }, [tree, nameOf]);

  // Opções de upline SÓ da linha em edição: todo mundo, menos ela e a própria
  // subárvore (evita oferecer o ciclo que o servidor recusaria com 400).
  const editingOptions = useMemo(() => {
    if (!editingUpline) return [];
    const blocked = new Set([editingUpline, ...descendantsOf(tree, editingUpline)]);
    return sortedIds.filter((x) => !blocked.has(x));
  }, [editingUpline, tree, sortedIds]);

  const changeUpline = async (affiliateId: string, uplineId: string) => {
    setSaving(affiliateId);
    try {
      await saveAffiliateUpline(affiliateId, uplineId || null);
      await loadStructure();
      push({ type: 'success', message: uplineId ? `Upline de ${nameOf(affiliateId)} atualizado.` : `${nameOf(affiliateId)} virou topo de estrutura.` });
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Não foi possível salvar o upline.' });
    } finally {
      setSaving(null);
    }
  };

  if (profile && !isAdmin) return <Navigate to="/dashboard" replace />;

  const maxDepth = flat.reduce((m, f) => Math.max(m, f.depth), 0) + 1;
  const houseSuffix = houseFilter === ALL_BRANDS ? '' : ` · só ${houseFilter}`;

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
            Estrutura
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
            <span className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/20">
              <NetworkIcon size={24} className="text-accent-500" />
            </span>
            Rede de afiliados
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2 max-w-2xl">
            Cada afiliado recebe a produção de toda a subárvore pela taxa própria e repassa cada filho direto
            pela taxa dele — a diferença é o <strong>lucro sobre equipe</strong>. O custo da agência é a produção
            de cada um pela taxa do <strong>topo</strong> da estrutura.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* A casa selecionada entra nas opções mesmo sem produção no período —
              senão o filtro ativo sumiria da lista e não teria como desfazer. */}
          <BrandFilter
            brands={houseOptions}
            value={houseFilter}
            onChange={setHouseFilter}
          />
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </header>

      {loading ? (
        <div className="p-24 flex flex-col items-center justify-center gap-4">
          <Loader2 size={40} className="text-accent-500 animate-spin" />
          <p className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest animate-pulse">Carregando a rede...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              // O sufixo da casa entra só nos cards de DINHEIRO: o filtro recorta a
              // produção, não a árvore — a estrutura segue sendo a rede inteira.
              { key: 'direto', label: 'Repasse direto', value: brl(payouts.directTotal), hint: `produção própria × taxa própria${houseSuffix}` },
              { key: 'equipe', label: 'Lucro sobre equipe', value: brl(payouts.overrideTotal), hint: `override pago aos uplines${houseSuffix}` },
              { key: 'custo', label: 'Custo total da agência', value: brl(payouts.agencyCost), hint: `Σ dos topos de estrutura${houseSuffix}` },
              { key: 'estrutura', label: 'Estrutura', value: `${tree.roots.length} topo(s) · ${maxDepth} nível(is)`, hint: `${tree.ids.length} afiliados na rede · não muda com o filtro` },
            ].map((c, idx) => (
              <motion.div
                key={c.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="p-6 rounded-2xl border bg-white dark:bg-neutral-900/60 border-slate-200/70 dark:border-neutral-800 shadow-sm"
              >
                <p className="text-[10px] uppercase font-bold tracking-widest mb-1.5 text-slate-400 dark:text-neutral-500">{c.label}</p>
                <h3 data-testid={`resumo-${c.key}`} className="text-2xl font-bold tracking-tight truncate text-slate-900 dark:text-white tabular-nums">{c.value}</h3>
                <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-1">{c.hint}</p>
              </motion.div>
            ))}
          </div>

          {/* De ONDE vêm os números acima. A rede soma duas bases (API da OTG +
              casas geridas aqui) e antes o total não dizia de quantas casas era.
              Cada casa é clicável: vira o filtro. */}
          <section className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mr-1">
              {houseFilter === ALL_BRANDS ? 'Dados de' : 'Filtrando por'}
            </span>

            {sources.length === 0 && (
              <span className="text-xs text-slate-400 dark:text-neutral-500">
                nenhuma casa produziu no período
              </span>
            )}

            {sources.map((s) => {
              const unknown = s.house === HOUSE_UNKNOWN;
              const selected = !unknown && houseFilter === s.house;
              // Casa não identificada é DIAGNÓSTICO (afiliado sem casa no cadastro),
              // não um filtro: produção que não sabemos atribuir tem que aparecer.
              if (unknown) {
                return (
                  <span
                    key="__unknown__"
                    title="Afiliados sem casa no cadastro — a produção entra no total, mas não é atribuída a nenhuma casa."
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-xl border border-amber-300/60 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 text-[11px] font-bold text-amber-700 dark:text-amber-400"
                  >
                    <AlertTriangle size={13} />
                    Sem casa no cadastro
                    <span className="font-medium opacity-70">· {s.affiliates} afiliado(s)</span>
                  </span>
                );
              }
              return (
                <button
                  key={s.house}
                  type="button"
                  onClick={() => setHouseFilter(selected ? ALL_BRANDS : s.house)}
                  aria-pressed={selected}
                  title={selected ? 'Clique para ver todas as casas' : `Ver só ${s.house}`}
                  className={cn(
                    'inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all',
                    selected
                      ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-400'
                      : 'border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 text-slate-600 dark:text-neutral-300 hover:border-slate-300 dark:hover:border-neutral-700'
                  )}
                >
                  <BrandLogo name={s.house} size={18} />
                  {s.house}
                  <span className="font-medium text-slate-400 dark:text-neutral-500">
                    · {s.affiliates} afiliado(s)
                  </span>
                  {/* Origem do dado: API da casa vs. planilha/pull. "Ambas" avisa que
                      o número da casa está sendo alimentado pelos dois caminhos. */}
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-md text-[9px] uppercase tracking-wider',
                    s.origin === 'ambas'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400'
                  )}>
                    {s.origin === 'otg' ? 'OTG' : s.origin === 'manual' ? 'gerida aqui' : 'ambas'}
                  </span>
                </button>
              );
            })}

            {houseFilter !== ALL_BRANDS && (
              <button
                type="button"
                onClick={() => setHouseFilter(ALL_BRANDS)}
                className="text-[11px] font-bold text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 underline decoration-dotted underline-offset-2"
              >
                limpar filtro
              </button>
            )}
          </section>

          {/* Anomalias: aresta descartada no saneamento + spread negativo + sem taxa.
              Nada é silenciosamente corrigido — o admin vê e decide. */}
          {(tree.dropped.length > 0 || payouts.anomalies.length > 0) && (
            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-5 rounded-2xl border border-amber-300/60 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-3">
                <AlertTriangle size={14} /> Pontos de atenção na rede
              </h3>
              <ul className="space-y-1.5 text-[12px] text-amber-900/80 dark:text-amber-200/80">
                {/* Agrupado por motivo: um descarte sistêmico (ex.: taxas ainda não
                    configuradas) geraria uma linha por aresta e afogaria a causa. */}
                {groupDropsByReason(tree.dropped).map((g) => {
                  const linha = (d: typeof g.items[number]) => (
                    <>
                      <strong>{nameOf(d.affiliateId)}</strong>{' '}
                      {d.reason === 'ciclo' && 'fechava um ciclo na rede — virou topo de estrutura.'}
                      {d.reason === 'auto-upline' && 'apontava para si mesmo — vínculo ignorado.'}
                      {d.reason === 'upline-desconhecido' && `tem upline fora do cadastro (#${d.uplineId}) — virou topo.`}
                      {d.reason === 'upline-inelegivel' && `tem upline (${nameOf(d.uplineId)}) SEM taxa configurada — o vínculo não vale até configurar a comissão dele.`}
                    </>
                  );
                  // Poucos: vale listar um a um, o nome é a informação útil.
                  if (g.items.length <= 3) {
                    return g.items.map((d, i) => <li key={`${g.reason}${i}`}>{linha(d)}</li>);
                  }
                  const aberto = expandedDrops.has(g.reason);
                  return (
                    <li key={g.reason}>
                      <button
                        type="button"
                        onClick={() => setExpandedDrops((s) => {
                          const n = new Set(s);
                          n.has(g.reason) ? n.delete(g.reason) : n.add(g.reason);
                          return n;
                        })}
                        className="text-left underline decoration-dotted underline-offset-2 hover:opacity-80"
                        aria-expanded={aberto}
                      >
                        <strong>{g.items.length} vínculos ignorados</strong>{' — '}
                        {g.reason === 'ciclo' && 'fechavam ciclo na rede'}
                        {g.reason === 'auto-upline' && 'apontavam para si mesmos'}
                        {g.reason === 'upline-desconhecido' && 'upline fora do cadastro'}
                        {g.reason === 'upline-inelegivel' && 'o upline ainda não tem taxa configurada (configure a comissão dos uplines para a rede valer)'}
                        {' · '}{aberto ? 'ocultar' : 'ver quais'}
                      </button>
                      {aberto && (
                        <ul className="mt-1.5 ml-4 space-y-1 list-disc marker:text-amber-500/60">
                          {g.items.map((d, i) => <li key={`${g.reason}-x${i}`}>{linha(d)}</li>)}
                        </ul>
                      )}
                    </li>
                  );
                })}
                {payouts.anomalies.map((a, i) => (
                  <li key={`a${i}`}>
                    {a.kind === 'spread-negativo' ? (
                      <>
                        <strong>{nameOf(a.affiliateId)}</strong> paga <strong>{nameOf(a.uplineId!)}</strong> mais do
                        que recebe ({brl(a.amount ?? 0)}) — a taxa do downline passou do teto do upline.
                      </>
                    ) : (
                      <>
                        <strong>{nameOf(a.affiliateId)}</strong> tem produção no período mas <strong>nenhuma taxa
                        configurada</strong> — o repasse dele sai R$ 0,00 (não é zero real, é falta de configuração).
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase font-bold tracking-widest text-slate-400 dark:text-neutral-500 border-b border-slate-100 dark:border-neutral-800">
                    <th className="text-left px-5 py-3">Afiliado</th>
                    <th className="text-left px-4 py-3">Upline</th>
                    <th className="text-right px-4 py-3">Taxa própria</th>
                    <th className="text-right px-4 py-3">Repasse próprio</th>
                    <th className="text-right px-4 py-3">Lucro sobre equipe</th>
                    <th className="text-right px-5 py-3">Total do afiliado</th>
                  </tr>
                </thead>
                <tbody>
                  {flat.map((node) => {
                    const id = node.affiliateId;
                    const p = payouts.byAffiliate[id];
                    const cfg = configs[id];
                    const semTaxa = !cfg || (typeof cfg.cpaValue !== 'number' && typeof cfg.revPercentage !== 'number');
                    return (
                      <tr
                        key={id}
                        className={cn(
                          'border-b border-slate-50 dark:border-neutral-800/60 hover:bg-slate-50/60 dark:hover:bg-neutral-800/30 transition-colors',
                          node.isRoot && 'bg-accent-500/[0.04]'
                        )}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5" style={{ paddingLeft: `${node.depth * 20}px` }}>
                            {node.depth > 0 && <CornerDownRight size={13} className="text-slate-300 dark:text-neutral-600 shrink-0" />}
                            <Link to={`/affiliates/${id}`} className="font-semibold text-slate-800 dark:text-white hover:text-accent-500 transition-colors truncate">
                              {nameOf(id)}
                            </Link>
                            {node.isRoot && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-accent-500/10 text-accent-600 dark:text-accent-400 text-[9px] font-bold uppercase tracking-wider">Topo</span>
                            )}
                            {node.childCount > 0 && (
                              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 dark:text-neutral-500">
                                <Users size={11} />{node.childCount}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {editingUpline === id ? (
                            <select
                              autoFocus
                              value={tree.uplineOf[id] ?? ''}
                              disabled={saving === id}
                              onBlur={() => setEditingUpline(null)}
                              onChange={(e) => {
                                setEditingUpline(null);
                                changeUpline(id, e.target.value);
                              }}
                              className="max-w-[220px] w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-slate-700 dark:text-neutral-200 disabled:opacity-50"
                            >
                              <option value="">— topo de estrutura —</option>
                              {editingOptions.map((o) => (
                                <option key={o} value={o}>{nameOf(o)}</option>
                              ))}
                            </select>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Alterar upline de ${nameOf(id)}`}
                              disabled={saving === id}
                              onClick={() => setEditingUpline(id)}
                              className="max-w-[220px] w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-left hover:border-accent-500/40 transition-colors disabled:opacity-50"
                            >
                              {saving === id ? (
                                <span className="inline-flex items-center gap-1.5 text-slate-400 dark:text-neutral-500"><Loader2 size={11} className="animate-spin" /> salvando…</span>
                              ) : tree.uplineOf[id] ? (
                                <span className="truncate text-slate-700 dark:text-neutral-200">{nameOf(tree.uplineOf[id])}</span>
                              ) : (
                                <span className="truncate text-slate-400 dark:text-neutral-500">— topo de estrutura —</span>
                              )}
                              <Pencil size={11} className="shrink-0 text-slate-300 dark:text-neutral-600" />
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-slate-600 dark:text-neutral-300">
                          {semTaxa ? (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">não configurada</span>
                          ) : (
                            <>R$ {cfg.cpaValue ?? 0}/CPA · {cfg.revPercentage ?? 0}%</>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-neutral-200">{brl(p?.own ?? 0)}</td>
                        <td className={cn(
                          'px-4 py-3 text-right tabular-nums font-semibold',
                          (p?.team ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-neutral-200'
                        )}>
                          {brl(p?.team ?? 0)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums font-bold text-slate-900 dark:text-white">{brl(p?.total ?? 0)}</td>
                      </tr>
                    );
                  })}
                  {flat.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center text-xs text-slate-400 dark:text-neutral-500">
                        Nenhum afiliado cadastrado ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.section>

          <p className="text-[11px] text-slate-400 dark:text-neutral-500 px-1">
            {Object.keys(rootConfig).length} afiliado(s) são cobrados pela taxa do topo da estrutura deles.{' '}
            <Link to="/admin" className="inline-flex items-center gap-1 font-bold hover:text-slate-600 dark:hover:text-neutral-300">
              Ver no lucro da agência <ArrowRight size={11} />
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
