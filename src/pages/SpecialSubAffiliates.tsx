import React, { useEffect, useMemo, useState } from 'react';
import { pluralize } from '../lib/plural';
import { motion } from 'motion/react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, Users, ArrowUpRight, Crown, Save, Percent, Search, UserPlus, X, Clock, Link2, Copy, Check, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  fetchSpecialAffiliates,
  fetchAffiliates,
  fetchResultsForAffiliatesSplit,
  fetchAffiliateConfigs,
  saveSubAffiliateConfig,
  createAffiliateReferral,
  fetchAffiliateReferrals,
  fetchAffiliateLinks,
  fetchNetworkInvite,
  createNetworkInvite,
  fetchPartnerships,
  pricePartnership,
  rejectPartnershipAsUpline,
  buildGoUrl,
  type PartnershipRequest,
  SpecialAffiliate,
  AffiliateConfig,
  CaptureRequest,
  type AffiliateLink,
} from '../services/affiliateService';
import { fetchHouses, type House } from '../services/houseService';
import { buildUplineQueue, pricingError, spreadPreview, type UplineQueueItem } from '../lib/uplineQueue';
import {
  buildHouseOptions,
  houseKeyByName,
  scopePartsToHouse,
  funnelByAffiliate,
  houseRateDraft,
  isIncompleteRateDraft,
  EMPTY_RATE_DRAFT,
  type RateDraft,
} from '../lib/subHouseRates';
import { resolveRepasseCap, hasConfiguredRate } from '../lib/network';
import { MARKETPLACE_ENABLED } from '../lib/instanceClient';
import { buildNetworkInviteUrl } from '../lib/networkInvite';
import { producingAffiliateIds } from '../lib/affiliateActivity';
import { buildPerHousePayout, type HouseMetricRow } from '../lib/perHousePayout';
import DateRangePicker from '../components/DateRangePicker';
import BrandFilter from '../components/BrandFilter';
import { getBrandName, ALL_BRANDS, buildBrandIdOf } from '../lib/brand';
import { DateRange, getDefaultRange } from '../lib/dateRange';
import { cn, humanizeName } from '../lib/utils';

const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Sub que ele VÊ mas não repassa (neto na rede N níveis): quem define a comissão é
// o gerente logo acima dele. Ver "visão ≠ dinheiro" em src/lib/specialNetwork.ts.
const INDIRECT_HINT = 'Indicado indireto: a comissão dele é definida por quem está acima dele na rede.';

// Sem casa selecionada não há gesto de dinheiro nesta tela (pedido Infinity, 17/08).
// Editar aqui gravava a taxa de TOPO do afiliado, que vale em toda casa sem
// override: um ajuste pensado para uma casa reprecificava as outras. A comissão
// agora é POR CASA, como na precificação de parceria. Ver lib/subHouseRates.
const PICK_HOUSE_HINT = 'Selecione uma casa para definir a comissão do seu afiliado nela.';

// Passo 3 · Lista de sub-afiliados do afiliado especial — espelha o "Afiliados" do
// master, capado à própria rede. Cada sub abre a AffiliateDetails escopada
// (/affiliates/:id) — o proxy libera o especial a ler os subs; o nome vem de
// `affiliates` (signed-in) e a config (CPA/REV) vem ESCOPADA do servidor
// (GET /api/affiliate-configs devolve own + sub-rede; a rule é admin-only · R5).
export default function SpecialSubAffiliates() {
  const { profile } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [range, setRange] = useState<DateRange>(() => getDefaultRange());
  const [loading, setLoading] = useState(true);
  const [special, setSpecial] = useState<SpecialAffiliate | null>(null);
  const [results, setResults] = useState<any[]>([]);
  // Partes SEPARADAS (OTG × manual) — o "Seu ganho" (spread) precifica a linha
  // manual pela casa da LINHA via perHousePayout (bug do R$ 280, 2026-08-12).
  const [payoutParts, setPayoutParts] = useState<{ otg: any[]; manual: HouseMetricRow[] }>({ otg: [], manual: [] });
  const [configs, setConfigs] = useState<Record<string, AffiliateConfig>>({});
  const [pool, setPool] = useState<any[]>([]); // mirror p/ afiliado→brandId (byBrand)
  // Edição da comissão de cada sub (CPA/REV) NA CASA SELECIONADA, com teto = taxa
  // própria do especial naquela casa. Strings: campo vazio é ausência de taxa, que
  // não é R$ 0 (o 0 explícito continua sendo um valor válido e gravável).
  const [subEdits, setSubEdits] = useState<Record<string, RateDraft>>({});
  const [savingSub, setSavingSub] = useState<string | null>(null);
  // Filtros — espelham a /affiliates do master, capados à rede do especial.
  const [searchTerm, setSearchTerm] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>(ALL_BRANDS);
  // "Status" escopado: o especial NÃO gerencia ativação (admin-only), então o
  // análogo é a ATIVIDADE na rede — se o sub produziu no período selecionado.
  const [activityFilter, setActivityFilter] = useState<'all' | 'producing' | 'idle'>('all');
  // Indicação de afiliado (call 12/08 · item 5): o gerente indica, a AGÊNCIA
  // confirma em /solicitacoes — nada é criado daqui; só entra na fila.
  const [referrals, setReferrals] = useState<CaptureRequest[]>([]);
  const [referOpen, setReferOpen] = useState(false);
  const [referForm, setReferForm] = useState({ name: '', email: '', phone: '', note: '' });
  const [sendingReferral, setSendingReferral] = useState(false);
  // Links de divulgação da rede: o gerente VÊ e COPIA os links da equipe, mas quem
  // CUNHA o link da casa é a agência (decisão do Maurício, 15/08). O servidor segue
  // escopando o GET à rede dele.
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  // Link de cadastro na rede (15/08): quem entra por ele vira afiliado da equipe
  // dele na hora, sem passar pela fila da agência.
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteUses, setInviteUses] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  // Fila de parcerias (F5 dos tipos de deal): num acordo `gerenciado` o afiliado
  // solicita e é o GERENTE quem define a comissão dele. O servidor já escopa o GET
  // a own + filhos diretos; a tela recorta de novo por `buildUplineQueue`.
  const [partnerships, setPartnerships] = useState<PartnershipRequest[]>([]);
  const [queueEdits, setQueueEdits] = useState<Record<string, { cpaValue: string; revPercentage: string }>>({});
  const [queueBusy, setQueueBusy] = useState<string | null>(null);

  const ownId = profile?.affiliateId ? String(profile.affiliateId) : '';

  const load = async () => {
    if (!ownId) return;
    try {
      setLoading(true);
      // A rede precisa ser conhecida ANTES dos resultados: as métricas por sub saem
      // de `fetchResultsForAffiliates`, que funde OTG + casas MANUAIS. Antes era
      // `fetchAllResults` (OTG puro) e, numa instância OTG-free, a tabela inteira
      // saía ZERADA com o selo "com produção" ao lado — o manual só alimentava o
      // selo. Mesmo merge do SpecialDashboard. [[CLAUDE.md · merge OTG+manual]]
      const specials = await fetchSpecialAffiliates();
      const mine = specials[ownId] || null;
      const networkIds = [ownId, ...((mine?.subAffiliateIds || []).map(String))];
      const [split, cfgs, poolData, myReferrals, netLinks, houseList, invite, parts] = await Promise.all([
        fetchResultsForAffiliatesSplit(networkIds, range),
        fetchAffiliateConfigs(),
        fetchAffiliates().catch(() => []),
        // Indicações do próprio gerente (o servidor escopa) — acompanhamento.
        fetchAffiliateReferrals().catch(() => []),
        // Links da rede (item 1): o servidor devolve own + subs para o especial.
        fetchAffiliateLinks().catch(() => []),
        fetchHouses().catch(() => []),
        // Link de cadastro na rede: pode não existir ainda (o gerente gera na tela).
        fetchNetworkInvite().catch(() => ({ code: null, uses: 0 })),
        // Fila de parcerias. Instância sem marketplace responde 404 de propósito,
        // então nem chamamos: degradar para [] deixa a seção invisível.
        MARKETPLACE_ENABLED ? fetchPartnerships().catch(() => []) : Promise.resolve([]),
      ]);
      setSpecial(mine);
      setResults(split.rows);
      setPayoutParts({ otg: split.otg, manual: split.manual });
      setConfigs(cfgs);
      setPool(Array.isArray(poolData) ? poolData : []);
      setReferrals(Array.isArray(myReferrals) ? myReferrals : []);
      setLinks(Array.isArray(netLinks) ? netLinks : []);
      setHouses(Array.isArray(houseList) ? houseList : []);
      setInviteCode(invite?.code ?? null);
      setInviteUses(Number(invite?.uses ?? 0) || 0);
      setPartnerships(Array.isArray(parts) ? parts : []);
    } catch (e) {
      console.error('Erro ao carregar sub-afiliados:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ownId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownId, range.startDate, range.endDate]);

  // Envia a indicação pra fila da agência. O servidor valida (nome + e-mail) e
  // carimba quem indicou; a criação/convite/vínculo acontecem só na aprovação.
  const handleSendReferral = async () => {
    setSendingReferral(true);
    try {
      await createAffiliateReferral({
        name: referForm.name.trim(),
        email: referForm.email.trim(),
        phone: referForm.phone.trim() || undefined,
        note: referForm.note.trim() || undefined,
      });
      push({ type: 'success', message: 'Indicação enviada. A agência confirma o cadastro.' });
      setReferOpen(false);
      setReferForm({ name: '', email: '', phone: '', note: '' });
      setReferrals(await fetchAffiliateReferrals().catch(() => referrals));
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Não foi possível enviar a indicação.' });
    } finally {
      setSendingReferral(false);
    }
  };

  // --- Links de divulgação da rede (item 1) ---------------------------------
  // Mesma convenção de chave de marca do LinkTriage/dealBrandKey: brandId da OTG
  // quando existe, senão o slug da casa manual.
  const houseKeyOf = (h: House) => String(h.brandId || h.slug || h.id || '');

  const linksByAffiliate = useMemo(() => {
    const m = new Map<string, AffiliateLink[]>();
    links.forEach((l) => {
      const id = String(l.affiliateId ?? '').trim();
      if (!id) return; // pool de standby nem chega aqui (o servidor já filtra)
      const list = m.get(id);
      if (list) list.push(l);
      else m.set(id, [l]);
    });
    return m;
  }, [links]);

  // Só o link ENTREGÁVEL aparece pra copiar (mesmo critério do /go: ativo + URL).
  const deliverableLinksOf = (id: string) =>
    (linksByAffiliate.get(String(id)) ?? []).filter((l) => l.active !== false && String(l.registerUrl ?? '').trim());

  const houseNameOf = (brandKey: string | null | undefined) => {
    const key = String(brandKey ?? '').trim();
    if (!key) return '';
    const h = houses.find((x) => houseKeyOf(x) === key);
    return h?.name ?? key;
  };

  // --- Link de cadastro na rede (15/08) -------------------------------------
  // Emitir é idempotente: sem `rotate` o servidor devolve o link que já existe.
  const inviteUrl = inviteCode ? buildNetworkInviteUrl(inviteCode) : '';

  const handleNetworkInvite = async (rotate: boolean) => {
    setInviteBusy(true);
    try {
      const invite = await createNetworkInvite({ rotate });
      setInviteCode(invite.code ?? null);
      setInviteUses(Number(invite.uses ?? 0) || 0);
      push({
        type: 'success',
        message: rotate ? 'Link novo gerado. O anterior parou de funcionar.' : 'Link de cadastro pronto para compartilhar.',
      });
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Falha ao gerar o link de cadastro.' });
    } finally {
      setInviteBusy(false);
    }
  };

  const copyInviteUrl = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(buildGoUrl(code));
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  // Config própria do especial PRESERVANDO byBrand (antes descartava a taxa por casa · R10).
  const ownConfig = useMemo<AffiliateConfig>(
    () => configs[ownId] ?? { affiliateId: ownId, cpaValue: 0, revPercentage: 0 },
    [ownId, configs]
  );
  const queueRates = (id: string) => queueEdits[id] ?? { cpaValue: '', revPercentage: '' };

  const priceQueueItem = async (item: UplineQueueItem) => {
    const rates = queueRates(item.request.id);
    const erro = pricingError(item, rates);
    if (erro) { push({ type: 'error', message: erro }); return; }
    setQueueBusy(item.request.id);
    try {
      await pricePartnership(item.request.id, {
        cpaValue: Number(rates.cpaValue) || 0,
        revPercentage: Number(rates.revPercentage) || 0,
      });
      push({ type: 'success', message: 'Comissão definida. A agência vai emitir o link de divulgação.' });
      await load();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao definir a comissão.' });
    } finally { setQueueBusy(null); }
  };

  const rejectQueueItem = async (item: UplineQueueItem) => {
    setQueueBusy(item.request.id);
    try {
      await rejectPartnershipAsUpline(item.request.id);
      push({ type: 'success', message: 'Solicitação recusada. O afiliado foi avisado.' });
      await load();
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Erro ao recusar a solicitação.' });
    } finally { setQueueBusy(null); }
  };

  // brandIdOf só manda na parte OTG; a manual é precificada pela casa da linha.
  const brandIdOf = useMemo(() => buildBrandIdOf(pool), [pool]);

  // --- Casa selecionada (pedido Infinity, 17/08) -----------------------------
  // O seletor sai do BACKOFFICE de casas, não da marca das linhas: numa instância
  // OTG-free a linha agregada do afiliado não tem marca, e o seletor ficaria vazio
  // justamente onde ele passou a ser obrigatório para editar a comissão.
  const houseOptions = useMemo(() => buildHouseOptions(houses), [houses]);
  const houseNames = useMemo(() => houseOptions.map((o) => o.name), [houseOptions]);
  const selectedHouseKey = useMemo(
    () => (brandFilter === ALL_BRANDS ? null : houseKeyByName(houseOptions, brandFilter)),
    [brandFilter, houseOptions]
  );
  const selectedHouseName = selectedHouseKey ? brandFilter : '';

  // Recorte das partes (OTG × manual) à casa selecionada — SEPARADAS, porque
  // `buildPerHousePayout` conta o manual 2× se receber a linha mesclada.
  const scopedParts = useMemo(
    () => scopePartsToHouse(payoutParts, brandIdOf, selectedHouseKey),
    [payoutParts, brandIdOf, selectedHouseKey]
  );
  const payoutOf = useMemo(
    () => buildPerHousePayout(scopedParts.otg, scopedParts.manual, brandIdOf),
    [scopedParts, brandIdOf]
  );
  // Funil recortado: com casa selecionada as colunas mostram o que veio DELA. Sem
  // casa, a linha agregada do afiliado (results) segue sendo a fonte.
  const houseFunnel = useMemo(
    () => (selectedHouseKey ? funnelByAffiliate(scopedParts) : null),
    [scopedParts, selectedHouseKey]
  );

  // Teto do gerente NA CASA. Config CRUA (não o `ownConfig`, que preenche 0/0):
  // um teto zerado diria "seu teto é R$ 0" para quem não tem taxa nenhuma ali.
  const houseCap = useMemo(
    () => resolveRepasseCap(configs[ownId] ?? null, selectedHouseKey || undefined),
    [configs, ownId, selectedHouseKey]
  );
  const houseCapConfigured = useMemo(
    () => (selectedHouseKey ? hasConfiguredRate(configs[ownId] ?? null, selectedHouseKey) : false),
    [configs, ownId, selectedHouseKey]
  );

  const rowById = (id: string) => results.find((r) => String(r.affiliate_id ?? r.id ?? '') === String(id));
  const subIds = special?.subAffiliateIds?.map(String) || [];

  // Produção no período unindo OTG + MANUAL — definição ÚNICA em lib/affiliateActivity
  // (antes a regra vivia inline aqui, só com a OTG e só com funil: um sub que produziu
  // em casa manual, ou cuja única evidência era a comissão, aparecia como parado).
  // Sai das partes RECORTADAS: com uma casa selecionada, "com produção" é produção
  // NAQUELA casa, senão o selo contradiria os números da própria linha.
  const producingIds = useMemo(
    () => producingAffiliateIds(scopedParts.otg, scopedParts.manual),
    [scopedParts]
  );

  // Quem ele REPASSA (indicados diretos) ⊆ quem ele VÊ. Numa rede de N níveis a
  // equipe visível inclui netos, mas a comissão deles é definida pelo gerente do
  // meio — o servidor recusa (403) e a tela não pode oferecer o campo. O conjunto
  // vem RESOLVIDO do servidor; sem ele (modelo antigo) todo sub é direto.
  const directIds = useMemo(
    () => new Set((special?.directSubAffiliateIds ?? special?.subAffiliateIds ?? []).map(String)),
    [special]
  );

  // Enriquece cada sub com nome, marca e atividade (produção no período) para
  // alimentar busca/filtros sem recomputar dentro do .map de renderização.
  // Nome pelo MIRROR `affiliates` quando a linha de resultado não traz (é o caso de
  // toda instância OTG-free): sem isto a equipe do gerente aparecia como uma lista
  // de ids crus (`#boost_9e63...`).
  const nameFromPool = useMemo(() => {
    const map: Record<string, string> = {};
    (pool || []).forEach((a: any) => {
      const aid = String(a?.id ?? a?._id ?? '');
      const nm = a?.name || a?.label || '';
      if (aid && nm) map[aid] = String(nm);
    });
    return map;
  }, [pool]);

  const subs = useMemo(() => subIds.map((id) => {
    const r = rowById(id) || {};
    const producing = producingIds.has(String(id));
    // Métricas da CASA quando há casa selecionada; senão o agregado do afiliado.
    const metrics = houseFunnel
      ? (houseFunnel[String(id)] ?? { registrations: 0, first_deposits: 0, qualified_cpa: 0 })
      : {
          registrations: Number(r.registrations) || 0,
          first_deposits: Number(r.first_deposits) || 0,
          qualified_cpa: Number(r.qualified_cpa) || 0,
        };
    return {
      id,
      row: r,
      metrics,
      name: humanizeName(r.affiliate_name || r.name || r.label || nameFromPool[id] || `#${id}`),
      brand: getBrandName(r),
      producing,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [special, results, producingIds, nameFromPool, houseFunnel]);

  // A fila usa a config CRUA, não o `ownConfig` acima: aquele preenche 0/0 quando
  // não há config, e um zero preenchido faria a tela dizer "seu teto é R$ 0" para
  // quem, na verdade, não tem taxa nenhuma naquela casa. Ausência ≠ R$ 0.
  const queue = useMemo(
    () => buildUplineQueue(partnerships, [...directIds], houses, configs[ownId] ?? null),
    [partnerships, directIds, houses, configs, ownId],
  );

  // A casa selecionada recorta os NÚMEROS, não a lista: a hora de definir a
  // comissão de um afiliado numa casa é justamente antes de ele produzir nela, e
  // esconder quem ainda não produziu deixaria essa taxa impossível de configurar.
  // Para estreitar a lista, o filtro de atividade continua ali (já recortado).
  const filteredSubs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return subs.filter((s) => {
      const matchesSearch = !term || s.name.toLowerCase().includes(term) || s.id.toLowerCase().includes(term);
      const matchesActivity =
        activityFilter === 'all' || (activityFilter === 'producing' ? s.producing : !s.producing);
      return matchesSearch && matchesActivity;
    });
  }, [subs, searchTerm, activityFilter]);

  // Semente dos campos: o override que o sub JÁ tem naquela casa, ou vazio. Trocar
  // de casa reescreve a semente inteira; sem casa não há campo, então não há
  // rascunho a guardar (e um rascunho velho não pode vazar para a casa seguinte).
  useEffect(() => {
    if (!selectedHouseKey) { setSubEdits({}); return; }
    const seed: Record<string, RateDraft> = {};
    (special?.subAffiliateIds ?? []).forEach((sid) => {
      const id = String(sid);
      seed[id] = houseRateDraft(configs[id], selectedHouseKey);
    });
    setSubEdits(seed);
  }, [selectedHouseKey, configs, special]);

  // O campo guarda o texto CRU (dá para apagar e redigitar). O teto é validado no
  // save por `pricingError`, a MESMA pura que a fila do gerente usa: clampar em
  // silêncio grava um número que o gerente não digitou.
  const handleSubChange = (id: string, field: 'cpaValue' | 'revPercentage', value: string) => {
    setSubEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_RATE_DRAFT), [field]: value } }));
  };

  const handleSaveSub = async (id: string) => {
    if (!selectedHouseKey) return;
    const draft = subEdits[id] ?? EMPTY_RATE_DRAFT;
    if (isIncompleteRateDraft(draft)) {
      push({ type: 'error', message: `Preencha o CPA e o REV do afiliado em ${selectedHouseName}. Use 0 onde ele não recebe.` });
      return;
    }
    const rates = { cpaValue: Number(draft.cpaValue) || 0, revPercentage: Number(draft.revPercentage) || 0 };
    const erro = pricingError({ cap: houseCap, capConfigured: houseCapConfigured }, rates);
    if (erro) { push({ type: 'error', message: erro }); return; }
    setSavingSub(id);
    try {
      await saveSubAffiliateConfig(id, rates.cpaValue, rates.revPercentage, selectedHouseKey);
      push({ type: 'success', message: `Comissão em ${selectedHouseName} atualizada. Vale a partir de amanhã.` });
      await load();
    } catch (err) {
      push({ type: 'error', message: err instanceof Error ? err.message : 'Falha ao salvar comissão.' });
    } finally {
      setSavingSub(null);
    }
  };

  // Badges de marca + atividade (produção no período), reusados na tabela (desktop)
  // e nos cards (mobile).
  const renderBadges = (r: any, producing: boolean) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      {getBrandName(r) && (
        <span className="inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-neutral-800 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400">
          {getBrandName(r)}
        </span>
      )}
      <span className={cn(
        'inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border',
        producing
          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200/60 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400'
          : 'bg-slate-50 dark:bg-neutral-800/60 border-slate-200/60 dark:border-neutral-700/60 text-slate-400 dark:text-neutral-500'
      )}>
        <span className={cn('w-1.5 h-1.5 rounded-full', producing ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-neutral-600')} />
        {producing ? 'Com produção' : 'Sem produção'}
      </span>
    </div>
  );

  // Chip de link: copia o /go e mostra a casa + cliques. Reusado na coluna dos
  // subs E na faixa "Seus links" (a especial precisa copiar o PRÓPRIO link aqui —
  // "Meus Links" só existe com o marketplace ligado, e a Infinity o tem desligado).
  const renderLinkChip = (l: AffiliateLink) => (
    <button
      key={l.code}
      type="button"
      onClick={() => copyLink(l.code)}
      title={`Copiar ${buildGoUrl(l.code)}`}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 text-[10px] font-bold text-slate-600 dark:text-neutral-300 hover:border-accent-500/40 hover:text-accent-600 dark:hover:text-accent-400 transition-all"
    >
      {copied === l.code ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
      <span className="max-w-[110px] truncate">{houseNameOf(l.brandId) || l.code}</span>
      <span className="font-medium text-slate-400 dark:text-neutral-500">{pluralize(l.clicks ?? 0, 'clique')}</span>
    </button>
  );

  // Links do sub: só os chips para copiar. Cunhar o link da casa é da AGÊNCIA
  // (15/08) — a tag que a casa devolve no relatório sai do cadastro dela.
  const renderLinkCell = (id: string) => {
    const subLinks = deliverableLinksOf(id);
    if (subLinks.length === 0) {
      return (
        <span className="text-[10px] font-bold text-slate-400 dark:text-neutral-500">
          Sem link ainda. Peça à agência.
        </span>
      );
    }
    return <div className="flex flex-col items-start gap-1.5">{subLinks.map(renderLinkChip)}</div>;
  };

  if (profile && !profile.isSpecial) return <Navigate to="/dashboard" replace />;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={40} className="text-accent-500 animate-spin" />
        <p className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest animate-pulse">Carregando seus afiliados...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 mb-3 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
            Sua rede
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
            <span className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/20">
              <Users size={24} className="text-accent-500" />
            </span>
            Meus afiliados
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">{pluralize(subIds.length, 'sub-afiliado vinculado', 'sub-afiliados vinculados')}. Defina a comissão de cada um e abra os dados individuais.</p>
        </div>
        <div className="flex flex-col items-start md:items-end gap-3">
          <DateRangePicker value={range} onChange={setRange} />
          <div className="flex items-center gap-2 flex-wrap md:justify-end">
            {/* Link de cadastro na rede (15/08): o caminho SEM fila. A indicação
                (botão ao lado) continua existindo para quem prefere que a agência
                confirme antes. */}
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 dark:border-neutral-700 text-[11px] font-bold text-slate-600 dark:text-neutral-300 hover:border-accent-500/40 hover:text-accent-600 dark:hover:text-accent-400 transition-all"
            >
              <Link2 size={14} /> Link de cadastro
            </button>
            {/* Indicação (call 12/08): abre a fila da agência, não cria nada aqui. */}
            <button
              type="button"
              onClick={() => setReferOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent-500 text-accent-contrast text-[11px] font-bold hover:opacity-90 transition-all shadow-sm"
            >
              <UserPlus size={14} /> Indicar afiliado
            </button>
          </div>
        </div>
      </motion.header>

      {/* Links PRÓPRIOS da especial — copiáveis daqui mesmo (item 1). */}
      {deliverableLinksOf(ownId).length > 0 && (
        <div className="p-4 rounded-2xl border border-slate-200/70 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-2 flex items-center gap-1.5">
            <Link2 size={12} /> Seus links de divulgação
          </p>
          <div className="flex flex-wrap gap-2">{deliverableLinksOf(ownId).map(renderLinkChip)}</div>
        </div>
      )}

      {/* Indicações aguardando a confirmação da agência — acompanhamento do gerente. */}
      {referrals.some((r) => r.status !== 'archived') && (
        <div className="p-4 rounded-2xl border border-slate-200/70 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-2 flex items-center gap-1.5">
            <Clock size={12} /> Indicações aguardando aprovação da agência
          </p>
          <div className="flex flex-wrap gap-2">
            {referrals.filter((r) => r.status !== 'archived').map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60 text-[11px] font-bold text-slate-600 dark:text-neutral-300">
                {humanizeName(r.name)}
                <span className="font-medium text-slate-400 dark:text-neutral-500">· {r.email}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* FILA DE PARCERIAS. Nos acordos gerenciados o afiliado escolhe a casa na
          vitrine e quem define a comissão dele é o gerente. O link continua sendo
          emitido pela agência, de propósito: assim ninguém entra numa casa cuja
          operação foi pausada. Só aparece quando há fila. */}
      {queue.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden"
        >
          <div className="p-4 border-b border-slate-100 dark:border-neutral-800">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 flex items-center gap-1.5">
              <Clock size={12} /> Solicitações de parceria ({queue.length})
            </p>
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
              Defina quanto cada afiliado recebe nesta casa. A diferença para a sua taxa fica com você. Depois a agência emite o link.
            </p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-neutral-800">
            {queue.map((item) => {
              const rates = queueRates(item.request.id);
              const erro = pricingError(item, rates);
              const sobra = spreadPreview(item, rates);
              const id = item.request.id;
              const setRate = (patch: Partial<{ cpaValue: string; revPercentage: string }>) =>
                setQueueEdits((prev) => ({ ...prev, [id]: { ...rates, ...patch } }));
              return (
                <div key={id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {humanizeName(nameFromPool[String(item.request.affiliateId)] || `#${item.request.affiliateId}`)}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-neutral-500 truncate">
                      {item.houseName}
                      {item.capConfigured && (
                        <> · sua taxa: R$ {item.cap.cpaValue}/CPA e {item.cap.revPercentage}% REV</>
                      )}
                    </p>
                  </div>
                  {item.capConfigured ? (
                    <div className="flex items-end gap-2 flex-wrap">
                      <label className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">CPA (R$)</span>
                        <input
                          type="number" min="0" step="0.01" value={rates.cpaValue}
                          onChange={(e) => setRate({ cpaValue: e.target.value })}
                          placeholder="0,00"
                          className="mt-1 w-24 px-2.5 py-2 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs dark:text-white outline-none focus:ring-2 focus:ring-accent-500/30"
                        />
                      </label>
                      <label className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">REV (%)</span>
                        <input
                          type="number" min="0" step="0.1" value={rates.revPercentage}
                          onChange={(e) => setRate({ revPercentage: e.target.value })}
                          placeholder="0"
                          className="mt-1 w-20 px-2.5 py-2 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs dark:text-white outline-none focus:ring-2 focus:ring-accent-500/30"
                        />
                      </label>
                      <span className="text-[10px] text-slate-400 dark:text-neutral-500 pb-2 whitespace-nowrap">
                        fica com você: R$ {sobra.cpaValue.toFixed(2)}/CPA
                      </span>
                      <button
                        type="button" onClick={() => priceQueueItem(item)} disabled={!!erro || queueBusy === id}
                        className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
                      >
                        {queueBusy === id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Definir comissão
                      </button>
                      <button
                        type="button" onClick={() => rejectQueueItem(item)} disabled={queueBusy === id}
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 text-xs font-bold hover:text-red-500 hover:border-red-300 disabled:opacity-40 flex items-center gap-1.5"
                      >
                        <X size={13} /> Recusar
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 max-w-sm">
                      Você ainda não tem taxa nesta casa. Peça à agência antes de definir a comissão do seu afiliado.
                    </p>
                  )}
                  {erro && item.capConfigured && (
                    <p className="text-[11px] text-red-500 lg:basis-full">{erro}</p>
                  )}
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {subIds.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-16 text-center rounded-3xl border border-slate-200/70 dark:border-neutral-800 bg-white dark:bg-neutral-900/60">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl border border-slate-100 dark:border-neutral-700/60 bg-slate-50 dark:bg-neutral-800/60 text-slate-500 dark:text-neutral-300 mb-4">
            <Users size={24} />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100 mb-1">Nenhum sub-afiliado vinculado</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400">Fale com o administrador para vincular afiliados à sua rede.</p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden transition-colors">
          {/* Filtros — busca, marca e atividade na rede + teto. Espelham a /affiliates
              do master, capados à rede do especial (especial = master escopado). */}
          <div className="p-4 border-b border-slate-100 dark:border-neutral-800 flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
            <div className="relative w-full lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-400" size={16} />
              <input
                type="text"
                placeholder="Buscar por nome ou ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-full text-xs outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all dark:text-white"
              />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {selectedHouseKey && houseCapConfigured && (
                <span className="hidden xl:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                  Teto em {selectedHouseName}: R$ {houseCap.cpaValue}/CPA · {houseCap.revPercentage}% REV
                </span>
              )}
              <BrandFilter brands={houseNames} value={brandFilter} onChange={setBrandFilter} showSingle />
              <div className="flex items-center gap-1.5">
                {([
                  { k: 'all', l: 'Todos' },
                  { k: 'producing', l: 'Com produção' },
                  { k: 'idle', l: 'Sem produção' },
                ] as const).map((opt) => {
                  const active = activityFilter === opt.k;
                  return (
                    <button
                      key={opt.k}
                      type="button"
                      onClick={() => setActivityFilter(opt.k)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-bold transition-all border',
                        active
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-neutral-900 border-transparent shadow-sm'
                          : 'bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300 border-slate-200 dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700'
                      )}
                    >
                      {opt.l}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Estado do gesto de comissão: sem casa não há edição; com casa, mas sem
              taxa própria nela, também não (ausência ≠ R$ 0, quem resolve é a agência). */}
          {!selectedHouseKey ? (
            <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800 bg-slate-50/60 dark:bg-neutral-800/20">
              <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                <b className="text-slate-700 dark:text-neutral-200">Comissão por casa:</b> {PICK_HOUSE_HINT}
              </p>
            </div>
          ) : !houseCapConfigured ? (
            <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800 bg-amber-50/70 dark:bg-amber-900/10">
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Você ainda não tem taxa em {selectedHouseName}. Peça à agência antes de definir a comissão dos seus afiliados nesta casa.
              </p>
            </div>
          ) : null}

          {filteredSubs.length === 0 ? (
            <div className="p-24 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl border border-slate-100 dark:border-neutral-700/60 bg-slate-50 dark:bg-neutral-800/60 text-slate-500 dark:text-neutral-300 mb-4">
                <Search size={24} />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100 mb-1">Nenhum sub-afiliado encontrado</h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400">Ajuste a busca ou os filtros para ver sua rede.</p>
            </div>
          ) : (
            <>
              {/* Desktop · tabela (mesmo padrão da Gestão de Afiliados — escala para listas grandes) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 dark:bg-neutral-800/40 text-[10px] text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-widest border-b border-slate-100 dark:border-neutral-800">
                      <th className="px-6 py-4">Sub-afiliado</th>
                      <th className="px-6 py-4 text-right">Cadastros</th>
                      <th className="px-6 py-4 text-right">Depósitos</th>
                      <th className="px-6 py-4 text-right">CPA Qualif.</th>
                      <th className="px-6 py-4 text-right">Seu ganho</th>
                      <th className="px-6 py-4">Link de divulgação</th>
                      {selectedHouseKey && (
                        <>
                          <th className="px-6 py-4">Comissão CPA (R$)</th>
                          <th className="px-6 py-4">Comissão REV (%)</th>
                        </>
                      )}
                      <th className="px-6 py-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-neutral-800 text-xs">
                    {filteredSubs.map(({ id, name, producing, row: r, metrics }) => {
                      // Seu ganho = spread (taxa própria − taxa do sub) sobre a produção
                      // dele, precificada POR CASA (perHousePayout) dos dois lados.
                      const spread = payoutOf.breakdownFor(id, ownConfig).total - payoutOf.breakdownFor(id, configs[id]).total;
                      const canEdit = !!selectedHouseKey && houseCapConfigured && directIds.has(id);
                      const draft = subEdits[id] ?? EMPTY_RATE_DRAFT;
                      return (
                        <tr
                          key={id}
                          className="hover:bg-slate-50/70 dark:hover:bg-white/[0.03] transition-colors group cursor-pointer"
                          onClick={() => navigate(`/affiliates/${id}`)}
                        >
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-slate-800 dark:text-neutral-100">{name}</span>
                              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-neutral-500">Sub #{id}</span>
                              {renderBadges(r, producing)}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right tabular-nums font-bold text-slate-700 dark:text-neutral-200">{metrics.registrations.toLocaleString('pt-BR')}</td>
                          <td className="px-6 py-4 text-right tabular-nums font-bold text-slate-700 dark:text-neutral-200">{metrics.first_deposits.toLocaleString('pt-BR')}</td>
                          <td className="px-6 py-4 text-right tabular-nums font-bold text-slate-700 dark:text-neutral-200">{metrics.qualified_cpa.toLocaleString('pt-BR')}</td>
                          <td className="px-6 py-4 text-right tabular-nums font-black text-emerald-600 dark:text-emerald-400">{brl(spread)}</td>
                          <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                            {renderLinkCell(id)}
                          </td>
                          {selectedHouseKey && (
                            <>
                              <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                <div className="relative w-28">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 dark:text-neutral-500">R$</span>
                                  <input
                                    type="number" min="0" max={houseCap.cpaValue} step="0.01"
                                    value={draft.cpaValue}
                                    placeholder="Sem taxa"
                                    onChange={(e) => handleSubChange(id, 'cpaValue', e.target.value)}
                                    disabled={!canEdit}
                                    title={directIds.has(id) ? undefined : INDIRECT_HINT}
                                    className="w-28 pl-7 pr-2 py-1.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all dark:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                  />
                                </div>
                              </td>
                              <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                <div className="relative w-28">
                                  <Percent size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 dark:text-neutral-500" />
                                  <input
                                    type="number" min="0" max={houseCap.revPercentage} step="0.1"
                                    value={draft.revPercentage}
                                    placeholder="Sem taxa"
                                    onChange={(e) => handleSubChange(id, 'revPercentage', e.target.value)}
                                    disabled={!canEdit}
                                    title={directIds.has(id) ? undefined : INDIRECT_HINT}
                                    className="w-28 pl-6 pr-2 py-1.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all dark:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                  />
                                </div>
                              </td>
                            </>
                          )}
                          <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              {selectedHouseKey && (
                                <button
                                  onClick={() => handleSaveSub(id)}
                                  disabled={savingSub === id || !canEdit}
                                  title={canEdit ? `Salvar comissão em ${selectedHouseName}` : INDIRECT_HINT}
                                  className="p-2 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-500 hover:text-accent-contrast dark:bg-accent-900/10 dark:text-accent-400 dark:hover:bg-accent-500 dark:hover:text-accent-contrast transition-all disabled:opacity-50"
                                >
                                  {savingSub === id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                </button>
                              )}
                              <button
                                onClick={() => navigate(`/affiliates/${id}`)}
                                title="Ver dados do afiliado"
                                className="p-2 rounded-lg border bg-slate-50 dark:bg-neutral-800/60 border-slate-100 dark:border-neutral-700/60 text-slate-400 dark:text-neutral-500 hover:text-accent-500 hover:border-accent-500/30 transition-colors"
                              >
                                <ArrowUpRight size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile · cards */}
              <div className="md:hidden divide-y divide-slate-100 dark:divide-neutral-800">
                {filteredSubs.map(({ id, name, producing, row: r, metrics }) => {
                  // Mesmo spread por casa do desktop — antes o mobile usava só a
                  // taxa de topo e os dois divergiam com byBrand.
                  const spread = payoutOf.breakdownFor(id, ownConfig).total - payoutOf.breakdownFor(id, configs[id]).total;
                  const canEdit = !!selectedHouseKey && houseCapConfigured && directIds.has(id);
                  const draft = subEdits[id] ?? EMPTY_RATE_DRAFT;
                  const stats = [
                    { label: 'Cadastros', value: metrics.registrations.toLocaleString('pt-BR') },
                    { label: 'Depósitos', value: metrics.first_deposits.toLocaleString('pt-BR') },
                    { label: 'CPA Qualif.', value: metrics.qualified_cpa.toLocaleString('pt-BR') },
                  ];
                  return (
                    <div key={id} className="p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{name}</p>
                          <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-neutral-500 mt-0.5 truncate">Sub #{id}</p>
                          <div className="mt-1.5">{renderBadges(r, producing)}</div>
                        </div>
                        <button
                          onClick={() => navigate(`/affiliates/${id}`)}
                          title="Ver dados do afiliado"
                          className="shrink-0 p-2 rounded-xl border bg-slate-50 dark:bg-neutral-800/60 border-slate-100 dark:border-neutral-700/60 text-slate-400 dark:text-neutral-500 hover:text-accent-500 hover:border-accent-500/30 transition-colors"
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {stats.map((s) => (
                          <div key={s.label}>
                            <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 dark:text-neutral-500">{s.label}</span>
                            <p className="font-bold text-base text-slate-800 dark:text-white mt-0.5 truncate">{s.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                          <Crown size={11} /> Seu ganho
                        </span>
                        <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 tabular-nums">{brl(spread)}</span>
                      </div>
                      <div className="pt-3 border-t border-slate-100 dark:border-neutral-800">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest mb-2">Link de divulgação</p>
                        {renderLinkCell(id)}
                      </div>
                      {selectedHouseKey && (
                        <div className="pt-3 border-t border-slate-100 dark:border-neutral-800">
                          <p className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest mb-2">
                            Comissão em {selectedHouseName}{' '}
                            <span className="normal-case font-medium">
                              {canEdit
                                ? `(teto: R$ ${houseCap.cpaValue}/CPA · ${houseCap.revPercentage}% REV)`
                                : directIds.has(id) ? '(sem taxa sua nesta casa)' : '(indicado indireto)'}
                            </span>
                          </p>
                          {!directIds.has(id) && (
                            <p className="mb-2 text-[10px] text-slate-500 dark:text-neutral-400">{INDIRECT_HINT}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 dark:text-neutral-500">R$</span>
                              <input
                                type="number" min="0" max={houseCap.cpaValue} step="0.01"
                                value={draft.cpaValue}
                                placeholder="Sem taxa"
                                onChange={(e) => handleSubChange(id, 'cpaValue', e.target.value)}
                                disabled={!canEdit}
                                className="disabled:opacity-40 disabled:cursor-not-allowed w-full pl-7 pr-2 py-2 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all dark:text-white"
                              />
                            </div>
                            <div className="relative flex-1">
                              <Percent size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 dark:text-neutral-500" />
                              <input
                                type="number" min="0" max={houseCap.revPercentage} step="0.1"
                                value={draft.revPercentage}
                                placeholder="Sem taxa"
                                onChange={(e) => handleSubChange(id, 'revPercentage', e.target.value)}
                                disabled={!canEdit}
                                className="disabled:opacity-40 disabled:cursor-not-allowed w-full pl-6 pr-2 py-2 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all dark:text-white"
                              />
                            </div>
                            <button
                              onClick={() => handleSaveSub(id)}
                              disabled={savingSub === id || !canEdit}
                              className="p-2 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-500 hover:text-accent-contrast dark:bg-accent-900/10 dark:text-accent-400 dark:hover:bg-accent-500 dark:hover:text-accent-contrast transition-all disabled:opacity-50"
                            >
                              {savingSub === id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="p-4 bg-slate-50/60 dark:bg-neutral-800/20 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between">
            <p className="text-[10px] text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-widest">
              Exibindo {filteredSubs.length} de {pluralize(subIds.length, 'sub-afiliado')}
            </p>
          </div>
        </motion.div>
      )}

      {/* Modal de indicação — só coleta e envia pra fila da agência (/solicitacoes).
          Quem cria o afiliado, convida e vincula à rede é o MASTER, na aprovação. */}
      {referOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !sendingReferral && setReferOpen(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-3xl border border-slate-200 dark:border-neutral-800 shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus size={16} className="text-accent-500" /> Indicar afiliado
              </h3>
              <button type="button" onClick={() => setReferOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 transition-colors" aria-label="Fechar">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[12px] text-slate-500 dark:text-neutral-400">
                A agência confirma o cadastro: o indicado recebe o <b>convite de acesso</b> por e-mail e entra na <b>sua rede</b>.
              </p>
              {[
                { key: 'name' as const, label: 'Nome *', type: 'text', placeholder: 'Nome do indicado' },
                { key: 'email' as const, label: 'E-mail *', type: 'email', placeholder: 'email@exemplo.com — o convite vai para ele' },
                { key: 'phone' as const, label: 'Telefone', type: 'tel', placeholder: '(11) 99999-9999 (opcional)' },
              ].map((f) => (
                <label key={f.key} className="block">
                  <span className="block mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">{f.label}</span>
                  <input
                    type={f.type}
                    value={referForm[f.key]}
                    onChange={(e) => setReferForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all dark:text-white"
                  />
                </label>
              ))}
              <label className="block">
                <span className="block mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">Observação</span>
                <textarea
                  rows={2}
                  value={referForm.note}
                  onChange={(e) => setReferForm((s) => ({ ...s, note: e.target.value }))}
                  placeholder="Contexto pra agência (opcional)"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all dark:text-white resize-none"
                />
              </label>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button
                type="button"
                onClick={() => setReferOpen(false)}
                disabled={sendingReferral}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-300 hover:border-slate-300 dark:hover:border-neutral-600 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={sendingReferral || !referForm.name.trim() || !referForm.email.trim()}
                onClick={handleSendReferral}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent-500 text-accent-contrast text-xs font-bold hover:opacity-90 transition-all disabled:opacity-50"
              >
                {sendingReferral ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Enviar indicação
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal do link de cadastro na rede (15/08). Quem entra por ele já nasce
          afiliado DENTRO da equipe, sem passar pela fila da agência. O que este
          link NÃO faz é cunhar link de casa: isso continua sendo do master. */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !inviteBusy && setInviteOpen(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-3xl border border-slate-200 dark:border-neutral-800 shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Link2 size={16} className="text-accent-500" /> Link de cadastro na sua rede
              </h3>
              <button type="button" onClick={() => setInviteOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 transition-colors" aria-label="Fechar">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[12px] text-slate-500 dark:text-neutral-400">
                Quem se cadastrar por este link entra <b>direto na sua equipe</b>, sem precisar de aprovação da
                agência. O link de divulgação da casa continua sendo gerado pela agência.
              </p>
              {inviteCode ? (
                <>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-1.5">Seu link</p>
                    <code className="block px-3 py-2 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-[11px] text-slate-700 dark:text-neutral-200 break-all">{inviteUrl}</code>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-neutral-500">
                    {inviteUses === 0
                      ? 'Nenhum cadastro por este link ainda.'
                      : `${pluralize(inviteUses, 'cadastro')} por este link.`}
                  </p>
                </>
              ) : (
                <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400">
                  Você ainda não tem um link. Gere o seu para começar a divulgar.
                </p>
              )}
            </div>
            <div className="flex gap-3 p-6 pt-0">
              {inviteCode ? (
                <>
                  <button
                    type="button"
                    disabled={inviteBusy}
                    onClick={() => handleNetworkInvite(true)}
                    title="Gera um link novo. Quem tiver o link antigo não consegue mais se cadastrar."
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-300 hover:border-slate-300 dark:hover:border-neutral-600 transition-all disabled:opacity-50"
                  >
                    {inviteBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Gerar link novo
                  </button>
                  <button
                    type="button"
                    onClick={copyInviteUrl}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent-500 text-accent-contrast text-xs font-bold hover:opacity-90 transition-all"
                  >
                    {inviteCopied ? <Check size={14} /> : <Copy size={14} />}
                    {inviteCopied ? 'Copiado' : 'Copiar link'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={inviteBusy}
                  onClick={() => handleNetworkInvite(false)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent-500 text-accent-contrast text-xs font-bold hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {inviteBusy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                  Gerar meu link de cadastro
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
