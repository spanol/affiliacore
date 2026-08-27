import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Clock,
  Download,
  Loader2,
  TrendingUp,
  User,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  AffiliateConfig,
  fetchAffiliateById,
  fetchAffiliateConfigs,
  fetchAffiliateResults,
  fetchAffiliateResultsByBrand,
  fetchAffiliateDailyResults,
  fetchAffiliates,
  fetchAffiliateLinks,
  rateStatus,
  resolveBrandRates,
  type AffiliateLink,
} from '../services/affiliateService';
import { networkHouseKeys, filterBrandRows, linksOfAffiliates } from '../lib/networkHouses';
import BrandBreakdown from '../components/BrandBreakdown';
import DataFreshness from '../components/DataFreshness';
import FunnelGrid from '../components/FunnelGrid';
import BrandFilter from '../components/BrandFilter';
import DailyPerformanceChart from '../components/DailyPerformanceChart';
import DateRangePicker from '../components/DateRangePicker';
import InfoTooltip from '../components/InfoTooltip';
import TrendBadge from '../components/TrendBadge';
import { DateRange, getDefaultRange, getPreviousRange, percentChange } from '../lib/dateRange';
import { ALL_BRANDS, getKnownBrandName } from '../lib/brand';
import { cn } from '../lib/utils';
import { buildDailyExtractCsv } from '../lib/exportExtract';
import { payoutOverBrandRows, unratedProducingBrands } from '../lib/perHousePayout';
import { buildAffiliateDailySeries } from '../lib/affiliateDailySeries';
import { pluralize } from '../lib/plural';
import { buildCsvFilename } from '../lib/csv';
import { downloadCsvFile } from '../lib/browserDownload';
import { REV_ENABLED } from '../lib/instanceClient';

export default function ClientDashboard() {
  const { profile } = useAuth();
  const [affiliate, setAffiliate] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [brandResults, setBrandResults] = useState<any[]>([]);
  const [dailyResults, setDailyResults] = useState<any[]>([]);
  const [prevRegistrations, setPrevRegistrations] = useState<number | null>(null);
  const [config, setConfig] = useState<AffiliateConfig | null>(null);
  // Links DELE: junto com a produção, definem quais casas a tela lista. Ver lib/networkHouses.
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [ownId, setOwnId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(() => getDefaultRange());
  // Filtro por casa (client-side a partir do groupBy=brand já buscado).
  const [selectedBrand, setSelectedBrand] = useState<string>(ALL_BRANDS);

  useEffect(() => {
    if (profile?.affiliateId || profile?.email) {
      loadClientData();
    }
  }, [profile?.affiliateId, profile?.email, range.startDate, range.endDate]);

  const loadClientData = async () => {
    try {
      setLoading(true);

      let affiliateId = profile?.affiliateId || '';
      let affiliateDetails: any = null;
      let allConfigs: Record<string, AffiliateConfig> = {};
      let resultsData: any[] = [];
      let brandData: any[] = [];
      let dailyData: any[] = [];
      let prevData: any[] = [];
      let linkData: AffiliateLink[] = [];

      if (affiliateId) {
        affiliateDetails = await fetchAffiliateById(affiliateId).catch(() => null);
      }

      if (!affiliateDetails && profile?.email) {
        const allAffiliates = await fetchAffiliates().catch(() => []);
        affiliateDetails = allAffiliates.find(
          (item: any) => item.email?.toLowerCase() === profile.email?.toLowerCase()
        );
        affiliateId = String(affiliateDetails?.id || affiliateDetails?._id || affiliateId || '');
      }

      if (affiliateId) {
        const prevRange = getPreviousRange(range);
        [resultsData, allConfigs, brandData, dailyData, prevData, linkData] = await Promise.all([
          fetchAffiliateResults(affiliateId, range).catch((err) => {
            console.error('Error fetching results:', err);
            return [];
          }),
          fetchAffiliateConfigs().catch((err) => {
            console.error('Error fetching configs:', err);
            return {};
          }),
          fetchAffiliateResultsByBrand(affiliateId, range),
          fetchAffiliateDailyResults(affiliateId, range.startDate, range.endDate),
          fetchAffiliateResults(affiliateId, prevRange).catch(() => []),
          fetchAffiliateLinks().catch(() => []),
        ]);
      }

      const fallbackAffiliate = {
        id: affiliateId || profile?.affiliateId || profile?.uid || 'N/A',
        name: profile?.name || 'Sem Nome',
        label: profile?.name || 'Sem Nome',
        email: profile?.email || '',
        status: 'Ativo',
      };

      setAffiliate(affiliateDetails || fallbackAffiliate);
      setResults(Array.isArray(resultsData) ? resultsData : []);
      setBrandResults(Array.isArray(brandData) ? brandData : []);
      setDailyResults(Array.isArray(dailyData) ? dailyData : []);
      setPrevRegistrations((Array.isArray(prevData) ? prevData : []).reduce((sum: number, r: any) => sum + (r.registrations || 0), 0));
      setConfig(affiliateId ? allConfigs[affiliateId] || null : null);
      setLinks(Array.isArray(linkData) ? linkData : []);
      setOwnId(affiliateId);
      setError(null);
    } catch (err) {
      console.error('Error loading client dashboard data:', err);
      setAffiliate({
        id: profile?.affiliateId || profile?.uid || 'N/A',
        name: profile?.name || 'Sem Nome',
        label: profile?.name || 'Sem Nome',
        email: profile?.email || '',
        status: 'Ativo',
      });
      setResults([]);
      setBrandResults([]);
      setDailyResults([]);
      setPrevRegistrations(null);
      setConfig(null);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-slate-400 dark:text-neutral-500 animate-spin" />
        <p className="text-slate-500 font-medium">Carregando informações realistas...</p>
      </div>
    );
  }

  if (!affiliate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-slate-400 dark:text-neutral-500 animate-spin" />
        <p className="text-slate-500 font-medium">Preparando dashboard...</p>
      </div>
    );
  }

  const emptyResult = {
    registrations: 0,
    first_deposits: 0,
    qualified_cpa: 0,
    rvs: 0,
  };
  const clientRows: Array<{ name: string; firstDeposit: string; createdAt: string }> = [];
  const resultsToRender = results.length > 0 ? results : [emptyResult];

  // Casas que a tela lista: só as DELE (pedido Infinity de 24/08, o mesmo que
  // recortou as telas do gerente) — casa com link de divulgação ativo dele, mais
  // casa em que ele produziu. `fetchAffiliateResultsByBrand` passa por
  // `withKnownHouses`, que acende TODA casa ativa do backoffice (modelo do portal
  // OTG): numa instância com 15 casas, o painel do afiliado virava 14 barras de
  // R$ 0,00 de casa que ele nem opera. Linha COM número passa sempre e afiliado
  // ainda sem link nem produção segue vendo o catálogo (fail-open, o de hoje).
  // Ver src/lib/networkHouses.ts. Sem useMemo de propósito: esta parte do corpo
  // roda depois dos early returns de carregamento, onde hook não pode entrar.
  const brandNameOf = (r: any) =>
    getKnownBrandName(String(r?.id ?? ''), String(r?.label || r?.name || '')) ?? String(r?.label || r?.name || 'Casa');
  const myBrandResults = filterBrandRows(
    brandResults,
    networkHouseKeys(linksOfAffiliates(links, [ownId]), { otg: [], manual: [] }, () => undefined)
  );
  // Sem `withKnownBrandNames`: ele re-injeta TODA casa ativa do backoffice e era o
  // que enchia o dropdown do afiliado com casa que não é dele. Sobrando uma casa só,
  // o BrandFilter se esconde sozinho — "todas × a única" não é escolha.
  const availableBrands = Array.from(new Set(myBrandResults.map(brandNameOf)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const isAllBrands = selectedBrand === ALL_BRANDS;
  const selectedBrandRow = isAllBrands ? null : myBrandResults.find((r) => brandNameOf(r) === selectedBrand);

  // Export CSV do extrato diário do período (convergente Affility+NovaEra). Reusa a
  // MESMA taxa/casa do card "Comissão total" acima — nunca reimplementa o cálculo.
  const handleExportCsv = () => {
    const brandId = isAllBrands ? undefined : String(selectedBrandRow?.id ?? '');
    const csv = buildDailyExtractCsv(dailyResults, config, brandId, REV_ENABLED);
    downloadCsvFile(buildCsvFilename('extrato', `${range.startDate}_a_${range.endDate}`), csv);
  };

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-neutral-400 truncate">
            Bem-vindo, {profile?.name || affiliate.name || affiliate.label || 'parceiro'}.
          </p>
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight truncate">
              {affiliate.name || affiliate.label || profile?.name || 'Sem Nome'}
            </h1>
            <span
              className={cn(
                'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                affiliate.status === 'active' || affiliate.status === 'Ativo' || affiliate.status === 1
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
              )}
            >
              {affiliate.status || 'Pendente'}
            </span>
          </div>
          <p className="text-slate-500 font-mono text-xs uppercase tracking-widest mt-1 break-all">
            ID Externo: #{affiliate.id}
          </p>
        </div>
        <div className="flex flex-col items-start md:items-end gap-3">
          <DateRangePicker value={range} onChange={setRange} />
          <div className="flex items-center gap-2">
            <BrandFilter brands={availableBrands} value={selectedBrand} onChange={setSelectedBrand} />
            <button
              onClick={handleExportCsv}
              disabled={dailyResults.length === 0}
              title="Exportar extrato diário do período em CSV"
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-full text-xs font-bold text-slate-600 dark:text-neutral-300 hover:border-accent-500/40 hover:text-accent-500 transition-all shadow-sm disabled:opacity-40 disabled:pointer-events-none"
            >
              <Download size={14} /> CSV
            </button>
          </div>
        </div>
      </header>

      {/* Pré-cadastro: login ativo, mas ainda sem ID de relatório (id sintético
          pending_*). Os dados acendem quando o afiliado começa a produzir e o
          sync reconcilia o affiliateId real. */}
      {String(profile?.affiliateId || '').startsWith('pending_') && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200/70 dark:border-amber-900/40">
          <Clock size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Cadastro aprovado, aguardando produção</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">Seu acesso já está ativo. Os resultados aparecem aqui assim que sua operação registrar atividade na casa.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8">
        <div className="space-y-8">
          {resultsToRender.map((res: any, idx: number) => {
            // Casa selecionada → a linha daquela casa, na taxa dela. "Todas as
            // casas" → soma CASA A CASA (payoutOverBrandRows), nunca o agregado na
            // taxa de topo: quem tem taxa só por casa (byBrand, que é como a
            // Infinity precifica) via o CPA contado e o dinheiro sumir do total,
            // e o mesmo número aparecia certo ao filtrar a casa (25/08/2026).
            const row = isAllBrands ? res : (selectedBrandRow ?? emptyResult);
            const partes = isAllBrands
              ? payoutOverBrandRows(myBrandResults, config)
              : payoutOverBrandRows([selectedBrandRow ?? { id: '' }], config);
            const rates = resolveBrandRates(config, isAllBrands ? undefined : String(selectedBrandRow?.id ?? ''));
            const calculatedCpa = partes.cpa;
            const calculatedRev = partes.rev;
            const totalCommission = partes.total;
            // "Configurado como 0" ≠ "ainda não configurado": mesma regra (rateStatus)
            // da tela do admin — antes esta view do próprio afiliado mostrava R$0 como
            // taxa real e o selo "Configurado" fixo, mesmo sem taxa definida. Em
            // "Todas as casas" a pergunta é outra: alguma casa em que ele PRODUZIU
            // ficou sem taxa? Só isso é "não configurado" aqui.
            const semTaxa = isAllBrands ? unratedProducingBrands(myBrandResults, config) : [];
            const statusCasa = rateStatus(
              config,
              isAllBrands ? undefined : String(selectedBrandRow?.id ?? '')
            );
            const cpaConfigured = isAllBrands ? semTaxa.length === 0 : statusCasa.cpaConfigured;
            const revConfigured = isAllBrands ? semTaxa.length === 0 : statusCasa.revConfigured;

            return (
              <div key={idx} className="space-y-8">
                <div className="bg-white dark:bg-neutral-900 p-8 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-sm space-y-6">
                  <div>
                    <div className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-2">
                      Comissão total <InfoTooltip text={REV_ENABLED ? 'Seu ganho no período: CPA Calculado + REV Share, conforme a configuração do seu contrato.' : 'Seu ganho no período: CPA Calculado, conforme a configuração do seu contrato.'} align="left" />
                    </div>
                    <div className="flex items-baseline gap-4">
                      <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white break-words">
                        R$ {totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </h2>
                      {cpaConfigured ? (
                        <div className="flex items-center gap-1 text-brand dark:text-white font-bold text-sm bg-brand/5 dark:bg-white/10 px-2 py-0.5 rounded-lg">
                          <TrendingUp size={16} /> Configurado
                        </div>
                      ) : (
                        <div
                          className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-bold text-sm bg-amber-500/10 px-2 py-0.5 rounded-lg"
                          title={semTaxa.length
                            ? `Sem taxa configurada ${pluralize(semTaxa.length, 'nesta casa', 'nestas casas')}: ${semTaxa.join(', ')}. Fale com a gerência.`
                            : 'O valor de CPA do seu contrato ainda não foi configurado. Fale com a gerência.'}
                        >
                          <AlertCircle size={16} /> CPA não configurado
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Instância que fecha só CPA esconde o REV (VITE_REV_ENABLED=false):
                      o card de CPA fica sozinho e ocupa a linha inteira. */}
                  <div className={REV_ENABLED ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'grid grid-cols-1 gap-4'}>
                    <div className="p-6 bg-slate-50 dark:bg-neutral-800/50 rounded-2xl border border-slate-100 dark:border-neutral-800 flex items-center justify-between group hover:border-brand/20 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-neutral-800 flex items-center justify-center text-slate-400 group-hover:text-brand dark:group-hover:text-white transition-colors shadow-sm text-xs font-black">
                          R$
                        </div>
                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-neutral-300 uppercase tracking-widest mb-1">
                            CPA Calculado{!isAllBrands && cpaConfigured ? ` (R$ ${rates.cpaValue}/CPA)` : ''} <InfoTooltip text="CPA Qualificado × valor de CPA do seu contrato. Quantos cadastros qualificaram, multiplicado pelo valor por aquisição." size={10} align="left" />
                          </div>
                          {cpaConfigured ? (
                            <p className="text-xl font-black text-slate-800 dark:text-white">
                              R$ {calculatedCpa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          ) : (
                            <p className="text-sm font-bold text-amber-600 dark:text-amber-400">Não configurado</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {REV_ENABLED && (
                    <div className="p-6 bg-slate-50 dark:bg-neutral-800/50 rounded-2xl border border-slate-100 dark:border-neutral-800 flex items-center justify-between group hover:border-brand/20 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-neutral-800 flex items-center justify-center text-slate-400 group-hover:text-brand dark:group-hover:text-white transition-colors shadow-sm">
                          <TrendingUp size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-neutral-300 uppercase tracking-widest mb-1">
                            REV Share{!isAllBrands && revConfigured ? ` (${rates.revPercentage}%)` : ''} <InfoTooltip text="Participação na receita: percentual do seu contrato aplicado sobre o RVS (receita compartilhada) do período." size={10} align="left" />
                          </div>
                          {revConfigured ? (
                            <p className="text-xl font-black text-slate-800 dark:text-white">
                              R$ {calculatedRev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          ) : (
                            <p className="text-sm font-bold text-amber-600 dark:text-amber-400">Não configurado</p>
                          )}
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                </div>

                {/* Funil na ordem do painel da Esportiva (call Infinity 12/08) —
                    cliques/qtd de depósitos/ticket médio saem de lib/funnel. */}
                <FunnelGrid
                  rows={[row]}
                  registrationsBadge={<TrendBadge change={isAllBrands ? percentChange(row.registrations || 0, prevRegistrations ?? 0) : 0} />}
                  registrationsSubtitle="Leads Qualificados"
                />

                {/* Per-house breakdown (real data from groupBy=brand) */}
                <BrandBreakdown data={myBrandResults} config={config} />

                {/* Frescor por casa: o painel mistura o clique (nosso, ao vivo)
                    com o resultado da casa (pull horário / upload, D-1). Sem o
                    carimbo o afiliado cobra tempo real de um número que não é. */}
                <DataFreshness className="mb-8" />

              </div>
            );
          })}

          {/* Evolução diária (dados reais da API externa, groupBy=date) */}
          <div className="bg-white dark:bg-neutral-900 border border-slate-100 dark:border-neutral-800 rounded-3xl flex flex-col shadow-sm overflow-hidden mb-20">
            <div className="p-6 border-b border-slate-50 dark:border-neutral-800 flex justify-between items-center bg-slate-50/50 dark:bg-neutral-800/30">
              <h3 className="font-black text-xs text-slate-800 dark:text-white uppercase tracking-widest">Evolução Diária</h3>
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-neutral-800 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Cadastros · Comissão
              </div>
            </div>
            {/* Série reprecificada: o cru plotava total_commission (receita da CASA)
                    como "Comissão" — ver src/lib/affiliateDailySeries.ts. */}
            <DailyPerformanceChart data={buildAffiliateDailySeries(dailyResults, config)} />
          </div>

          {/* Lista de Clientes — desativada: a API de afiliados não expõe dados por
              cliente/jogador. Mantida para reativar caso surja essa fonte de dados.
          <div className="bg-white dark:bg-neutral-900 border border-slate-100 dark:border-neutral-800 rounded-3xl flex flex-col shadow-sm overflow-hidden mb-20">
            <div className="p-6 border-b border-slate-50 dark:border-neutral-800 flex justify-between items-center bg-slate-50/50 dark:bg-neutral-800/30">
              <h3 className="font-black text-xs text-slate-800 dark:text-white uppercase tracking-widest">Lista de Clientes</h3>
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-neutral-800 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {clientRows.length} registros
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-glass-thead dark:bg-glass-thead-dark text-[10px] text-slate-400 uppercase tracking-widest sticky top-0 backdrop-blur-glass-soft z-10 border-b border-slate-100 dark:border-neutral-800">
                  <tr>
                    <th className="px-8 py-5 font-black">Nome</th>
                    <th className="px-8 py-5 font-black">Valor do primeiro depósito</th>
                    <th className="px-8 py-5 font-black">Data de cadastro</th>
                  </tr>
                </thead>
                <tbody>
                  {clientRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-8 py-20 text-center">
                        <div className="flex flex-col items-center gap-2 opacity-30">
                          <User size={32} />
                          <p className="text-xs font-bold uppercase tracking-widest">Lista zerada ate associar os clientes ao ID</p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          */}
        </div>
      </div>
    </div>
  );
}
