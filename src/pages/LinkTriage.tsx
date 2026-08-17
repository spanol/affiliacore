import { useEffect, useMemo, useState } from 'react';
import { pluralize } from '../lib/plural';
import { motion } from 'motion/react';
import {
  Link2,
  Loader2,
  Search,
  Copy,
  Check,
  ExternalLink,
  Upload,
  Trash2,
  UserPlus,
  RotateCcw,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { cn, humanizeName } from '../lib/utils';
import {
  buildLinkTriage,
  rowsForView,
  searchRows,
  parseStandbyLinks,
  extractTagFromUrl,
  LINK_TRIAGE_VIEWS,
  LINK_TRIAGE_LABELS,
  type LinkTriageView,
  type TriageRow,
} from '../lib/linkTriage';
import { suggestTag, buildTaggedUrl, tagParamForTemplate } from '../lib/linkGeneration';
import { producingAffiliateIds } from '../lib/affiliateActivity';
import {
  fetchAffiliates,
  fetchAffiliateLinks,
  fetchAllResults,
  fetchManualResults,
  buildGoUrl,
  createAffiliateLink,
  generateAffiliateLink,
  importStandbyLinks,
  assignAffiliateLink,
  releaseAffiliateLink,
  deleteAffiliateLink,
  type AffiliateLink,
} from '../services/affiliateService';
import { fetchHouses, type House } from '../services/houseService';

// "Produzindo" é histórico, não do mês: a triagem responde "esse afiliado já
// gerou alguma coisa com o link?". Por isso o range vai do início da operação.
const ALL_TIME_START = '2020-01-01';
const todayISO = () => new Date().toISOString().slice(0, 10);

// Chave de marca do link (mesma convenção de `dealBrandKey`): brandId da OTG
// quando existe, senão o slug da casa manual.
const houseKey = (h: House) => String(h.brandId || h.slug || h.id || '');

export default function LinkTriage() {
  const { push } = useToast();

  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [producing, setProducing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<LinkTriageView>('com_link');
  const [search, setSearch] = useState('');
  const [brandKey, setBrandKey] = useState('');

  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  // Definição manual do link de um afiliado (quando não há pool).
  const [linkingRow, setLinkingRow] = useState<TriageRow | null>(null);
  const [manualUrl, setManualUrl] = useState('');

  // Geração do link a partir do template da casa + tag nossa (não depende da
  // casa cunhar tag: ela é capturada na visita — ver src/lib/linkGeneration.ts).
  const [generatingRow, setGeneratingRow] = useState<TriageRow | null>(null);
  const [genBrand, setGenBrand] = useState('');
  const [genTag, setGenTag] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const range = { startDate: ALL_TIME_START, endDate: todayISO() };
      const [affs, lnks, hs, otg, manual] = await Promise.all([
        fetchAffiliates().catch(() => []),
        fetchAffiliateLinks().catch(() => []),
        fetchHouses().catch(() => []),
        fetchAllResults(range).catch(() => []),
        fetchManualResults(range).catch(() => []),
      ]);
      setAffiliates(Array.isArray(affs) ? affs : []);
      setLinks(Array.isArray(lnks) ? lnks : []);
      setHouses(Array.isArray(hs) ? hs : []);
      setProducing(producingAffiliateIds(otg as any[], manual as any[]));
    } catch {
      push({ type: 'error', message: 'Falha ao carregar a triagem de links.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triage = useMemo(
    () => buildLinkTriage(affiliates, links, producing, brandKey || null),
    [affiliates, links, producing, brandKey],
  );

  const visibleRows = useMemo(
    () => searchRows(rowsForView(triage.rows, view), search),
    [triage.rows, view, search],
  );

  // Pré-visualização do import: o MESMO parser que o servidor roda ao gravar.
  const importPreview = useMemo(() => parseStandbyLinks(importText), [importText]);

  // Tags já em uso (link emitido ou embutida na URL) — a sugestão nasce sem
  // colidir, e o servidor recusa de novo na hora de gravar.
  const takenTags = useMemo(
    () =>
      links
        .map((l) => String((l as any).tag ?? '') || extractTagFromUrl(String(l.registerUrl ?? '')))
        .filter(Boolean),
    [links],
  );

  const genHouse = useMemo(() => houses.find((h) => houseKey(h) === genBrand) ?? null, [houses, genBrand]);
  const genTemplate = String(genHouse?.registerUrlTemplate ?? '').trim();
  // O MESMO builder do servidor: o que o admin lê aqui é o que vai ser gravado.
  const genPreview = useMemo(() => buildTaggedUrl(genTemplate, genTag), [genTemplate, genTag]);

  const openGenerate = (row: TriageRow) => {
    const brand = brandKey || (houses.length === 1 ? houseKey(houses[0]) : '');
    setGenBrand(brand);
    setGenTag(suggestTag({ name: row.name, email: row.email, affiliateId: row.affiliateId }, takenTags));
    setGeneratingRow(row);
  };

  const handleGenerate = async () => {
    if (!generatingRow) return;
    const row = generatingRow;
    const brand = genBrand;
    const tag = genTag.trim();
    if (!brand) {
      push({ type: 'error', message: 'Escolha a casa: o link sai do template dela.' });
      return;
    }
    if (!tag) {
      push({ type: 'error', message: 'A tag não pode ficar vazia: é ela que a casa devolve no relatório.' });
      return;
    }
    setGeneratingRow(null);
    await withBusy(
      row.affiliateId,
      () => generateAffiliateLink(row.affiliateId, brand, { tag }).then(() => undefined),
      `Link gerado com a tag ${tag}.`,
    );
  };

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(buildGoUrl(code));
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const withBusy = async (key: string, fn: () => Promise<void>, successMessage: string) => {
    setBusy(key);
    try {
      await fn();
      push({ type: 'success', message: successMessage });
      await loadData();
    } catch (err) {
      push({ type: 'error', message: err instanceof Error ? err.message : 'Falha na operação.' });
    } finally {
      setBusy(null);
    }
  };

  // "Pegar do Standby": toma o primeiro link livre do pool (da casa filtrada).
  const takeFromStandby = async (row: TriageRow) => {
    const available = triage.standby[0];
    if (!available) {
      push({ type: 'error', message: 'Não há links em standby para atribuir. Importe alguns primeiro.' });
      return;
    }
    await withBusy(row.affiliateId, () => assignAffiliateLink(available.code, row.affiliateId), 'Link atribuído.');
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await importStandbyLinks(importText, brandKey || null);
      push({
        type: 'success',
        message: `${pluralize(result.created, 'link importado', 'links importados')}${result.skipped ? ` · ${pluralize(result.skipped, 'já existia', 'já existiam')}` : ''}.`,
      });
      setImportText('');
      setShowImport(false);
      await loadData();
    } catch (err) {
      push({ type: 'error', message: err instanceof Error ? err.message : 'Falha ao importar.' });
    } finally {
      setImporting(false);
    }
  };

  const handleManualLink = async () => {
    if (!linkingRow) return;
    const row = linkingRow;
    const url = manualUrl.trim();
    if (!/^https?:\/\/.+/i.test(url)) {
      push({ type: 'error', message: 'Informe uma URL http(s) válida.' });
      return;
    }
    setLinkingRow(null);
    setManualUrl('');
    await withBusy(
      row.affiliateId,
      () => createAffiliateLink(row.affiliateId, url, brandKey || null).then(() => undefined),
      'Link definido.',
    );
  };

  const inputClass =
    'w-full px-4 py-3 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all outline-none';

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
            Operação do dia a dia
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
            <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
              <Link2 size={24} className="text-accent-500" />
            </span>
            Triagem de links
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">
            Quem tem link, quem está sem, e quem já produziu com ele.
          </p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 self-start shrink-0 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:opacity-90 transition-all shadow-sm"
        >
          <Upload size={14} />
          Importar links (standby)
        </button>
      </header>

      {/* Visões — os atalhos do painel legado, com contadores */}
      <div className="flex flex-wrap gap-2">
        {LINK_TRIAGE_VIEWS.map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              'px-4 py-2 rounded-full text-xs font-bold border transition-all',
              view === v
                ? 'bg-accent-500/15 text-accent-600 dark:text-accent-400 border-accent-500/30 shadow-sm'
                : 'bg-white dark:bg-neutral-900/60 text-slate-600 dark:text-neutral-300 border-slate-200 dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700',
            )}
          >
            {LINK_TRIAGE_LABELS[v]}
            <span className="ml-2 text-slate-400 dark:text-neutral-500">{triage.counts[v]}</span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail, ID, tag ou link..."
            className={cn(inputClass, 'pl-11')}
          />
        </div>
        {houses.length > 0 && (
          <select
            value={brandKey}
            onChange={(e) => setBrandKey(e.target.value)}
            className={cn(inputClass, 'sm:w-64')}
          >
            <option value="">Todas as casas</option>
            {houses.map((h) => (
              <option key={h.id} value={houseKey(h)}>
                {h.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="p-24 flex flex-col items-center justify-center gap-4">
          <Loader2 size={40} className="text-accent-500 animate-spin" />
          <p className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest animate-pulse">
            Carregando...
          </p>
        </div>
      ) : view === 'standby' ? (
        /* Pool de links sem dono */
        <section className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden">
          {triage.standby.length === 0 ? (
            <p className="px-6 py-16 text-center text-xs text-slate-400 dark:text-neutral-500">
              Nenhum link em standby. Importe os links já cunhados na casa para distribuí-los depois.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-neutral-800">
              {triage.standby.map((link) => (
                <div key={link.code} className="flex items-center gap-3 px-6 py-4">
                  <span className="shrink-0 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-neutral-800 text-[10px] font-black text-slate-500 dark:text-neutral-400 uppercase tracking-widest">
                    {(link as any).tag || 'sem tag'}
                  </span>
                  <p className="flex-1 min-w-0 text-[11px] text-slate-500 dark:text-neutral-400 truncate">
                    {link.registerUrl}
                  </p>
                  <a
                    href={String(link.registerUrl ?? '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-accent-500 hover:bg-accent-500/10 transition-colors"
                    title="Abrir destino"
                  >
                    <ExternalLink size={15} />
                  </a>
                  <button
                    onClick={() =>
                      confirmingDelete === link.code
                        ? withBusy(link.code, () => deleteAffiliateLink(link.code), 'Link removido do pool.').then(() =>
                            setConfirmingDelete(null),
                          )
                        : setConfirmingDelete(link.code)
                    }
                    disabled={busy === link.code}
                    title={confirmingDelete === link.code ? 'Clique de novo para confirmar' : 'Remover do pool'}
                    className={cn(
                      'shrink-0 p-2 rounded-lg transition-colors disabled:opacity-50',
                      confirmingDelete === link.code
                        ? 'text-red-500 bg-red-500/10'
                        : 'text-slate-400 hover:text-red-500 hover:bg-red-500/10',
                    )}
                  >
                    {confirmingDelete === link.code ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1">Confirmar?</span>
                    ) : (
                      <Trash2 size={15} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : visibleRows.length === 0 ? (
        <div className="p-16 rounded-3xl border border-dashed border-slate-200 dark:border-neutral-800 text-center">
          <Link2 size={40} className="mx-auto text-slate-300 dark:text-neutral-700 mb-4" />
          <p className="text-sm font-bold text-slate-500 dark:text-neutral-400">
            Nenhum afiliado nesta visão.
          </p>
        </div>
      ) : (
        <section className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-neutral-800">
            {visibleRows.map((row) => (
              <motion.div
                key={row.affiliateId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col lg:flex-row lg:items-center gap-3 px-6 py-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-800 dark:text-neutral-100 truncate">
                      {humanizeName(row.name)}
                    </p>
                    {row.producing ? (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest">
                        Produzindo
                      </span>
                    ) : row.hasLink ? (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-widest">
                        Sem resultado
                      </span>
                    ) : null}
                  </div>
                  {/* A TAG é a da casa (`?afp=`) — o `code` é o nosso short link.
                      Mostrar o code rotulado de "tag" fazia o admin procurar no
                      relatório da casa uma string que ela nunca viu. */}
                  <p className="text-[11px] text-slate-500 dark:text-neutral-400 truncate">
                    {row.email || `ID ${row.affiliateId}`}
                    {row.link ? ` · tag ${(row.link as any).tag || extractTagFromUrl(String(row.link.registerUrl ?? '')) || '—'}` : ''}
                    {row.hasLink ? ` · ${row.clicks} clique${row.clicks === 1 ? '' : 's'}` : ''}
                  </p>
                  {row.link && !row.hasLink && (
                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5 uppercase tracking-widest">
                      {row.link.active === false ? 'Link desativado' : 'Link sem URL de cadastro'}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  {row.hasLink && row.link ? (
                    <>
                      <button
                        onClick={() => copyLink(row.link!.code)}
                        className="px-4 py-2 rounded-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-200 hover:border-slate-300 dark:hover:border-neutral-600 transition-all flex items-center gap-2"
                      >
                        {copied === row.link.code ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                        {copied === row.link.code ? 'Copiado!' : 'Copiar'}
                      </button>
                      <a
                        href={String(row.link.registerUrl ?? '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg text-slate-400 hover:text-accent-500 hover:bg-accent-500/10 transition-colors"
                        title="Abrir destino"
                      >
                        <ExternalLink size={15} />
                      </a>
                      <button
                        onClick={() =>
                          withBusy(row.affiliateId, () => releaseAffiliateLink(row.link!.code), 'Link devolvido ao standby.')
                        }
                        disabled={busy === row.affiliateId}
                        className="px-4 py-2 rounded-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-200 hover:border-amber-300 hover:text-amber-600 transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {busy === row.affiliateId ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                        Standby
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openGenerate(row)}
                        disabled={busy === row.affiliateId}
                        className="px-4 py-2 rounded-full bg-accent-500 text-accent-contrast text-xs font-bold hover:bg-accent-400 transition-all shadow-sm shadow-accent-500/20 flex items-center gap-2 disabled:opacity-40"
                        title="Gerar o link a partir do template da casa, com tag própria"
                      >
                        {busy === row.affiliateId ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                        Gerar link
                      </button>
                      <button
                        onClick={() => takeFromStandby(row)}
                        disabled={busy === row.affiliateId || triage.standby.length === 0}
                        className="px-4 py-2 rounded-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-200 hover:border-slate-300 dark:hover:border-neutral-600 transition-all flex items-center gap-2 disabled:opacity-40"
                        title={triage.standby.length === 0 ? 'Não há links em standby' : 'Atribuir um link do pool'}
                      >
                        {busy === row.affiliateId ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                        Pegar do Standby
                      </button>
                      <button
                        onClick={() => {
                          setLinkingRow(row);
                          setManualUrl(String(row.link?.registerUrl ?? ''));
                        }}
                        className="px-4 py-2 rounded-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-200 hover:border-slate-300 dark:hover:border-neutral-600 transition-all flex items-center gap-2"
                      >
                        <Plus size={13} />
                        Definir link
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Import do pool */}
      {showImport && (
        <div
          onClick={() => setShowImport(false)}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm"
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200/70 dark:border-neutral-800 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-neutral-800 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Importar links</h3>
                  <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
                    Um link por linha. A tag sai da URL (<code>afp</code>, <code>tag</code>, <code>btag</code>…) ou pode
                    vir depois de uma tabulação.
                  </p>
                </div>
                <button
                  onClick={() => setShowImport(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={8}
                  placeholder={'https://go.aff.casa.bet/abc?afp=tag001\nhttps://go.aff.casa.bet/abc?afp=tag002'}
                  className={cn(inputClass, 'font-mono text-[11px] resize-y')}
                />
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {pluralize(importPreview.links.length, 'link válido', 'links válidos')}
                  </span>
                  {importPreview.invalid.length > 0 && (
                    <span className="text-red-500">{pluralize(importPreview.invalid.length, 'linha inválida', 'linhas inválidas')}</span>
                  )}
                </div>
                <button
                  onClick={handleImport}
                  disabled={importing || importPreview.links.length === 0}
                  className="w-full px-5 py-3 rounded-full bg-accent-500 text-accent-contrast text-xs font-bold hover:bg-accent-400 transition-all shadow-sm shadow-accent-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  Importar para o standby
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {/* Gerar link a partir do template da casa */}
      {generatingRow && (
        <div
          onClick={() => setGeneratingRow(null)}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm"
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200/70 dark:border-neutral-800 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-neutral-800">
                <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Gerar link de {humanizeName(generatingRow.name)}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
                  O link sai do cadastro da casa com a tag abaixo. É a tag que a casa devolve no relatório,
                  sem precisar cunhá-la no painel dela.
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-1.5">
                    Casa
                  </label>
                  <select value={genBrand} onChange={(e) => setGenBrand(e.target.value)} className={inputClass}>
                    <option value="">Selecione…</option>
                    {houses.map((h) => (
                      <option key={h.id} value={houseKey(h)}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-1.5">
                    Tag ({genTemplate ? tagParamForTemplate(genTemplate) : 'afp'})
                  </label>
                  <input
                    value={genTag}
                    onChange={(e) => setGenTag(e.target.value)}
                    placeholder="infinitw777"
                    className={cn(inputClass, 'font-mono')}
                  />
                </div>

                {genBrand && !genTemplate ? (
                  <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    Esta casa não tem link de cadastro cadastrado. Preencha o campo "Link de cadastro" dela em
                    /casas e volte aqui.
                  </p>
                ) : genPreview ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-1.5">
                      Destino final
                    </p>
                    <code className="block px-3 py-2 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-[11px] text-slate-700 dark:text-neutral-200 break-all">
                      {genPreview}
                    </code>
                  </div>
                ) : null}

                <button
                  onClick={handleGenerate}
                  disabled={!genPreview}
                  className="w-full px-5 py-3 rounded-full bg-accent-500 text-accent-contrast text-xs font-bold hover:bg-accent-400 transition-all shadow-sm shadow-accent-500/20 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Sparkles size={14} />
                  Gerar e atribuir
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {/* Definir link manualmente */}
      {linkingRow && (
        <div
          onClick={() => setLinkingRow(null)}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm"
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200/70 dark:border-neutral-800 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-neutral-800">
                <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Link de {humanizeName(linkingRow.name)}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
                  Cole a URL de cadastro da casa. O afiliado compartilha o link curto da plataforma, que conta o
                  clique e redireciona.
                </p>
              </div>
              <div className="p-6 space-y-4">
                <input
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="https://go.aff.casa.bet/abc?afp=tag001"
                  className={inputClass}
                />
                <button
                  onClick={handleManualLink}
                  className="w-full px-5 py-3 rounded-full bg-accent-500 text-accent-contrast text-xs font-bold hover:bg-accent-400 transition-all shadow-sm shadow-accent-500/20 flex items-center justify-center gap-2"
                >
                  <Check size={14} />
                  Salvar link
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
}
