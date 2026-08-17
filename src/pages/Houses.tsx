import React, { useEffect, useMemo, useRef, useState } from 'react';
import { pluralize } from '../lib/plural';
import { motion } from 'motion/react';
import { Navigate, Link } from 'react-router-dom';
import {
  Building2, Plus, Loader2, Pencil, Trash2, X, Upload, Link2, Check, Power,
  Table2, AlertTriangle, FileSpreadsheet, Cloud, Calendar, Download, Sparkles,
  ChevronDown, ExternalLink, Tag, RefreshCw, Plug, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  House, HouseInput, fetchHouses, createHouse, updateHouse, deleteHouse, syncKnownBrandsFrom,
  fetchHouseResults, importHouseResults, clearHouseResults, pullHouseResults,
} from '../services/houseService';
import {
  fetchAffiliates, fetchRegisteredUsers, fetchEmailAliases, createBoostAffiliates, createEmailAlias,
  fetchAffiliateLinks, fetchTagAliases, createTagAlias, deleteTagAlias,
} from '../services/affiliateService';
import {
  csvToGrid, parseResultsRows, resolveAffiliates, buildAffiliateLookup, composeLookup,
  ParsedRow, StoredManualRow, TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROWS,
} from '../lib/houseResults';
import {
  adaptHouseTagReport, buildTagIndex, tagLookup, summarizeByTag, tagImportTotals,
  attributedRows, canImportTagReport, TagSummary,
} from '../lib/houseTagImport';
import { buildImportRoster } from '../lib/boostAffiliate';
import { canImport, buildImportPayload } from '../lib/houseImport';
import { parseSpreadsheetFile, downloadResultsTemplate, isExcelFile } from '../lib/xlsx';
import { cn, humanizeName } from '../lib/utils';
import { describeFreshness } from '../lib/freshness';
import {
  HOUSE_PRESETS, HousePreset, buildHouseIconDataUrl, housePresetIconPath, houseLogoOrPreset,
  svgToDataUrl,
} from '../lib/housePresets';
import {
  fetchEurBrlRate, eurToBrl, formatBrl, getCachedEurBrlQuote, EurBrlQuote,
  HouseCpaCurrency, resolveCpaCurrency, parseHouseCpaInput, convertHouseCpaInput,
} from '../lib/currency';
import { fetchIntegrations, type PublicIntegration } from '../services/integrationService';
import { houseResultsMode, houseModePayload, type HouseResultsMode } from '../lib/integrations';
import EntityAuditHistory from '../components/EntityAuditHistory';

// Backoffice de casas (betting houses) — admin. Cria/edita o registro próprio de
// casas (nome/slug/brandId/logo/registerUrlTemplate/ativa) que alimenta logos,
// filtros e o breakdown por casa em todo o app. Fase 1: CRUD + logo. A URL base
// de cadastro (registerUrlTemplate) já é coletada aqui — o tie com os links de
// divulgação (/go) entra na Fase 2.
export default function Houses() {
  const { profile } = useAuth();
  const { push } = useToast();
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; house?: House }>({ open: false });
  const [resultsModal, setResultsModal] = useState<{ open: boolean; house?: House }>({ open: false });
  const [confirmDel, setConfirmDel] = useState<House | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pulling, setPulling] = useState<string | null>(null); // id da casa sendo puxada da API

  const isAdmin = profile?.role === 'admin';

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchHouses();
      setHouses(data);
      syncKnownBrandsFrom(data); // mantém o cache vivo de marcas em dia
    } catch {
      push({ type: 'error', message: 'Não foi possível carregar as casas.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Puxa o relatório direto da API da casa (Esportiva/TAP). É a MESMA rota que o
  // cron horário chama — aqui é o "agora", para o admin não esperar a virada da hora.
  // Passa a casa CLICADA: o servidor rejeita casa que não é a do conector.
  const handlePull = async (house: House) => {
    setPulling(house.id);
    try {
      const r = await pullHouseResults(house.slug);
      const pend = r.pending?.length
        ? ` · ${pluralize(r.pending.length, 'tag')} sem dono: ${r.pending.slice(0, 3).map((p) => p.tag).join(', ')}`
        : '';
      push({
        type: r.pending?.length ? 'info' : 'success',
        message: `${pluralize(r.imported, 'linha')} de ${r.dateFrom} a ${r.dateTo} · ${pluralize(r.attributed, 'atribuída')}${pend}`,
      });
      // Régua de CPA trocada no meio do período: a contagem sai de dividir o
      // dinheiro pela base, então resto > 0 é sinal de que a base mudou (§9.5).
      // A régua que o conector divide vive no doc da INTEGRAÇÃO (`config.cpaBase`),
      // não no `defaultCpa` desta tela — a mensagem antiga mandava o admin editar a
      // casa, onde nenhum ajuste muda o resto da divisão.
      if (r.cpaRemainder) {
        push({ type: 'error', message: `Atenção: sobrou R$ ${r.cpaRemainder} na conta do CPA. Ajuste a régua do conector em Integrações (valor do CPA na casa).` });
      }
      await load();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Falha ao puxar da API da casa.' });
    } finally {
      setPulling(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      await deleteHouse(confirmDel.id);
      push({ type: 'success', message: `Casa "${confirmDel.name}" removida.` });
      setConfirmDel(null);
      await load();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao remover a casa.' });
    } finally {
      setDeleting(false);
    }
  };

  if (profile && !isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-8 pb-12">
      {modal.open && (
        <HouseModal
          house={modal.house}
          onClose={() => setModal({ open: false })}
          onSaved={async () => { setModal({ open: false }); await load(); }}
        />
      )}

      {resultsModal.open && resultsModal.house && (
        <HouseResultsModal house={resultsModal.house} onClose={() => setResultsModal({ open: false })} />
      )}

      {confirmDel && (
        <ConfirmDeleteModal
          house={confirmDel}
          loading={deleting}
          onClose={() => setConfirmDel(null)}
          onConfirm={handleDelete}
        />
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
            Backoffice
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
            <span className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/20">
              <Building2 size={24} className="text-accent-500" />
            </span>
            Casas
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2 max-w-xl">
            Registro das casas de aposta exibidas no app (logo, marca da OTG e URL de cadastro).
            Adicione e atualize casas manualmente, sem precisar de deploy.
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:opacity-90 transition-all shadow-sm self-start"
        >
          <Plus size={14} />
          Nova casa
        </button>
      </header>

      {loading ? (
        <div className="p-24 flex flex-col items-center justify-center gap-4">
          <Loader2 size={40} className="text-accent-500 animate-spin" />
          <p className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest animate-pulse">Carregando casas...</p>
        </div>
      ) : houses.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm p-24 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl border border-accent-200/70 dark:border-accent-900/40 bg-accent-50 dark:bg-accent-950/30 text-accent-500 mb-4">
            <Building2 size={24} />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100 mb-1">Nenhuma casa cadastrada</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 max-w-xs mx-auto">
            Cadastre a primeira casa para que ela apareça nos filtros e no desempenho por casa.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {houses.map((h, idx) => (
            <motion.div
              key={h.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="group relative overflow-hidden p-6 rounded-2xl border bg-white dark:bg-neutral-900/60 border-slate-200/70 dark:border-neutral-800 shadow-sm hover:border-accent-300 dark:hover:border-accent-800 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <HouseLogo house={h} size={44} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{h.name}</p>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-neutral-500 mt-0.5 truncate">{h.slug}</p>
                  </div>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  h.active
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : 'bg-slate-100 dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-slate-400 dark:text-neutral-500'
                }`}>
                  <Power size={10} /> {h.active ? 'Ativa' : 'Inativa'}
                </span>
              </div>

              <dl className="space-y-2 mb-5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400 dark:text-neutral-500 font-medium">Resultados</dt>
                  {/* 3 modos, o mesmo do modal: casa com conector NÃO é "upload
                      manual" — ela puxa sozinha. [[houseResultsMode]] */}
                  <dd>
                    {houseResultsMode(h) === 'otg' ? (
                      <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 font-semibold"><Cloud size={11} /> Automático (OTG)</span>
                    ) : houseResultsMode(h) === 'integration' ? (
                      <span
                        className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold"
                        title={`Integração: ${h.integration}`}
                      >
                        <Plug size={11} /> Pull automático
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-accent-600 dark:text-accent-400 font-semibold"><FileSpreadsheet size={11} /> Upload manual</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400 dark:text-neutral-500 font-medium flex items-center gap-1"><Link2 size={11} /> URL de cadastro</dt>
                  <dd className="text-slate-600 dark:text-neutral-300 truncate max-w-[60%]" title={h.registerUrlTemplate || ''}>
                    {h.registerUrlTemplate
                      ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold"><Check size={11} /> definida</span>
                      : <span className="text-slate-300 dark:text-neutral-600">—</span>}
                  </dd>
                </div>
                {/* Frescor: o MESMO carimbo que o afiliado vê no painel dele. */}
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400 dark:text-neutral-500 font-medium flex items-center gap-1"><RefreshCw size={11} /> Dados atualizados</dt>
                  <dd className="truncate max-w-[60%]" title={h.lastResultsDate ? `cobre até ${h.lastResultsDate}` : ''}>
                    {(() => {
                      const f = describeFreshness(h.lastResultsSyncAt);
                      // Checagem ≠ dado: rodada vazia carimba lastResultsCheckAt sem
                      // mexer no frescor. Mostrada só quando é mais nova que o dado —
                      // é o que separa "robô quebrado" de "sem dado novo".
                      const check = describeFreshness(h.lastResultsCheckAt);
                      const showCheck =
                        check.minutes !== null && (f.minutes === null || check.minutes < f.minutes);
                      return (
                        <span className={cn('font-semibold', f.stale ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                          {f.label}
                          {h.lastResultsSyncSource === 'api' && f.minutes !== null ? ' · API' : ''}
                          {showCheck && (
                            <span className="font-medium text-slate-400 dark:text-neutral-500"> · verificada {check.label}</span>
                          )}
                        </span>
                      );
                    })()}
                  </dd>
                </div>
              </dl>

              {h.dataSource === 'manual' && (
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setResultsModal({ open: true, house: h })}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent-500/10 border border-accent-500/30 text-xs font-bold text-accent-600 dark:text-accent-400 hover:bg-accent-500/20 transition-all"
                  >
                    <Table2 size={14} /> Importar resultados
                  </button>
                  {/* Só a casa com integração DIRETA (anotada pelo servidor) tem o
                      que "atualizar" — nas demais o botão puxava a Esportiva. */}
                  {h.pullAvailable && (
                    <button
                      onClick={() => handlePull(h)}
                      disabled={pulling === h.id}
                      title="Puxar o relatório direto da API da casa (o mesmo que o robô faz de hora em hora)"
                      className="shrink-0 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-300 hover:border-accent-500/40 hover:text-accent-500 transition-all disabled:opacity-50"
                    >
                      {pulling === h.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Atualizar
                    </button>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setModal({ open: true, house: h })}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60 text-xs font-bold text-slate-600 dark:text-neutral-200 hover:border-accent-500/40 hover:text-accent-600 dark:hover:text-accent-400 transition-all"
                >
                  <Pencil size={13} /> Editar
                </button>
                <button
                  onClick={() => setConfirmDel(h)}
                  className="flex items-center justify-center px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60 text-slate-400 dark:text-neutral-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/40 transition-all"
                  title="Remover casa"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// Logo da casa: renderiza a URL direto (Storage/asset) com fallback de inicial.
// Sem logo gravada, usa o ícone do preset da casa conhecida — casas criadas antes
// dos presets também aparecem coloridas, sem ninguém precisar reeditá-las.
function HouseLogo({ house, size = 40 }: { house: House; size?: number }) {
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size } as React.CSSProperties;
  const logo = houseLogoOrPreset(house.logo, house.slug, house.id, house.name);
  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt={house.name}
        style={dim}
        onError={() => setFailed(true)}
        className="rounded-xl object-contain bg-white border border-slate-100 dark:border-neutral-700 shrink-0"
      />
    );
  }
  return (
    <span style={dim} className="rounded-xl bg-accent-500 text-accent-contrast flex items-center justify-center font-black text-sm shrink-0">
      {(house.name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

// Seletor de presets: grade com as casas mais conhecidas E autorizadas pelo SPA/MF
// (catálogo em src/lib/housePresets.ts). Escolher uma preenche nome/slug e carrega o
// ícone na cor de marca da casa — que entra pelo MESMO caminho do upload manual
// (data URL → uploadHouseLogo no servidor), sem rota nova e sem mudança no backend.
function PresetPicker({
  selected, editing, onPick,
}: { selected: string | null; editing: boolean; onPick: (preset: HousePreset) => void }) {
  // Ao CRIAR, o preset é o caminho mais provável — abre aberto. Ao editar, a casa já
  // tem identidade; o seletor fica recolhido pra não competir com os campos.
  const [open, setOpen] = useState(!editing);
  const sel = HOUSE_PRESETS.find((p) => p.slug === selected) ?? null;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800/60 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-neutral-200">
          <Sparkles size={13} className="text-accent-500" />
          Usar um preset de casa
          <span className="font-medium text-slate-400 dark:text-neutral-500">({HOUSE_PRESETS.length})</span>
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="p-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {HOUSE_PRESETS.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => onPick(p)}
                title={`${p.name} · ${p.site}`}
                aria-pressed={selected === p.slug}
                className={`p-1 rounded-xl border-2 transition-all ${
                  selected === p.slug
                    ? 'border-accent-500 scale-105'
                    : 'border-transparent hover:border-slate-300 dark:hover:border-neutral-600'
                }`}
              >
                <img src={housePresetIconPath(p)} alt={p.name} className="w-9 h-9 rounded-lg block" />
              </button>
            ))}
          </div>

          {sel && (
            <div className="rounded-xl bg-slate-50 dark:bg-neutral-800/60 px-3 py-2.5 space-y-1">
              <p className="text-xs font-bold text-slate-700 dark:text-neutral-100">
                {sel.name} <span className="font-mono font-medium text-slate-400 dark:text-neutral-500">· {sel.site}</span>
              </p>
              <p className="text-[10px] text-slate-500 dark:text-neutral-400">
                {sel.legalEntity}, autorizada pela {sel.spaPortaria}
              </p>
              <div className="flex flex-wrap gap-3 pt-0.5">
                <a
                  href={`https://${sel.site}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-accent-500 hover:underline"
                >
                  <ExternalLink size={10} /> site oficial
                </a>
                {sel.officialLogoUrl && (
                  <a
                    href={sel.officialLogoUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-accent-500 hover:underline"
                  >
                    <Download size={10} /> baixar a logo oficial
                  </a>
                )}
              </div>
            </div>
          )}

          <p className="text-[10px] leading-relaxed text-slate-400 dark:text-neutral-500">
            O ícone do preset é gerado na cor de marca da casa; <strong>não é a logo oficial</strong>.
            Para usar a logo real, baixe no site da casa e clique em “Trocar logo”.
          </p>
        </div>
      )}
    </div>
  );
}

// --- Modal de criar/editar casa ---------------------------------------------
function HouseModal({ house, onClose, onSaved }: { house?: House; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { push } = useToast();
  const editing = !!house;
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(house?.name ?? '');
  const [slugTouched, setSlugTouched] = useState(editing);
  const [slug, setSlug] = useState(house?.slug ?? '');
  const [brandId, setBrandId] = useState(house?.brandId ?? '');
  // Congelado na abertura: decide se o campo de brandId existe nesta edição. Ver o
  // gate lá embaixo — o estado vivo faria o input sumir ao esvaziar o campo.
  const [hadBrandId] = useState(() => (house?.brandId ?? '').trim() !== '');
  const [registerUrlTemplate, setRegisterUrlTemplate] = useState(house?.registerUrlTemplate ?? '');
  const [active, setActive] = useState(house?.active ?? true);
  // Origem dos resultados em 3 modos. `dataSource` + `integration` são dois
  // campos no banco; o seletor fala em modo e a gravação recompõe os dois
  // (src/lib/integrations.ts). Antes o modal olhava só o `dataSource` e mostrava
  // "Upload manual" numa casa que puxa sozinha, como a Esportiva.
  const [mode, setMode] = useState<HouseResultsMode>(() => houseResultsMode(house));
  const [integrationId, setIntegrationId] = useState(house?.integration ?? '');
  const [integrations, setIntegrations] = useState<PublicIntegration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);
  // Taxa padrão da casa (comissão casa→agência) — string no input, parseada no save.
  // O defaultCpa é gravado NA MOEDA DA CASA (`cpaCurrency`): em EUR (inteiro) a
  // conversão p/ R$ sai da cotação ao vivo no cálculo da comissão; em BRL o valor
  // gravado é o próprio R$ acordado — casa brasileira paga em real e o valor exato
  // (com centavos) não cabia na régua de euro inteiro.
  const [defaultCpa, setDefaultCpa] = useState<string>(house?.defaultCpa != null ? String(house.defaultCpa) : '');
  const [cpaCurrency, setCpaCurrency] = useState<HouseCpaCurrency>(() => resolveCpaCurrency(house?.cpaCurrency));
  const [defaultRev, setDefaultRev] = useState<string>(house?.defaultRev != null ? String(house.defaultRev) : '');
  const [issPercent, setIssPercent] = useState<string>(house?.issPercent != null ? String(house.issPercent) : '');
  // Toggle "REV no lucro líquido" (call 12/08). Ausente no doc = true (como sempre foi).
  const [revInProfit, setRevInProfit] = useState<boolean>(house?.revInProfit !== false);
  const [eurQuote, setEurQuote] = useState<EurBrlQuote>(() => getCachedEurBrlQuote());
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [presetSlug, setPresetSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Cotação EUR→BRL ao vivo (AwesomeAPI) p/ o preview do CPA em R$.
  useEffect(() => { fetchEurBrlRate().then(setEurQuote).catch(() => {}); }, []);

  // Conectores registrados em /integracoes — é de lá que sai a lista de opções
  // do modo "Pull automático". Falha de rede não trava o modal: sem lista, o
  // modo fica indisponível e o resto do formulário segue salvável.
  useEffect(() => {
    fetchIntegrations()
      .then(setIntegrations)
      .catch(() => setIntegrations([]))
      .finally(() => setLoadingIntegrations(false));
  }, []);

  const selectedIntegration = integrations.find((i) => i.id === integrationId) ?? null;

  const autoSlug = useMemo(
    () => name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    [name]
  );
  const effectiveSlug = slugTouched ? slug : autoSlug;
  const logoPreview = logoBase64 ?? house?.logo ?? null;

  // Aplica um preset. Ao CRIAR, adota também nome e slug canônicos da casa (o slug
  // do preset é fixado à mão porque o autoSlug do nome divergiria em alguns casos —
  // "F12.Bet" viraria "f12-bet", e o slug é o id do documento). Ao EDITAR, mexe só
  // no ícone: nome e slug já estão em uso por dados históricos.
  const applyPreset = async (preset: HousePreset) => {
    setPresetSlug(preset.slug);
    if (!editing) {
      setName(preset.name);
      setSlugTouched(true);
      setSlug(preset.slug);
    }
    // Casa com logo OFICIAL tem o SVG com a arte embutida — não dá pra remontar a
    // partir do catálogo. Buscamos o asset gerado (mesma origem, ~10kb, cacheado) e
    // só caímos no monograma se o fetch falhar.
    try {
      const res = await fetch(housePresetIconPath(preset));
      if (!res.ok) throw new Error(String(res.status));
      setLogoBase64(svgToDataUrl(await res.text()));
    } catch {
      setLogoBase64(buildHouseIconDataUrl(preset));
    }
  };

  const onPickFile = (file?: File) => {
    if (!file) return;
    setPresetSlug(null); // upload manual vence o preset
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/i.test(file.type)) {
      push({ type: 'error', message: 'Use PNG, JPG, WEBP ou SVG.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      push({ type: 'error', message: 'Logo muito grande (máx. 2MB).' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoBase64(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!name.trim()) { push({ type: 'error', message: 'Informe o nome da casa.' }); return; }
    if (mode === 'integration' && !integrationId) {
      push({ type: 'error', message: 'Escolha a integração que vai puxar os resultados desta casa.' });
      return;
    }
    setSaving(true);
    try {
      const payload: HouseInput = {
        name: name.trim(),
        slug: effectiveSlug,
        brandId: brandId.trim() || null,
        registerUrlTemplate: registerUrlTemplate.trim() || null,
        active,
        ...houseModePayload(mode, integrationId),
        // Valor na moeda escolhida (EUR inteiro / BRL com centavos) + a moeda, que
        // viajam SEMPRE juntos: é ela que decide se o número será convertido.
        defaultCpa: parseHouseCpaInput(defaultCpa, cpaCurrency),
        cpaCurrency,
        defaultRev: defaultRev.trim() === '' ? null : Number(defaultRev),
        issPercent: issPercent.trim() === '' ? null : Number(issPercent),
        revInProfit,
        ...(logoBase64 ? { logoBase64 } : {}),
      };
      if (editing && house) {
        await updateHouse(house.id, payload);
        push({ type: 'success', message: `Casa "${payload.name}" atualizada.` });
      } else {
        await createHouse(payload);
        push({ type: 'success', message: `Casa "${payload.name}" criada.` });
      }
      await onSaved();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao salvar a casa.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto mb-0" onClick={onClose}>
      <div className="min-h-full flex items-center justify-center p-4 pb-0">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-800 max-h-[calc(100vh_-_2rem)] flex flex-col"
        >
          <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100 dark:border-neutral-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 size={18} className="text-accent-500" />
              {editing ? 'Editar casa' : 'Nova casa'}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-600 dark:hover:text-neutral-200 transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-5 overflow-y-auto">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <div className="shrink-0">
                {logoPreview ? (
                  <img src={logoPreview} alt="logo" className="w-16 h-16 rounded-2xl object-contain bg-white border border-slate-200 dark:border-neutral-700" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-accent-500 text-accent-contrast flex items-center justify-center font-black text-xl">
                    {(name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0])} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-200 hover:border-accent-500/40 transition-all"
                >
                  <Upload size={13} /> {logoPreview ? 'Trocar logo' : 'Enviar logo'}
                </button>
                <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1.5">PNG, JPG, WEBP ou SVG · máx. 2MB</p>
              </div>
            </div>

            <PresetPicker selected={presetSlug} editing={editing} onPick={applyPreset} />

            <Field label="Nome">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Betano"
                className={inputCls}
              />
            </Field>

            <Field label="Slug" hint="identificador único (usado em URLs/logo)">
              <input
                value={effectiveSlug}
                onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
                placeholder="ex-betano"
                className={`${inputCls} font-mono`}
                disabled={editing}
              />
              {editing && <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1">O slug não pode ser alterado após a criação.</p>}
            </Field>

            <Field label="URL de cadastro" hint="opcional · use {ref} onde entra o código do afiliado">
              <input
                value={registerUrlTemplate}
                onChange={(e) => setRegisterUrlTemplate(e.target.value)}
                placeholder="https://casa.bet.br/register?wm={ref}"
                className={`${inputCls} font-mono`}
              />
            </Field>

            <Field label="Origem dos resultados">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: 'otg' as const, icon: Cloud, title: 'Automático (OTG)', desc: 'vem da API externa' },
                  { v: 'integration' as const, icon: Plug, title: 'Pull automático', desc: 'via integração' },
                  { v: 'manual' as const, icon: FileSpreadsheet, title: 'Upload manual', desc: 'planilha/CSV' },
                ]).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setMode(opt.v)}
                    className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all ${
                      mode === opt.v
                        ? 'border-accent-500 bg-accent-500/10'
                        : 'border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600'
                    }`}
                  >
                    <span className={`flex items-center gap-1.5 text-xs font-bold ${mode === opt.v ? 'text-accent-600 dark:text-accent-400' : 'text-slate-700 dark:text-neutral-200'}`}>
                      <opt.icon size={13} /> {opt.title}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-neutral-500">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </Field>

            {/* O brandId é 100% acoplado à OTG (é o id da casa NA API externa): só faz
                sentido no modo "Automático (OTG)". Numa casa gerida aqui ele é ruído.
                Fica visível também quando a casa JÁ ABRIU com um id gravado (`hadBrandId`,
                congelado na montagem): gatear pelo estado VIVO desmontaria o input no
                meio da digitação, no instante em que o campo ficasse vazio. */}
            {(mode === 'otg' || hadBrandId) && (
              <Field
                label="brandId (OTG)"
                hint={mode === 'otg'
                  ? 'opcional: id da casa na OTG, se conhecido'
                  : 'id herdado da OTG. As taxas POR CASA dos afiliados estão gravadas sob ele; apagar faz cada um cair na taxa de topo, sem aviso.'}
              >
                <input
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  placeholder="ex.: cmm5dhdqm000e19b58dqc549a"
                  className={`${inputCls} font-mono`}
                />
              </Field>
            )}

            {/* Vínculo casa→conector. A lista vem de /integracoes, que é onde as
                integrações são registradas; aqui só se escolhe qual serve ESTA casa. */}
            {mode === 'integration' && (
              <Field
                label="Integração que puxa os resultados"
                hint="Registrada em Integrações. É o que liga o botão “Atualizar” no card da casa e o robô que roda de hora em hora."
              >
                {loadingIntegrations ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-neutral-500 py-2">
                    <Loader2 size={13} className="animate-spin" /> Carregando integrações…
                  </div>
                ) : integrations.length === 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 py-1">
                    Nenhuma integração disponível nesta instância. Cadastre uma em <b>Integrações</b> antes de vincular.
                  </p>
                ) : (
                  <>
                    <select
                      value={integrationId}
                      onChange={(e) => setIntegrationId(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— escolha a integração —</option>
                      {integrations.map((i) => (
                        <option key={i.id} value={i.id}>{i.label}</option>
                      ))}
                    </select>
                    {selectedIntegration && (
                      <p className={cn(
                        'mt-2 text-[11px] leading-relaxed',
                        selectedIntegration.configured
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400',
                      )}>
                        {selectedIntegration.configured ? (
                          <>Integração ativa e com chave configurada: esta casa passa a receber os resultados por ela.</>
                        ) : selectedIntegration.enabled ? (
                          <>Esta integração ainda <b>não tem chave</b>. O vínculo é salvo, mas o pull só funciona depois de informar a chave em Integrações.</>
                        ) : (
                          <>Esta integração está <b>desligada</b>. O vínculo é salvo, mas nada será puxado até religá-la em Integrações.</>
                        )}
                        {selectedIntegration.houseId && selectedIntegration.houseId !== effectiveSlug && (
                          <> Hoje ela está vinculada a outra casa (<b>{selectedIntegration.houseId}</b>); salvar move o vínculo para cá.</>
                        )}
                      </p>
                    )}
                  </>
                )}
              </Field>
            )}

            {/* A taxa padrão da casa é uma DECLARAÇÃO: a agência informa o que a casa
                paga porque ninguém lhe conta. Numa casa com pull isso se inverte — a
                própria casa conta (comissão, RVS e a parcela CPA vêm na resposta), e o
                bloco inteiro fica inerte: o REV nunca é lido (a derivação só roda com
                `total_commission` ausente, e o pull sempre a traz) e o CPA virou um
                segundo lugar para a MESMA régua que o conector lê de /integracoes. Em
                vez de pedir de novo um número que já existe, apontamos para a fonte. */}
            {mode === 'integration' && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-neutral-800/40 border border-slate-100 dark:border-neutral-800 space-y-2">
                <p className="text-xs font-bold text-slate-700 dark:text-neutral-200 flex items-center gap-2">
                  <Plug size={14} className="text-emerald-500" /> Taxas: quem informa é a casa
                </p>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-neutral-400">
                  A comissão, o RVS e a parcela de CPA chegam prontos na resposta da API, então
                  não há taxa padrão para declarar aqui. Se a casa mudar o valor do CPA, o ajuste
                  é na régua do conector, em <b>Integrações</b>: é ela que converte o dinheiro
                  em contagem de CPAs.
                </p>
                <Link
                  to="/integracoes"
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-accent-600 dark:text-accent-400 hover:underline"
                >
                  Abrir Integrações <ExternalLink size={11} />
                </Link>
              </div>
            )}

            {mode === 'manual' && (
              <Field label="Taxa padrão da casa" hint="RECEITA: o que a casa paga à AGÊNCIA. NÃO é o repasse ao afiliado (esse fica em Afiliados). Usada p/ derivar a comissão quando a planilha não traz a coluna 'comissao'. Informe na MOEDA em que a casa paga: em euro convertemos pela cotação do dia; em real gravamos o valor exato. Sem isto, o lucro por casa fica negativo.">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">CPA (por CPA)</span>
                      {/* Moeda em que a CASA paga. Trocar aqui CONVERTE o valor já
                          digitado (preserva o R$ efetivo) — senão "30" viraria R$ 30
                          e a comissão da casa despencaria sem ninguém notar. */}
                      <div className="flex rounded-lg border border-slate-200 dark:border-neutral-700 overflow-hidden">
                        {(['EUR', 'BRL'] as const).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              if (c === cpaCurrency) return;
                              // Sem cotação AO VIVO não dá p/ converter: o valor em R$
                              // é GRAVADO (não recalculado a cada render como o euro),
                              // então converter pelo fallback congelaria o número errado
                              // — €30 viraria R$ 180 em vez de R$ 177 e ficaria assim.
                              // Campo vazio pode trocar à vontade (não há o que converter).
                              if (!eurQuote.live && defaultCpa.trim() !== '') {
                                push({
                                  type: 'error',
                                  message: 'Cotação do euro indisponível agora. Sem ela a conversão gravaria um valor errado; apague o campo para trocar a moeda e digite o valor na moeda nova.',
                                });
                                return;
                              }
                              setDefaultCpa(convertHouseCpaInput(defaultCpa, cpaCurrency, c, eurQuote.rate));
                              setCpaCurrency(c);
                            }}
                            className={cn(
                              'px-2 py-0.5 text-[10px] font-bold transition-colors',
                              cpaCurrency === c
                                ? 'bg-accent-500 text-accent-contrast'
                                : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'
                            )}
                          >
                            {c === 'EUR' ? '€ EUR' : 'R$ BRL'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500 text-sm font-semibold">
                        {cpaCurrency === 'BRL' ? 'R$' : '€'}
                      </span>
                      <input
                        type="text"
                        inputMode={cpaCurrency === 'BRL' ? 'decimal' : 'numeric'}
                        value={defaultCpa}
                        onChange={(e) => setDefaultCpa(
                          // EUR é inteiro (a casa informa euro cheio); BRL aceita
                          // centavos com um separador só (vírgula ou ponto).
                          cpaCurrency === 'BRL'
                            ? e.target.value.replace(/[^0-9.,]/g, '').replace(/([.,])(?=.*[.,])/g, '')
                            : e.target.value.replace(/[^0-9]/g, '')
                        )}
                        placeholder={cpaCurrency === 'BRL' ? 'ex.: 120,00' : 'ex.: 30'}
                        className={`${inputCls} ${cpaCurrency === 'BRL' ? 'pl-9' : 'pl-7'}`}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400 dark:text-neutral-500">
                      {cpaCurrency === 'BRL' ? (
                        <>Valor <b>exato</b> pago pela casa, não varia com o câmbio.</>
                      ) : defaultCpa.trim() === '' ? (
                        <>1 € = {formatBrl(eurQuote.rate)}{!eurQuote.live && ' · cotação indisponível'}</>
                      ) : (
                        <>≈ <b className="text-emerald-600 dark:text-emerald-400">{formatBrl(eurToBrl(Number(defaultCpa), eurQuote.rate))}</b> por CPA · 1 € = {formatBrl(eurQuote.rate)}{!eurQuote.live && ' (estimada)'}</>
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="block mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">REV (% do RVS)</span>
                    <input
                      type="number" inputMode="decimal" min="0" max="100" step="any"
                      value={defaultRev}
                      onChange={(e) => setDefaultRev(e.target.value)}
                      placeholder="ex.: 25"
                      className={inputCls}
                    />
                  </div>
                </div>
              </Field>
            )}

            {/* Toggle da call Infinity 12/08: com REV fora, o lucro líquido desta
                casa no /admin vira CPA-only nos DOIS lados (só a parcela CPA da
                comissão + repasse só CPA). NÃO muda a comissão exibida ao afiliado.
                Só p/ casa gerida aqui — na OTG a comissão é opaca, sem split.
                A parcela CPA sai de `cpa_commission` quando a fonte a separou (todo
                pull separa) e da régua da casa só na planilha. [[houseCpaCommissionForRow]] */}
            {mode !== 'otg' && (
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-neutral-800/40 border border-slate-100 dark:border-neutral-800 cursor-pointer">
                <span className="text-sm font-semibold text-slate-700 dark:text-neutral-200 flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <TrendingUp size={15} className={revInProfit ? 'text-emerald-500' : 'text-slate-400'} />
                    REV compõe o lucro líquido
                  </span>
                  <span className="text-[10px] font-normal text-slate-400 dark:text-neutral-500">
                    Desligado: o lucro desta casa no painel do master considera só o eixo CPA
                    (a parcela CPA da comissão e o repasse sem a parcela REV). A comissão do
                    afiliado não muda.
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={revInProfit}
                  onClick={() => setRevInProfit((v) => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${revInProfit ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-neutral-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${revInProfit ? 'translate-x-5' : ''}`} />
                </button>
              </label>
            )}

            {/* ISS vale para QUALQUER casa (OTG ou manual): o repasse ao afiliado é
                tributado independentemente da origem do resultado. Por isso fica
                fora do bloco de taxas padrão, que só existe p/ casa manual. */}
            <Field label="ISS retido no repasse (%)">
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 items-start">
                <input
                  type="number" inputMode="decimal" min="0" max="100" step="any"
                  value={issPercent}
                  onChange={(e) => setIssPercent(e.target.value)}
                  placeholder="ex.: 5"
                  className={inputCls}
                />
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 leading-relaxed sm:pt-3">
                  A alíquota <b>varia por casa</b>. Em branco = <b>sem retenção</b>: o afiliado
                  recebe o repasse bruto. O extrato dele mostra bruto, ISS e líquido separados.
                </p>
              </div>
            </Field>

            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-neutral-800/40 border border-slate-100 dark:border-neutral-800 cursor-pointer">
              <span className="text-sm font-semibold text-slate-700 dark:text-neutral-200 flex items-center gap-2">
                <Power size={15} className={active ? 'text-emerald-500' : 'text-slate-400'} />
                Casa ativa
                <span className="text-[10px] font-normal text-slate-400 dark:text-neutral-500">(aparece nos filtros e no desempenho por casa)</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => setActive((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-neutral-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-5' : ''}`} />
              </button>
            </label>

            {/* Trilha de auditoria desta casa (admin-only): ciclo de vida da casa +
                import/clear de resultados (ambos chaveados pelo slug). [[boost-audit-trail]] */}
            {editing && house && (
              <EntityAuditHistory entityType={['house', 'house_results']} entityId={house.id} title="Histórico da casa" />
            )}
          </div>

          <div className="flex gap-3 p-6 pt-4 border-t border-slate-100 dark:border-neutral-800">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent-500 text-accent-contrast text-xs font-bold hover:bg-accent-600 disabled:opacity-60 transition-all"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {editing ? 'Salvar' : 'Criar casa'}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ house, loading, onClose, onConfirm }: { house: House; loading: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="min-h-full flex items-center justify-center p-4 pb-0">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-800 p-6"
        >
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-red-500 mb-4">
            <Trash2 size={20} />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Remover "{house.name}"?</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mb-5">
            A casa some dos filtros e do desempenho por casa. Dados já gravados nos afiliados não são apagados. Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-all">
              Cancelar
            </button>
            <button onClick={onConfirm} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-60 transition-all">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Remover
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// --- Modal de import de resultados (planilha/CSV) ---------------------------
function HouseResultsModal({ house, onClose }: { house: House; onClose: () => void }) {
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [roster, setRoster] = useState<Parameters<typeof buildAffiliateLookup>[0]>([]);
  const [links, setLinks] = useState<{ affiliateId?: string | null; registerUrl?: string | null; tag?: string | null }[]>([]);
  const [tagAliases, setTagAliases] = useState<{ tag: string; affiliateId: string }[]>([]);
  const [existing, setExisting] = useState<StoredManualRow[]>([]);
  const [text, setText] = useState('');
  const [fileGrid, setFileGrid] = useState<string[][] | null>(null); // planilha Excel (matriz crua)
  const [fileName, setFileName] = useState('');
  const [sheetInfo, setSheetInfo] = useState<{ sheetName: string; sheetNames: string[]; matched: boolean } | null>(null);
  const [reading, setReading] = useState(false);
  const [analysis, setAnalysis] = useState<ReturnType<typeof resolveAffiliates> | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]); // linhas cruas (resumo por tag)
  const [parseErrors, setParseErrors] = useState<{ line: number; message: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [creating, setCreating] = useState(false);          // "Cadastrar na Boost" em andamento
  const [generateInvite, setGenerateInvite] = useState(false);
  const [linkingLine, setLinkingLine] = useState<number | null>(null); // qual não-resolvido está sendo vinculado
  const [linkQuery, setLinkQuery] = useState('');
  const [linkingTag, setLinkingTag] = useState<string | null>(null);   // qual tag está sendo vinculada
  const [tagQuery, setTagQuery] = useState('');
  const [savingTag, setSavingTag] = useState(false);
  const [tagMode, setTagMode] = useState(false);                        // arquivo = relatório da casa por tag

  // Nome do afiliado (p/ rotular a tag já resolvida sem re-consultar o roster).
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roster as any[]) if (r?.id && r?.name) m.set(String(r.id), String(r.name));
    return m;
  }, [roster]);

  // Índice tag -> afiliado: links já emitidos (a tag sai da registerUrl) + apelidos
  // salvos, com o apelido sobrepondo o link.
  const tagIndex = useMemo(() => buildTagIndex(links, tagAliases), [links, tagAliases]);

  // O lookup do import compõe as duas chaves NESSA ordem: TAG primeiro (é a chave que
  // a própria casa usa para atribuir, e é exata), roster por e-mail/nome depois.
  const lookup = useMemo(
    () => composeLookup(tagLookup(tagIndex, (id) => nameById.get(id)), buildAffiliateLookup(roster)),
    [tagIndex, nameById, roster],
  );

  const loadMeta = async () => {
    setLoadingMeta(true);
    try {
      // Roster de cruzamento (Boost-first): nome vem do mirror `affiliates` (OTG +
      // nativos Boost); e-mails vêm dos logins da plataforma + dos aliases admin.
      // Assim casa por e-mail mesmo quem não tem id na OTG, bastando ter cadastro Boost.
      // Links + apelidos de tag alimentam o cruzamento por TAG (relatório da casa).
      const [affs, users, aliases, rows, linkList, tags] = await Promise.all([
        fetchAffiliates(),
        fetchRegisteredUsers(),
        fetchEmailAliases(),
        fetchHouseResults({ houseSlug: house.slug }),
        fetchAffiliateLinks(),
        fetchTagAliases(),
      ]);
      setRoster(buildImportRoster(affs as any, users as any, aliases as any));
      setExisting(Array.isArray(rows) ? rows : []);
      setLinks(Array.isArray(linkList) ? (linkList as any) : []);
      setTagAliases(Array.isArray(tags) ? (tags as any) : []);
    } catch {
      push({ type: 'error', message: 'Não foi possível carregar afiliados/resultados.' });
    } finally {
      setLoadingMeta(false);
    }
  };

  // Afiliados existentes p/ o "Vincular a existente" (nome + e-mails p/ desambiguar
  // homônimos — ex.: dois "Thales" distintos no roster). A busca casa por nome, id OU
  // e-mail, então o operador pode colar o próprio e-mail da linha pra achar o dono.
  const allOptions = useMemo(
    () =>
      (roster as any[])
        .filter((r) => r.name && String(r.name).trim())
        .map((r) => ({ id: r.id as string, name: humanizeName(String(r.name)), emails: (r.emails as string[]) || [] }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [roster],
  );
  const filterOptions = (query: string) => {
    const q = query.trim().toLowerCase();
    return allOptions
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.emails.some((e) => e.toLowerCase().includes(q)))
      .slice(0, 30);
  };
  const linkOptions = useMemo(() => filterOptions(linkQuery), [allOptions, linkQuery]);
  // Mesma busca, para o seletor de dono da TAG.
  const tagOptions = useMemo(() => filterOptions(tagQuery), [allOptions, tagQuery]);

  // Cadastra os não-resolvidos como afiliados nativos Boost (nome+email+casa) e
  // reanalisa — as linhas passam a casar na hora.
  const handleCreateBoost = async () => {
    const unresolved = analysis?.unresolved ?? [];
    const toCreate = unresolved
      .map((u) => ({ name: (u.name || u.email || '').trim(), email: (u.email || '').trim(), house: house.name }))
      .filter((a) => a.name);
    if (!toCreate.length) return;
    setCreating(true);
    try {
      const created = await createBoostAffiliates(toCreate, { generateInvite });
      const invites = created.filter((c) => c.invite).length;
      push({ type: 'success', message: `${pluralize(created.length, 'afiliado cadastrado', 'afiliados cadastrados')} na plataforma${invites ? ` · ${pluralize(invites, 'convite gerado', 'convites gerados')}` : ''}.` });
      await loadMeta();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao cadastrar afiliados.' });
    } finally {
      setCreating(false);
    }
  };

  // Vincula um e-mail não-resolvido a um afiliado existente (alias persistente).
  const handleLink = async (email: string, affiliateId: string) => {
    // Backstop: a UI já não oferece "Vincular" sem e-mail (o alias é chaveado por ele).
    if (!email) { push({ type: 'error', message: 'O vínculo é salvo pelo e-mail, e esta linha não tem um.' }); return; }
    try {
      await createEmailAlias(email, affiliateId);
      push({ type: 'success', message: 'E-mail vinculado ao afiliado.' });
      setLinkingLine(null); setLinkQuery('');
      await loadMeta();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao vincular.' });
    }
  };

  // Vincula uma TAG do relatório da casa a um afiliado (apelido persistente: o
  // próximo upload já casa sozinho). Recarrega o índice e a análise refaz na hora.
  const handleLinkTag = async (tag: string, affiliateId: string) => {
    if (!tag) return;
    setSavingTag(true);
    try {
      await createTagAlias(tag, affiliateId, house.slug);
      push({ type: 'success', message: `Tag ${tag} vinculada.` });
      setLinkingTag(null); setTagQuery('');
      await loadMeta();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao vincular a tag.' });
    } finally {
      setSavingTag(false);
    }
  };

  // Desfaz um apelido (só apelido — vínculo que veio do link é desfeito na triagem).
  const handleUnlinkTag = async (tag: string) => {
    try {
      await deleteTagAlias(tag);
      push({ type: 'success', message: `Vínculo da tag ${tag} removido.` });
      await loadMeta();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao desvincular.' });
    }
  };

  useEffect(() => { loadMeta(); /* eslint-disable-next-line */ }, [house.slug]);

  // Reanalisa sempre que a planilha Excel, o texto colado ou o índice mudam. A
  // planilha tem prioridade sobre o texto colado quando ambos existem.
  //
  // Antes de parsear, tenta ADAPTAR o arquivo como relatório da casa agrupado por tag
  // (Esportiva/TAP). Detectado e completo → cabeçalho canônico pelo mapa explícito.
  // Detectado e INCOMPLETO → erro, sem cair no parser genérico: lá a coluna "CPA" do
  // export (R$ 2.760,00) entraria como CONTAGEM de CPAs e inflaria o repasse.
  useEffect(() => {
    const grid = fileGrid ?? (text.trim() ? csvToGrid(text) : null);
    if (!grid) { setAnalysis(null); setParsedRows([]); setParseErrors([]); setTagMode(false); return; }
    const adapted = adaptHouseTagReport(grid);
    if (adapted.detected && !adapted.ok) {
      setTagMode(true); setAnalysis(null); setParsedRows([]);
      setParseErrors([{ line: 0, message: adapted.error || 'Relatório por tag incompleto.' }]);
      return;
    }
    const parsed = parseResultsRows(adapted.ok ? adapted.grid : grid);
    setTagMode(adapted.ok);
    setParsedRows(parsed.rows);
    setParseErrors(parsed.errors.map((e) => ({ line: e.line, message: e.message })));
    setAnalysis(resolveAffiliates(parsed.rows, lookup));
  }, [fileGrid, text, lookup]);

  // Resumo por tag (só no modo relatório-da-casa): pendentes primeiro e por DINHEIRO,
  // com o total de conferência atribuído + sem vínculo == total do arquivo.
  const tagSummaries = useMemo<TagSummary[]>(
    () => (tagMode ? summarizeByTag(parsedRows, tagIndex) : []),
    [tagMode, parsedRows, tagIndex],
  );
  const tagTotals = useMemo(() => tagImportTotals(tagSummaries), [tagSummaries]);

  // O que de fato vai ser gravado (e o que a prévia mostra). No modo tag, o resíduo
  // sem dono fica de fora — ver o aviso em handleImport.
  const previewRows = useMemo(
    () => (analysis ? (tagMode ? attributedRows(analysis.rows) : analysis.rows) : []),
    [analysis, tagMode],
  );

  // Excel (.xlsx/.xls) -> matriz -> parser puro; .csv/.txt -> texto na caixa de colar.
  // Em workbooks com 1 aba por casa, seleciona a aba que bate com esta casa.
  const onPickFile = async (file?: File) => {
    if (!file) return;
    if (isExcelFile(file)) {
      setReading(true);
      try {
        const { grid, sheetName, sheetNames, matched } = await parseSpreadsheetFile(file, house.name);
        setText('');
        setFileGrid(grid); // matriz CRUA: o adaptador do relatório da casa decide o parse
        setFileName(file.name);
        setSheetInfo({ sheetName, sheetNames, matched });
      } catch {
        push({ type: 'error', message: 'Não foi possível ler a planilha Excel.' });
      } finally {
        setReading(false);
      }
      return;
    }
    // CSV/texto: cai na caixa de colar (parser de texto, tolerante a pt-BR).
    const reader = new FileReader();
    reader.onload = () => {
      setFileGrid(null);
      setFileName('');
      setSheetInfo(null);
      setText(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsText(file);
  };

  const clearFile = () => { setFileGrid(null); setFileName(''); setSheetInfo(null); };

  const onTypeText = (v: string) => { clearFile(); setText(v); };

  // No modo TAG a tag pendente não bloqueia (só o que tem dono é gravado); no template
  // próprio, afiliado não-encontrado segue bloqueando pra não gravar atribuição fantasma.
  const canImportFile = tagMode ? canImportTagReport(analysis, parseErrors) : canImport(analysis, parseErrors);

  const handleImport = async () => {
    if (!analysis || !canImportFile) return;
    setImporting(true);
    try {
      // ⚠️ No modo tag, o resíduo sem dono NÃO vira linha agregada: o agregado do dia
      // descarta as atribuídas do mesmo casa|dia, e gravá-lo apagaria do total da casa
      // justamente o que foi atribuído. Ele fica de fora até alguém dar dono à tag.
      const rows = buildImportPayload(tagMode ? { ...analysis, rows: attributedRows(analysis.rows) } : analysis);
      const res = await importHouseResults(house.slug, rows);
      push({ type: 'success', message: `Importado: ${pluralize(res.imported, 'linha')} em ${pluralize(res.dates.length, 'dia')}.` });
      setText('');
      clearFile();
      setAnalysis(null);
      setParsedRows([]);
      await loadMeta();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao importar.' });
    } finally {
      setImporting(false);
    }
  };

  const clearDay = async (date?: string) => {
    try {
      const n = await clearHouseResults(house.slug, date);
      push({ type: 'success', message: date ? `Dia ${date} limpo (${n}).` : `Tudo limpo (${n}).` });
      await loadMeta();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao limpar.' });
    }
  };

  // Dias já importados (agrupados por data) com nº de linhas atribuídas + agregado.
  const days = useMemo(() => {
    const map = new Map<string, { attributed: number; aggregate: boolean }>();
    for (const r of existing) {
      const d = map.get(r.date) ?? { attributed: 0, aggregate: false };
      if (r.affiliateId === null) d.aggregate = true; else d.attributed += 1;
      map.set(r.date, d);
    }
    return [...map.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => b.date.localeCompare(a.date));
  }, [existing]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto mb-0" onClick={onClose}>
      <div className="min-h-full flex items-center justify-center p-4 pb-0">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-800 max-h-[calc(100vh_-_2rem)] flex flex-col"
        >
          <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100 dark:border-neutral-800">
            <div className="flex items-center gap-3 min-w-0">
              <HouseLogo house={house} size={36} />
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">Resultados · {house.name}</h2>
                <p className="text-[11px] text-slate-400 dark:text-neutral-500">Baixe o modelo, preencha no Excel e suba a planilha (.xlsx).</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-600 dark:hover:text-neutral-200 transition-colors shrink-0">
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-5 overflow-y-auto">
            {/* Casa com conector: o upload continua disponível (serve pra tapar
                buraco em data ANTIGA, fora da janela do robô), mas dentro da janela
                ele é trabalho perdido — a rodada apaga as datas que vai reescrever
                antes de gravar. Sem este aviso o dado sumia sozinho em até uma hora,
                sem erro em lugar nenhum. */}
            {houseResultsMode(house) === 'integration' && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 p-3 text-[11px] text-amber-700/80 dark:text-amber-300/70">
                <p className="font-bold text-amber-700 dark:text-amber-300 mb-0.5 flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Esta casa já recebe os resultados sozinha
                </p>
                <p>
                  O robô da integração reescreve os dias que puxa. Uma planilha subida para
                  uma data dentro da janela dele será substituída na próxima rodada. Use o
                  upload apenas para períodos antigos, que o robô não alcança mais.
                </p>
              </div>
            )}

            {/* Planilha modelo */}
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 text-[11px] text-amber-700/80 dark:text-amber-300/70">
                <p className="font-bold text-amber-700 dark:text-amber-300 mb-0.5 flex items-center gap-1.5"><FileSpreadsheet size={13} /> Planilha modelo (.xlsx)</p>
                <p>Já vem com todas as colunas e uma aba de instruções. Preencha 1 linha por dia.</p>
              </div>
              <button
                onClick={() => downloadResultsTemplate(house.name).catch(() => push({ type: 'error', message: 'Não foi possível gerar o modelo.' }))}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent-500 text-accent-contrast text-[11px] font-bold hover:bg-accent-600 transition-all"
              >
                <Download size={13} /> Baixar modelo
              </button>
            </div>

            {/* Formato esperado */}
            <div className="rounded-xl bg-slate-50 dark:bg-neutral-800/40 border border-slate-100 dark:border-neutral-800 p-3 text-[11px] text-slate-500 dark:text-neutral-400">
              <p className="font-bold text-slate-600 dark:text-neutral-300 mb-1">Colunas (cabeçalho obrigatório):</p>
              <code className="block font-mono text-[10px] text-slate-500 dark:text-neutral-400">data; afiliado; email; cadastros; ftd; cpa; rev; deposito; comissao</code>
              <p className="mt-1.5">• <b>data</b> obrigatória: preencha só na 1ª linha do dia (as de baixo herdam). • <b>email</b> = cruzamento com o afiliado (login na plataforma ou e-mail OTG); <b>email e afiliado vazios = agregado da casa</b>. • datas/números pt-BR aceitos.</p>
              <p className="mt-1.5 flex items-start gap-1.5 text-slate-500 dark:text-neutral-400">
                <Tag size={12} className="shrink-0 mt-0.5" />
                <span>Ou suba o <b>relatório da própria casa</b> (ex.: Relatório de Mídia agrupado por <b>Dia + AFP</b>): ele é reconhecido sozinho e o cruzamento passa a ser pela <b>tag</b>.</span>
              </p>
            </div>

            {/* Entrada — subir planilha Excel (principal) */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400">Subir planilha</label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }}
              />
              {fileName ? (
                <div className="mt-1.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                    <span className="inline-flex items-center gap-2 min-w-0 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      <FileSpreadsheet size={14} className="shrink-0" /> <span className="truncate">{fileName}</span>
                      {sheetInfo?.sheetName && <span className="font-normal text-emerald-600/70 dark:text-emerald-400/60 truncate">› {sheetInfo.sheetName}</span>}
                    </span>
                    <button onClick={clearFile} className="shrink-0 text-emerald-600/70 dark:text-emerald-400/70 hover:text-red-500" title="Remover planilha">
                      <X size={14} />
                    </button>
                  </div>
                  {sheetInfo && sheetInfo.sheetNames.length > 1 && !sheetInfo.matched && (
                    <p className="px-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle size={11} className="shrink-0" />
                      Várias abas e nenhuma bate com “{house.name}”. Lendo a 1ª (“{sheetInfo.sheetName}”). Confira o preview.
                    </p>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={reading}
                  className="mt-1.5 w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-500 dark:text-neutral-400 hover:border-accent-500/50 hover:text-accent-600 dark:hover:text-accent-400 transition-all disabled:opacity-60"
                >
                  {reading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {reading ? 'Lendo planilha…' : 'Selecionar planilha Excel (.xlsx) ou .csv'}
                </button>
              )}
            </div>

            {/* Alternativa: colar do Excel (TAB/CSV) */}
            <details className="group">
              <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-300 transition-colors select-none">
                Ou colar do Excel
              </summary>
              <textarea
                value={text}
                onChange={(e) => onTypeText(e.target.value)}
                rows={5}
                placeholder={`${TEMPLATE_HEADERS.join('\t')}\n${TEMPLATE_EXAMPLE_ROWS[0].join('\t')}`}
                className="mt-2 w-full px-3 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-neutral-600 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-all"
              />
            </details>

            {/* Preview / validação */}
            {analysis && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Check size={12} /> {pluralize(previewRows.length, 'linha')} {tagMode ? 'a importar' : 'ok'}
                  </span>
                  {parseErrors.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                      <AlertTriangle size={12} /> {parseErrors.length} com erro
                    </span>
                  )}
                  {analysis.unresolved.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      <AlertTriangle size={12} />
                      {tagMode
                        ? `${pluralize(tagTotals.pendingTags, 'tag')} sem vínculo`
                        : `${pluralize(analysis.unresolved.length, 'afiliado não encontrado', 'afiliados não encontrados')}`}
                    </span>
                  )}
                  {tagMode && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-accent-500/10 text-accent-600 dark:text-accent-400 border border-accent-500/20">
                      <Tag size={12} /> Relatório da casa (por tag)
                    </span>
                  )}
                </div>

                {parseErrors.length > 0 && (
                  <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-3 text-[11px] text-red-600 dark:text-red-400 space-y-0.5 max-h-32 overflow-y-auto">
                    {parseErrors.slice(0, 8).map((e, i) => <p key={`e${i}`}>Linha {e.line}: {e.message}</p>)}
                    <p className="text-red-400/70 dark:text-red-500/60 pt-1">Corrija os erros de formato para liberar a importação.</p>
                  </div>
                )}

                {/* Tags do relatório da casa: a casa atribui por tag (?afp=), não por
                    e-mail. As conhecidas (link emitido ou apelido salvo) já vêm com dono;
                    as demais aparecem com o DINHEIRO em jogo e o seletor de afiliado. */}
                {tagMode && tagSummaries.length > 0 && (
                  <div className="rounded-xl bg-slate-50 dark:bg-neutral-800/40 border border-slate-100 dark:border-neutral-800 p-3 space-y-2">
                    <div>
                      <p className="text-[11px] font-bold text-slate-600 dark:text-neutral-200">Tags do relatório</p>
                      <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                        Vincule cada tag ao afiliado dono: fica salvo e os próximos relatórios casam sozinhos.
                        Tag sem vínculo <b>não é importada</b> (nada é atribuído por engano). Descobriu de quem é
                        depois? Vincule e <b>suba o mesmo arquivo de novo</b>, que o dia é reescrito com o que estiver vinculado.
                      </p>
                    </div>

                    {/* Conferência: atribuído + sem vínculo == total do arquivo. */}
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Atribuído {formatBrl(tagTotals.attributed.total_commission)} · {tagTotals.attributed.qualified_cpa} CPA
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-500/10 text-slate-500 dark:text-neutral-400 border border-slate-500/20">
                        Sem vínculo {formatBrl(tagTotals.unattributed.total_commission)} · {tagTotals.unattributed.qualified_cpa} CPA
                      </span>
                    </div>

                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {tagSummaries.map((s) => (
                        <div key={s.tag || '__sem_tag__'} className="rounded-lg bg-white/70 dark:bg-neutral-900/40 border border-slate-100 dark:border-neutral-800 px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-[11px] text-slate-600 dark:text-neutral-300">
                              <span className="font-mono font-bold text-slate-700 dark:text-neutral-200">
                                {s.tag || 'sem tag'}
                              </span>
                              <span className="text-slate-400 dark:text-neutral-500">
                                {' '}· {formatBrl(s.total_commission)} · {s.qualified_cpa} CPA · {pluralize(s.days, 'dia')}
                              </span>
                              {s.affiliateId && (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {' '}→ {humanizeName(nameById.get(s.affiliateId) || s.affiliateId)}
                                  <span className="text-slate-400 dark:text-neutral-500"> ({s.origin === 'alias' ? 'vínculo salvo' : 'link'})</span>
                                </span>
                              )}
                            </span>
                            {!s.tag ? (
                              <span className="shrink-0 text-[11px] text-slate-400 dark:text-neutral-500">fica de fora</span>
                            ) : s.origin === 'alias' ? (
                              <button
                                onClick={() => handleUnlinkTag(s.tag)}
                                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 dark:text-neutral-500 hover:text-red-500"
                              >
                                <X size={11} /> Desfazer
                              </button>
                            ) : s.affiliateId ? null : (
                              <button
                                onClick={() => { setLinkingTag(linkingTag === s.tag ? null : s.tag); setTagQuery(''); }}
                                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-accent-600 dark:text-accent-400 hover:underline"
                              >
                                <Link2 size={11} /> {linkingTag === s.tag ? 'Cancelar' : 'Vincular'}
                              </button>
                            )}
                          </div>
                          {linkingTag === s.tag && (
                            <div className="mt-1.5">
                              <input
                                value={tagQuery}
                                onChange={(e) => setTagQuery(e.target.value)}
                                placeholder="Buscar afiliado…"
                                className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-accent-500"
                              />
                              <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-100 dark:border-neutral-800">
                                {tagOptions.length === 0 ? (
                                  <p className="px-2 py-1.5 text-[11px] text-slate-400 dark:text-neutral-500">Nenhum afiliado encontrado.</p>
                                ) : tagOptions.map((o) => (
                                  <button
                                    key={o.id}
                                    disabled={savingTag}
                                    onClick={() => handleLinkTag(s.tag, o.id)}
                                    className="block w-full text-left px-2 py-1.5 text-[11px] text-slate-600 dark:text-neutral-300 hover:bg-accent-500/10 disabled:opacity-50"
                                  >
                                    {o.name}
                                    {o.emails.length > 0 && (
                                      <span className="text-slate-400 dark:text-neutral-500"> ({o.emails.join(', ')})</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!tagMode && analysis.unresolved.length > 0 && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 p-3 space-y-2">
                    <div>
                      <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Afiliados não encontrados na plataforma</p>
                      <p className="text-[11px] text-amber-700/70 dark:text-amber-300/60">
                        Cadastre-os como afiliados da casa (passam a cruzar pelo e-mail) ou vincule cada um a um
                        afiliado já existente. O vínculo é salvo <b>pelo e-mail</b>: linha sem a coluna
                        <code className="mx-0.5">email</code> preenchida só dá para cadastrar.
                      </p>
                    </div>
                    <div className="space-y-1 max-h-44 overflow-y-auto">
                      {analysis.unresolved.map((u) => (
                        <div key={u.line} className="rounded-lg bg-white/60 dark:bg-neutral-900/40 border border-amber-100 dark:border-amber-900/30 px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-[11px] text-slate-600 dark:text-neutral-300">
                              <span className="text-slate-400 dark:text-neutral-500">L{u.line}</span> {u.name || '—'}
                              {u.email && <span className="text-slate-400 dark:text-neutral-500"> · {u.email}</span>}
                            </span>
                            {/* O vínculo é gravado com o E-MAIL como chave (alias). Linha só com
                                nome não tem o que gravar — então não oferecemos a ação em vez de
                                deixar o admin entrar num beco sem saída. */}
                            {u.email ? (
                              <button
                                onClick={() => { setLinkingLine(linkingLine === u.line ? null : u.line); setLinkQuery(''); }}
                                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-accent-600 dark:text-accent-400 hover:underline"
                              >
                                <Link2 size={11} /> {linkingLine === u.line ? 'Cancelar' : 'Vincular'}
                              </button>
                            ) : (
                              <span
                                className="shrink-0 text-[11px] text-slate-400 dark:text-neutral-500"
                                title="O vínculo é salvo pelo e-mail. Preencha a coluna “email” desta linha, ou cadastre o afiliado na plataforma pelo botão abaixo."
                              >
                                sem e-mail nesta linha
                              </span>
                            )}
                          </div>
                          {linkingLine === u.line && (
                            <div className="mt-1.5">
                              <input
                                value={linkQuery}
                                onChange={(e) => setLinkQuery(e.target.value)}
                                placeholder="Buscar afiliado existente…"
                                className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-accent-500"
                              />
                              <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-100 dark:border-neutral-800">
                                {linkOptions.length === 0 ? (
                                  <p className="px-2 py-1.5 text-[11px] text-slate-400 dark:text-neutral-500">Nenhum afiliado encontrado.</p>
                                ) : linkOptions.map((o) => (
                                  <button
                                    key={o.id}
                                    onClick={() => handleLink(u.email || '', o.id)}
                                    className="block w-full text-left px-2 py-1.5 text-[11px] text-slate-600 dark:text-neutral-300 hover:bg-accent-500/10"
                                  >
                                    {o.name}
                                    {o.emails.length > 0 && (
                                      <span className="text-slate-400 dark:text-neutral-500"> ({o.emails.join(', ')})</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-amber-100 dark:border-amber-900/30">
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-amber-700/80 dark:text-amber-300/70 cursor-pointer select-none">
                        <input type="checkbox" checked={generateInvite} onChange={(e) => setGenerateInvite(e.target.checked)} className="accent-accent-500" />
                        Gerar convite de acesso
                      </label>
                      <button
                        onClick={handleCreateBoost}
                        disabled={creating}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-500 text-accent-contrast text-[11px] font-bold hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        Cadastrar {analysis.unresolved.length} na plataforma
                      </button>
                    </div>
                  </div>
                )}

                {previewRows.length > 0 && (
                  <div className="rounded-xl border border-slate-100 dark:border-neutral-800 overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50 dark:bg-neutral-800/40 text-slate-400 dark:text-neutral-500">
                        <tr>
                          {['Data', 'Afiliado', 'Cad', 'FTD', 'CPA', 'REV', 'Depósito', 'Comissão'].map((h) => (
                            <th key={h} className="px-2 py-1.5 text-left font-bold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(0, 8).map((r, i) => (
                          <tr key={i} className="border-t border-slate-100 dark:border-neutral-800">
                            <td className="px-2 py-1.5 font-mono text-slate-600 dark:text-neutral-300">{r.date}</td>
                            <td className="px-2 py-1.5 text-slate-600 dark:text-neutral-300">
                              {r.affiliateId === null
                                ? <span className="italic text-slate-400 dark:text-neutral-500">Agregado</span>
                                : humanizeName(r.affiliateLabel || r.affiliateId)}
                            </td>
                            <td className="px-2 py-1.5">{r.registrations}</td>
                            <td className="px-2 py-1.5">{r.first_deposits}</td>
                            <td className="px-2 py-1.5">{r.qualified_cpa}</td>
                            <td className="px-2 py-1.5">{r.rvs}</td>
                            <td className="px-2 py-1.5">{r.deposit}</td>
                            <td className="px-2 py-1.5">{r.total_commission}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {previewRows.length > 8 && (
                      <p className="px-2 py-1.5 text-[10px] text-slate-400 dark:text-neutral-500 border-t border-slate-100 dark:border-neutral-800">+{pluralize(previewRows.length - 8, 'linha')}…</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Dias já importados */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 flex items-center gap-1.5">
                  <Calendar size={12} /> Dias importados
                </h3>
                {days.length > 0 && (
                  <button onClick={() => clearDay()} className="text-[10px] font-bold text-red-500 hover:underline">Limpar tudo</button>
                )}
              </div>
              {loadingMeta ? (
                <p className="text-[11px] text-slate-400 dark:text-neutral-500">Carregando…</p>
              ) : days.length === 0 ? (
                <p className="text-[11px] text-slate-400 dark:text-neutral-500">Nenhum resultado importado ainda.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {days.map((d) => (
                    <span key={d.date} className="group inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-800 text-[11px]">
                      <span className="font-mono text-slate-600 dark:text-neutral-300">{d.date}</span>
                      <span className="text-slate-400 dark:text-neutral-500">{d.attributed}{d.aggregate ? '+agg' : ''}</span>
                      <button onClick={() => clearDay(d.date)} className="text-slate-300 dark:text-neutral-600 hover:text-red-500" title="Limpar dia">
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 p-6 pt-4 border-t border-slate-100 dark:border-neutral-800">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-all">
              Fechar
            </button>
            <button
              onClick={handleImport}
              disabled={!canImportFile || importing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent-500 text-accent-contrast text-xs font-bold hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Confirmar importação
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-neutral-600 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 mb-1.5">
        {label}{hint && <span className="ml-2 normal-case font-normal tracking-normal text-slate-400 dark:text-neutral-500">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
