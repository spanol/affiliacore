import React, { useEffect, useMemo, useState } from 'react';
import { pluralize } from '../lib/plural';
import { Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Loader2, DollarSign, UserPlus, Wallet, Target, Crown, HelpCircle, Users, BarChart3, TrendingUp, MousePointerClick, Hash, Divide, Receipt } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchSpecialAffiliates,
  fetchAffiliates,
  fetchResultsForAffiliatesSplit,
  fetchAllResultsByBrand,
  fetchAllResultsByCampaign,
  fetchAllDailyResults,
  fetchAffiliateDailyResults,
  fetchAffiliateConfigs,
  fetchAffiliateLinks,
  calcAffiliatePayout,
  resolveBrandRates,
  SpecialAffiliate,
  AffiliateConfig,
  CampaignRow,
  type AffiliateLink,
} from '../services/affiliateService';
import { buildPerHousePayout, type HouseMetricRow } from '../lib/perHousePayout';
import { networkHouseKeys, filterBrandRows } from '../lib/networkHouses';
import { buildFunnelItems, sumFunnelTotals, formatFunnelValue, type FunnelItemKey } from '../lib/funnel';
import { buildSpecialDailySeries } from '../lib/specialDaily';
import DateRangePicker from '../components/DateRangePicker';
import BrandBreakdown from '../components/BrandBreakdown';
import BrandFilter from '../components/BrandFilter';
import CampaignBreakdown from '../components/CampaignBreakdown';
import DailyPerformanceChart from '../components/DailyPerformanceChart';
import AffiliatePerformanceChart from '../components/AffiliatePerformanceChart';
import { DateRange, getDefaultRange } from '../lib/dateRange';
import { ALL_BRANDS, getKnownBrandName, buildBrandIdOf } from '../lib/brand';
import { cn, humanizeName } from '../lib/utils';

const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// B3 · Painel do afiliado especial — vê a própria sub-rede (own + subs vinculados),
// o ganho dele (spread sobre os subs + produção própria) e edita a comissão dos subs
// (limitada ao teto que o master definiu). Dados via proxy escopado (server B3 Fase 2).
export default function SpecialDashboard() {
  const { profile } = useAuth();
  const [range, setRange] = useState<DateRange>(() => getDefaultRange());
  // Filtro por casa (client-side a partir do groupBy=brand da rede já buscado).
  const [selectedBrand, setSelectedBrand] = useState<string>(ALL_BRANDS);
  const [loading, setLoading] = useState(true);
  const [special, setSpecial] = useState<SpecialAffiliate | null>(null);
  const [results, setResults] = useState<any[]>([]);
  // Partes SEPARADAS (OTG × manual) das mesmas linhas — base do DINHEIRO: a
  // linha manual é precificada pela casa da LINHA (perHousePayout), nunca pelo
  // merge (que perde o houseSlug — bug do R$ 280, 2026-08-12).
  const [payoutParts, setPayoutParts] = useState<{ otg: any[]; manual: HouseMetricRow[] }>({ otg: [], manual: [] });
  // Visões analíticas da rede (own + subs), escopadas pelo proxy (B3 Fase 2).
  const [brandResults, setBrandResults] = useState<any[]>([]);
  const [campaignResults, setCampaignResults] = useState<CampaignRow[]>([]);
  const [dailyResults, setDailyResults] = useState<any[]>([]);
  // Série diária SÓ da produção própria do especial (own id) — alimenta a linha
  // "produção própria" do gráfico (clone do "minhas comissões" do legado, 12/08).
  const [ownDailyResults, setOwnDailyResults] = useState<any[]>([]);
  const [configs, setConfigs] = useState<Record<string, AffiliateConfig>>({});
  const [pool, setPool] = useState<any[]>([]); // mirror p/ afiliado→brandId (byBrand)
  // Links da rede (own + subs, escopados no servidor) — junto com a produção, são
  // o que define quais casas são DELE nas visões por casa. Ver lib/networkHouses.
  const [links, setLinks] = useState<AffiliateLink[]>([]);

  const ownId = profile?.affiliateId ? String(profile.affiliateId) : '';

  const load = async () => {
    if (!ownId) return;
    try {
      setLoading(true);
      // A rede (own + subs) precisa ser conhecida ANTES de buscar os resultados por
      // afiliado: `fetchResultsForAffiliates(networkIds)` funde o resultado MANUAL
      // (casas 'manual') escopado à rede, igual ao headline do AffiliateDetails. Sem
      // isso, `results` (que era `fetchAllResults`, mantido PURO p/ o /admin) NÃO somava
      // o manual no agregado — só o BrandBreakdown por-casa (fetchAllResultsByBrand)
      // mostrava, criando a divergência "headline ≠ Σ por-casa" (achado ao vivo 2026-06-26).
      const specials = await fetchSpecialAffiliates();
      const mine = specials[ownId] || null;
      const networkIds = [ownId, ...((mine?.subAffiliateIds || []).map(String))];
      // brand/campaign/daily vão SEM affiliateIds — o proxy escopa à sub-rede do
      // especial (own + subs). Agregados pela API por casa/campanha/dia.
      const [split, byBrand, byCampaign, byDay, ownByDay, cfgs, poolData, netLinks] = await Promise.all([
        fetchResultsForAffiliatesSplit(networkIds, range),
        fetchAllResultsByBrand(range),
        fetchAllResultsByCampaign(range),
        fetchAllDailyResults(range),
        fetchAffiliateDailyResults(ownId, range.startDate, range.endDate).catch(() => []),
        fetchAffiliateConfigs(),
        fetchAffiliates().catch(() => []),
        fetchAffiliateLinks().catch(() => []),
      ]);
      setSpecial(mine);
      setResults(split.rows);
      setPayoutParts({ otg: split.otg, manual: split.manual });
      setBrandResults(Array.isArray(byBrand) ? byBrand : []);
      setCampaignResults(Array.isArray(byCampaign) ? byCampaign : []);
      setDailyResults(Array.isArray(byDay) ? byDay : []);
      setOwnDailyResults(Array.isArray(ownByDay) ? ownByDay : []);
      setConfigs(cfgs);
      setPool(Array.isArray(poolData) ? poolData : []);
      setLinks(Array.isArray(netLinks) ? netLinks : []);
    } catch (err) {
      console.error('Erro ao carregar painel da sub-rede:', err);
      setResults([]);
      setPayoutParts({ otg: [], manual: [] });
      setBrandResults([]);
      setCampaignResults([]);
      setDailyResults([]);
      setOwnDailyResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ownId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownId, range.startDate, range.endDate]);

  // Taxa PRÓPRIA do especial (o CPA/REV que o master configurou pra ele). É a
  // referência do ganho: a agência paga o especial por essa taxa sobre toda a
  // rede; ele repassa cada sub pela taxa que define e fica com o spread.
  // Config PRÓPRIA do especial, PRESERVANDO byBrand (antes era reconstruída só com
  // cpaValue/revPercentage de topo → a taxa por casa do especial era descartada · R10).
  const ownConfig = useMemo<AffiliateConfig>(
    () => configs[ownId] ?? { affiliateId: ownId, cpaValue: 0, revPercentage: 0 },
    [ownId, configs]
  );
  // afiliado→brandId (byBrand) — mesma atribuição afiliado→casa do /admin.
  // Vale SÓ pra parte OTG: a produção MANUAL é precificada pela casa de cada
  // LINHA (houseSlug) via perHousePayout — o mirror não manda nela.
  const brandIdOf = useMemo(() => buildBrandIdOf(pool), [pool]);
  const payoutOf = useMemo(
    () => buildPerHousePayout(payoutParts.otg, payoutParts.manual, brandIdOf),
    [payoutParts, brandIdOf]
  );

  const subIds = special?.subAffiliateIds?.map(String) || [];

  // Filtro por casa: "Todas as casas" usa as linhas por afiliado (own+subs); uma
  // casa específica usa a linha agregada daquela casa (groupBy=brand da rede).
  // Escopa só a grade de métricas e o funil; o lucro líquido (spread por sub) e os
  // demais blocos seguem na rede inteira — o spread não se divide por casa aqui.
  const brandNameOf = (r: any) =>
    getKnownBrandName(String(r?.id ?? ''), String(r?.label || r?.name || '')) ?? String(r?.label || r?.name || 'Casa');
  // Só as casas DELE (pedido Infinity, 24/08): link ativo na rede ou produção no
  // período. As demais entravam aqui zeradas por `withKnownHouses` (modelo do portal
  // OTG, que lista a casa acesa e vazia) e enchiam o "Por casa" e o filtro de linhas
  // R$ 0,00 de casa que ele não opera. Linha COM número passa sempre — o filtro não
  // esconde dinheiro. Ver src/lib/networkHouses.ts.
  const activeHouseKeys = useMemo(
    () => networkHouseKeys(links, payoutParts, brandIdOf),
    [links, payoutParts, brandIdOf]
  );
  const networkBrandResults = useMemo(
    () => filterBrandRows(brandResults, activeHouseKeys),
    [brandResults, activeHouseKeys]
  );
  const availableBrands = Array.from(new Set(networkBrandResults.map(brandNameOf))).filter(Boolean);
  const isAllBrands = selectedBrand === ALL_BRANDS;
  const selectedBrandRow = isAllBrands ? null : networkBrandResults.find((r) => brandNameOf(r) === selectedBrand);
  const metricRows = isAllBrands ? results : (selectedBrandRow ? [selectedBrandRow] : []);

  // Funil agregado da sub-rede (own + subs), escopado pela casa selecionada —
  // na ORDEM do painel da Esportiva, com derivados (lib/funnel, call 12/08).
  const funnelItems = buildFunnelItems(sumFunnelTotals(metricRows));

  // Lucro líquido do especial = link dele (produção própria) + lucro da rede (spread).
  // Spread por sub = taxa própria do especial − taxa que ele definiu pro sub. TODO o
  // dinheiro sai de `payoutOf` (perHousePayout): OTG na casa do afiliado (mirror),
  // manual na casa da LINHA — precificar o agregado com a casa do mirror cobrou um
  // QFTD da Esportiva à taxa da Super Bet (R$ 280 em vez de R$ 110, 2026-08-12).
  const rowAff = (r: any) => String(r?.affiliate_id ?? r?.id ?? '');
  const ownPayout = payoutOf.breakdownFor(ownId, ownConfig).total;
  const spreadTotal = subIds.reduce(
    (sum, id) => sum + (payoutOf.breakdownFor(id, ownConfig).total - payoutOf.breakdownFor(id, configs[id]).total),
    0
  );
  const earnings = ownPayout + spreadTotal;

  // Comissão total do especial = taxa PRÓPRIA aplicada sobre TODA a rede (própria + subs).
  // É o que a agência paga ao especial; o lucro líquido = comissão total − repasse aos subs.
  // Mantém a regra do lucro líquido: tudo à taxa do especial, nunca a comissão bruta da casa.
  // `Rede` = sempre a rede inteira (alimenta o lucro líquido); as versões scopadas
  // abaixo respeitam o filtro de casa e alimentam só a grade de métricas.
  const comissaoTotalRede = results.reduce((sum, r) => sum + payoutOf.breakdownFor(rowAff(r), ownConfig).total, 0);
  const repasse = comissaoTotalRede - earnings;
  // Escopo do filtro de casa: "Todas as casas" → partes por afiliado (perHousePayout);
  // casa selecionada → a linha agregada daquela casa à taxa DELA (groupBy=brand),
  // caminho que já era por-casa e continua igual.
  const scopedParts = isAllBrands
    ? results.reduce(
        (acc, r) => {
          const b = payoutOf.breakdownFor(rowAff(r), ownConfig);
          return { total: acc.total + b.total, cpa: acc.cpa + b.cpa, rev: acc.rev + b.rev };
        },
        { total: 0, cpa: 0, rev: 0 }
      )
    : metricRows.reduce(
        (acc, r) => {
          const rates = resolveBrandRates(ownConfig, String(selectedBrandRow?.id ?? '') || undefined);
          const cpa = (r.qualified_cpa || 0) * rates.cpaValue;
          const rev = (r.rvs || 0) * (rates.revPercentage / 100);
          return { total: acc.total + cpa + rev, cpa: acc.cpa + cpa, rev: acc.rev + rev };
        },
        { total: 0, cpa: 0, rev: 0 }
      );
  const comissaoTotal = scopedParts.total;
  const cpaPortion = scopedParts.cpa;
  const revPortion = scopedParts.rev;

  // Cards de métrica (espelham o /admin, capados à rede do especial).
  const metrics = [
    { label: 'Afiliados na rede', value: String(subIds.length), icon: Users },
    { label: 'Comissão total', value: brl(comissaoTotal), icon: DollarSign },
    { label: 'Total CPA', value: brl(cpaPortion), icon: BarChart3 },
    { label: 'Total REV', value: brl(revPortion), icon: TrendingUp },
  ];

  // Série diária: a API agrega own+subs por dia. buildSpecialDailySeries troca a
  // comissão da CASA (total_commission cru) pela comissão DO ESPECIAL à taxa
  // própria (regra do lucro líquido — nunca expor a margem/receita bruta) e
  // carimba `own_commission` por dia — a linha de PRODUÇÃO PRÓPRIA separada do
  // total da rede (clone do "minhas comissões" do painel legado, call 12/08).
  const dailyChartData = useMemo(
    () => buildSpecialDailySeries(dailyResults, ownDailyResults, ownConfig),
    [dailyResults, ownDailyResults, ownConfig]
  );

  // Desempenho por afiliado da rede (own + subs), ordenado por comissão. TUDO à
  // TAXA PRÓPRIA do especial (regra do lucro líquido [[boost-net-profit-rule]]):
  // nunca a comissão bruta da casa — Comissão/CPA/REV são o que o especial recebe.
  const affiliateChartData = useMemo(
    () => [...results]
      .map((r) => {
        // Partes POR CASA do afiliado (perHousePayout) — espelha os cards/CPA/REV
        // acima. Sem isso o chart divergia da Comissão real quando o afiliado
        // produzia fora da casa do mirror. [[boost-net-profit-per-house]]
        const b = payoutOf.breakdownFor(rowAff(r), ownConfig);
        return {
          name: humanizeName(String(r.affiliate_name || r.name || r.label || r.affiliate_id || r.id || '---')),
          Comissão: b.total,
          CPA: b.cpa,
          REV: b.rev,
        };
      })
      .sort((a, b) => b.Comissão - a.Comissão),
    [results, ownConfig, payoutOf]
  );

  // Top 5 afiliados da rede (own + subs) por comissão à TAXA PRÓPRIA do especial —
  // espelha o "Top afiliados" do /admin, capado à rede (regra do lucro líquido).
  const topAffiliates = useMemo(
    () => [...results]
      .map((r) => ({
        id: String(r.affiliate_id ?? r.id ?? ''),
        name: humanizeName(String(r.affiliate_name || r.name || r.label || r.affiliate_id || r.id || '---')),
        // Mesma fonte por-casa dos cards — antes usava só a taxa de topo e
        // divergia da Comissão total quando havia byBrand.
        commission: payoutOf.breakdownFor(rowAff(r), ownConfig).total,
        registrations: r.registrations || 0,
        qualifiedCpa: r.qualified_cpa || 0,
        isOwn: String(r.affiliate_id ?? r.id ?? '') === ownId,
      }))
      .sort((a, b) => b.commission - a.commission)
      .slice(0, 5),
    [results, ownConfig, ownId, payoutOf]
  );

  // Mesma lógica para "Por casa": o BrandBreakdown calcula a comissão a partir do
  // config informado — passamos a taxa própria do especial (o que ele recebe).

  const FUNNEL_ICONS: Record<FunnelItemKey, typeof UserPlus> = {
    visits: MousePointerClick,
    registrations: UserPlus,
    first_deposits: Wallet,
    deposit_count: Hash,
    deposit: DollarSign,
    avg_deposit: Divide,
    avg_ticket: Receipt,
    qualified_cpa: Target,
  };
  const funnel = funnelItems.map((item) => ({
    label: item.label,
    value: formatFunnelValue(item),
    icon: FUNNEL_ICONS[item.key],
  }));

  // Guard: só afiliado especial acessa esta rota.
  if (profile && !profile.isSpecial) return <Navigate to="/dashboard" replace />;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={40} className="text-accent-500 animate-spin" />
        <p className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest animate-pulse">Carregando sua rede...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 mb-3 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
            Afiliado especial
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
            <span className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/20">
              <Crown size={24} className="text-accent-500" />
            </span>
            {humanizeName(profile?.name || '') || 'Sua rede'}
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">{pluralize(subIds.length, 'sub-afiliado')} + sua produção.</p>
        </div>
        <div className="flex flex-col items-start md:items-end gap-3">
          <DateRangePicker value={range} onChange={setRange} />
          <BrandFilter brands={availableBrands} value={selectedBrand} onChange={setSelectedBrand} />
        </div>
      </header>

      {/* Cards de métrica — espelham o /admin (capados à rede): nº de afiliados,
          comissão total (taxa própria sobre a rede), CPA e REV. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, idx) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={cn(
              'group p-6 rounded-2xl border transition-all relative overflow-hidden',
              idx === 0
                ? 'bg-slate-900 dark:bg-neutral-900 text-white border-slate-800 dark:border-neutral-800 shadow-xl shadow-slate-900/10 dark:shadow-black/30'
                : 'bg-white dark:bg-neutral-900/60 border-slate-200/70 dark:border-neutral-800 shadow-sm hover:border-slate-300 dark:hover:border-neutral-700'
            )}
          >
            {idx === 0 && (
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
            )}
            <div className="flex justify-between items-start mb-4 relative">
              <div className={cn(
                'p-2.5 rounded-xl border transition-transform group-hover:scale-105',
                idx === 0 ? 'bg-white/5 border-white/10' : 'bg-slate-50 dark:bg-neutral-800/60 border-slate-100 dark:border-neutral-700/60'
              )}>
                <metric.icon size={20} className={cn(idx === 0 ? 'text-white' : 'text-slate-900 dark:text-neutral-100')} />
              </div>
            </div>
            <p className={cn('text-[10px] uppercase font-bold tracking-widest mb-1.5', idx === 0 ? 'text-neutral-400' : 'text-slate-400 dark:text-neutral-500')}>{metric.label}</p>
            <h3 className={cn('text-2xl font-bold tracking-tight truncate', idx === 0 ? 'text-white' : 'text-slate-900 dark:text-white')}>{metric.value}</h3>
          </motion.div>
        ))}
      </div>

      {/* Ganho do especial (spread sobre subs + produção própria) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden p-6 md:p-7 rounded-2xl border border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 shadow-sm flex items-center justify-between gap-4"
      >
        <div className="absolute top-0 right-0 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest">
            Lucro líquido no período <HelpCircle size={12} />
          </span>
          <h3 className="text-3xl md:text-4xl font-bold tracking-tighter text-emerald-700 dark:text-emerald-400">{brl(earnings)}</h3>
          <p className="text-[11px] font-medium text-slate-500 dark:text-neutral-400 mt-2 max-w-2xl">
            Comissão total ({brl(comissaoTotalRede)}) − repasses aos sub-afiliados ({brl(repasse)}). Inclui sua produção própria ({brl(ownPayout)}) + o spread sobre a rede.
          </p>
        </div>
        <div className="relative shrink-0 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
          <DollarSign size={24} />
        </div>
      </motion.div>

      {/* Funil agregado da sub-rede */}
      <section>
        <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-400 dark:text-neutral-500 mb-3 px-1">Funil da rede</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {funnel.map((item, idx) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="group p-6 rounded-2xl border bg-white dark:bg-neutral-900/60 border-slate-200/70 dark:border-neutral-800 shadow-sm hover:border-slate-300 dark:hover:border-neutral-700 transition-all"
            >
              <div className="p-2.5 mb-4 w-fit rounded-xl border bg-slate-50 dark:bg-neutral-800/60 border-slate-100 dark:border-neutral-700/60 transition-transform group-hover:scale-105">
                <item.icon size={20} className="text-slate-900 dark:text-neutral-100" />
              </div>
              <p className="text-[10px] uppercase font-bold tracking-widest mb-1.5 text-slate-400 dark:text-neutral-500">{item.label}</p>
              <h3 className="text-2xl font-bold tracking-tight truncate text-slate-900 dark:text-white">{item.value}</h3>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Top 5 afiliados da rede — ranking por comissão à taxa própria do especial.
          Espelha o "Top afiliados" do /admin, capado à rede (own + subs). */}
      <section className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-neutral-800 flex items-center gap-3">
          <span className="shrink-0 p-2 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-500"><Crown size={16} /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Top 5 afiliados da rede</h3>
            <p className="text-[11px] text-slate-400 dark:text-neutral-500">Você + sub-afiliados, por comissão à sua taxa no período</p>
          </div>
        </div>
        <div className="divide-y divide-slate-50 dark:divide-neutral-800">
          {topAffiliates.length === 0 || topAffiliates.every((a) => a.commission === 0 && a.registrations === 0) ? (
            <p className="px-6 py-10 text-center text-xs font-bold text-slate-400 dark:text-neutral-400 uppercase tracking-widest opacity-60">Nenhuma produção na rede no período</p>
          ) : topAffiliates.map((a, i) => (
            <div key={a.id || i} className="px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-neutral-800/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0 w-6 h-6 rounded-lg bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 text-[11px] font-black flex items-center justify-center">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-white truncate flex items-center gap-1.5">
                    {a.name}
                    {a.isOwn && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent-500/10 text-accent-600 dark:text-accent-400 text-[8px] font-black uppercase tracking-wider"><Crown size={9} /> Você</span>}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-neutral-500">{a.registrations.toLocaleString('pt-BR')} cadastros · {a.qualifiedCpa.toLocaleString('pt-BR')} CPA qualif.</p>
                </div>
              </div>
              <span className="shrink-0 text-sm font-black text-slate-900 dark:text-white tabular-nums">{brl(a.commission)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Desempenho por afiliado da rede (own + subs) — componente compartilhado com
          o /admin, aqui escopado à rede e à taxa própria do especial. */}
      <AffiliatePerformanceChart
        data={affiliateChartData}
        title="Desempenho por afiliado (sua rede)"
        subtitle="Sua produção + sub-afiliados, por volume de comissão à sua taxa (5 por vez)."
        infoText="Afiliados da sua rede (você + subs) por comissão no período. Comissão/CPA/REV são o seu ganho à sua taxa, nunca o bruto da casa."
      />

      {/* Por casa — distribuição da comissão da rede (own + subs) por casa de aposta,
          calculada à TAXA PRÓPRIA do especial (o que ele recebe da agência). */}
      <section>
        <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-400 dark:text-neutral-500 mb-3 px-1">
          Por casa (sua rede)
        </h3>
        <BrandBreakdown data={networkBrandResults} config={ownConfig} />
      </section>

      {/* Por campanha — desempenho da rede por campanha. "Sua comissão" = repasse à
          taxa própria do especial; a margem da agência continua só no master. */}
      <section>
        <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-400 dark:text-neutral-500 mb-3 px-1">
          Top 5 campanhas (sua rede)
        </h3>
        <CampaignBreakdown
          commissionLabel="Sua comissão"
          subtitle="Top 5 campanhas da sua rede (sua produção + sub-afiliados) no período"
          infoText="As 5 campanhas com maior comissão sua na rede. 'Sua comissão' é o seu ganho à sua taxa (CPA + REV) sobre toda a rede no período."
          rows={campaignResults
            .map((c) => ({
              name: c.name,
              registrations: c.registrations,
              firstDeposits: c.first_deposits,
              deposit: c.deposit,
              qualifiedCpa: c.qualified_cpa,
              commission: calcAffiliatePayout(c, ownConfig),
            }))
            .sort((a, b) => b.commission - a.commission)
            .slice(0, 5)}
        />
      </section>

      {/* Evolução diária da rede (own + subs) — comissão exibida à taxa própria. */}
      <section>
        <div className="bg-white dark:bg-neutral-900 border border-slate-100 dark:border-neutral-800 rounded-3xl flex flex-col shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 dark:border-neutral-800 flex justify-between items-center bg-slate-50/50 dark:bg-neutral-800/30">
            <h3 className="font-black text-xs text-slate-800 dark:text-white uppercase tracking-widest">Evolução Diária (sua rede)</h3>
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-neutral-800 rounded-lg text-[10px] font-bold text-slate-400 dark:text-neutral-400 uppercase tracking-widest">
              Cadastros · Comissão da rede · <span className="text-emerald-600 dark:text-emerald-400">Produção própria</span>
            </div>
          </div>
          <DailyPerformanceChart data={dailyChartData} />
        </div>
      </section>
    </div>
  );
}
