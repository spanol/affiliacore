import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Award, X, Save, Loader2, Trash2, Pencil, Plus, ImageIcon, Gift, Lock } from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from '../contexts/ToastContext';
import {
  TIER_TITLE_MAX,
  TIER_SUBTITLE_MAX,
  TIER_DESCRIPTION_MAX,
  TIER_IMAGE_MAX_CHARS,
  sanitizeTier,
  sortTiers,
  tierMetaLabel,
  parseMetaValue,
  previewTotals,
  type PreviewState,
} from '../lib/achievements';
import AchievementCard from './AchievementCard';
import {
  AchievementTierDoc,
  createAchievementTier,
  updateAchievementTier,
  deleteAchievementTier,
} from '../services/achievementService';

interface Props {
  // Lista realtime do pai (a página já assina achievement_tiers) — o modal só
  // dispara os writes; a lista se atualiza sozinha pelo onSnapshot.
  tiers: AchievementTierDoc[];
  onClose: () => void;
}

// Gestão das conquistas por meta individual. Exclusão em DOIS cliques (sem
// window.confirm — dialog nativo travaria a automação de browser dos smokes),
// mesmo padrão do PrizeManagerModal.
export default function AchievementManagerModal({ tiers, onClose }: Props) {
  const { push } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [metaCpas, setMetaCpas] = useState('0');
  const [metaCommission, setMetaCommission] = useState('');
  const [order, setOrder] = useState('0');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>('progress');

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setSubtitle('');
    setMetaCpas('0');
    setMetaCommission('');
    setOrder('0');
    setDescription('');
    setImageUrl('');
    setActive(true);
  };

  const startEdit = (tier: AchievementTierDoc) => {
    setEditingId(tier.id);
    setTitle(tier.title || '');
    setSubtitle(tier.subtitle || '');
    setMetaCpas(String(tier.metaCpas ?? 0));
    setMetaCommission(tier.metaCommission ? String(tier.metaCommission) : '');
    setOrder(String(tier.order ?? 0));
    setDescription(tier.description || '');
    setImageUrl(tier.imageUrl || '');
    setActive(tier.active);
    setConfirmingDelete(null);
  };

  // Imagem vira data URL (mesmo caminho do preset de casas) — sem rota de upload
  // nova. O teto existe porque o doc vai por onSnapshot para TODO cliente logado.
  const handleImageFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      if (result.length > TIER_IMAGE_MAX_CHARS) {
        push({ type: 'error', message: 'Imagem muito grande — use uma versão menor (até ~300 KB).' });
        return;
      }
      setImageUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const parsed = sanitizeTier({ title, subtitle, metaCpas, metaCommission, order, description, imageUrl, active });
    if (!parsed.ok) {
      push({ type: 'error', message: parsed.error });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateAchievementTier(editingId, parsed.value);
        push({ type: 'success', message: 'Conquista atualizada.' });
      } else {
        await createAchievementTier(parsed.value);
        push({ type: 'success', message: 'Conquista cadastrada.' });
      }
      resetForm();
    } catch (err) {
      push({ type: 'error', message: err instanceof Error ? err.message : 'Falha ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmingDelete !== id) {
      setConfirmingDelete(id);
      return;
    }
    setDeleting(true);
    try {
      await deleteAchievementTier(id);
      if (editingId === id) resetForm();
      push({ type: 'success', message: 'Conquista removida.' });
    } catch (err) {
      push({ type: 'error', message: err instanceof Error ? err.message : 'Falha ao remover.' });
    } finally {
      setDeleting(false);
      setConfirmingDelete(null);
    }
  };

  const sorted = sortTiers(tiers);

  // Prévia ao vivo: o card que o AFILIADO vai ver, montado do form ainda não
  // salvo. Metas vêm de `parseMetaValue` (mesmo parser do save), então o que a
  // prévia desenha é o que vai ser gravado.
  const previewTier = {
    title: title.trim() || 'Título do prêmio',
    subtitle: subtitle.trim(),
    description: description.trim(),
    imageUrl,
    metaCpas: parseMetaValue(metaCpas) ?? 0,
    metaCommission: parseMetaValue(metaCommission) ?? 0,
    active,
  };
  const preview = previewTotals(previewTier, previewState);
  const previewUnlocked = previewState === 'unlocked';

  const inputClass =
    'w-full px-4 py-3 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all outline-none';
  const labelClass =
    'text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest ml-1 block mb-2';

  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center p-4">
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-xl bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200/70 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[calc(100vh_-_2rem)]"
        >
          <div className="shrink-0 p-6 border-b border-slate-100 dark:border-neutral-800 flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-2 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-bold uppercase tracking-widest">
                <Award size={12} /> Conquistas
              </span>
              <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Prêmios por meta
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
                O afiliado desbloqueia ao atingir a meta e solicita o prêmio. Meta em 0 é ignorada.
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 min-h-0 p-6 space-y-5 overflow-y-auto">
            {/* Form de criação/edição */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-neutral-800/40 border border-slate-100 dark:border-neutral-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Título</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex.: Placa de 10K"
                    className={inputClass}
                    maxLength={TIER_TITLE_MAX}
                  />
                </div>
                <div>
                  <label className={labelClass}>Tier / subtítulo</label>
                  <input
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="Ex.: SILVER"
                    className={inputClass}
                    maxLength={TIER_SUBTITLE_MAX}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Meta em CPAs</label>
                  <input
                    type="number"
                    min={0}
                    value={metaCpas}
                    onChange={(e) => setMetaCpas(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Meta em comissão (R$)</label>
                  <input
                    value={metaCommission}
                    onChange={(e) => setMetaCommission(e.target.value)}
                    placeholder="10.000,00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Ordem</label>
                  <input
                    type="number"
                    min={0}
                    value={order}
                    onChange={(e) => setOrder(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Descrição (opcional)</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: Placa emoldurada com seu nome, entregue via Correios."
                  className={inputClass}
                  maxLength={TIER_DESCRIPTION_MAX}
                />
              </div>

              <div>
                <label className={labelClass}>Imagem do prêmio (opcional)</label>
                <div className="flex items-center gap-3">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt=""
                      className="w-12 h-12 rounded-xl object-contain bg-slate-950 border border-slate-200 dark:border-neutral-700 shrink-0"
                    />
                  ) : (
                    <span className="w-12 h-12 rounded-xl bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 flex items-center justify-center text-slate-300 dark:text-neutral-600 shrink-0">
                      <ImageIcon size={18} />
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => handleImageFile(e.target.files?.[0])}
                    className="flex-1 min-w-0 text-[11px] text-slate-500 dark:text-neutral-400 file:mr-3 file:px-3 file:py-2 file:rounded-full file:border-0 file:bg-slate-900 dark:file:bg-white file:text-white dark:file:text-neutral-900 file:text-[10px] file:font-bold file:cursor-pointer"
                  />
                  {imageUrl && (
                    <button
                      onClick={() => setImageUrl('')}
                      className="shrink-0 px-3 py-2 rounded-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-[10px] font-bold text-slate-600 dark:text-neutral-300 hover:border-slate-300 dark:hover:border-neutral-600 transition-all"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>

              {/* Prévia do card — o admin desenha o prêmio vendo o resultado */}
              <div className="pt-1">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className={labelClass + ' mb-0'}>Prévia (como o afiliado vê)</label>
                  <div className="flex gap-1 shrink-0">
                    {(
                      [
                        ['progress', 'Em progresso'],
                        ['unlocked', 'Desbloqueado'],
                      ] as Array<[PreviewState, string]>
                    ).map(([state, label]) => (
                      <button
                        key={state}
                        type="button"
                        onClick={() => setPreviewState(state)}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border',
                          previewState === state
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-neutral-900 border-transparent'
                            : 'bg-white dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 border-slate-200 dark:border-neutral-700',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="max-w-[300px] mx-auto">
                  <AchievementCard
                    tier={previewTier}
                    totals={preview}
                    showProgress
                    footer={
                      <span
                        className={cn(
                          'w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold',
                          previewUnlocked
                            ? 'bg-accent-500 text-accent-contrast shadow-sm shadow-accent-500/20'
                            : 'bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500',
                        )}
                      >
                        {previewUnlocked ? <Gift size={14} /> : <Lock size={13} />}
                        {previewUnlocked ? 'Solicitar prêmio' : 'Bloqueado'}
                      </span>
                    }
                  />
                </div>
                <p className="text-[10px] text-slate-400 dark:text-neutral-500 text-center mt-2">
                  Progresso ilustrativo — cada afiliado vê o próprio número.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 accent-accent-500"
                  />
                  <span className="text-xs font-bold text-slate-600 dark:text-neutral-300">Ativa</span>
                </label>
                <div className="flex gap-2">
                  {editingId && (
                    <button
                      onClick={resetForm}
                      className="px-4 py-2 rounded-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-200 hover:border-slate-300 dark:hover:border-neutral-600 transition-all"
                    >
                      Cancelar edição
                    </button>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-5 py-2 rounded-full bg-accent-500 text-accent-contrast text-xs font-bold hover:bg-accent-400 transition-all shadow-sm shadow-accent-500/20 disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : editingId ? <Save size={14} /> : <Plus size={14} />}
                    {editingId ? 'Salvar' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </div>

            {/* Lista das conquistas existentes */}
            {sorted.length === 0 ? (
              <p className="text-center text-xs text-slate-400 dark:text-neutral-500 py-6">
                Nenhuma conquista cadastrada ainda.
              </p>
            ) : (
              <div className="rounded-2xl border border-slate-100 dark:border-neutral-800 divide-y divide-slate-100 dark:divide-neutral-800 overflow-hidden">
                {sorted.map((tier) => (
                  <div key={tier.id} className="flex items-center gap-3 px-4 py-3">
                    {tier.imageUrl ? (
                      <img src={tier.imageUrl} alt="" className="shrink-0 w-9 h-9 rounded-xl object-contain bg-slate-950 border border-slate-200 dark:border-neutral-700" />
                    ) : (
                      <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-accent-500/10 text-accent-600 dark:text-accent-400">
                        <Award size={16} />
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-neutral-100 truncate">
                        {tier.title}
                        {tier.subtitle ? <span className="text-slate-400 dark:text-neutral-500 font-medium"> · {tier.subtitle}</span> : null}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-neutral-400 truncate">
                        Meta: {tierMetaLabel(tier)}
                        {tier.description ? ` · ${tier.description}` : ''}
                      </p>
                    </div>
                    {!tier.active && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                        Inativa
                      </span>
                    )}
                    <button
                      onClick={() => startEdit(tier)}
                      title="Editar"
                      className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-accent-500 hover:bg-accent-500/10 transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(tier.id)}
                      disabled={deleting}
                      title={confirmingDelete === tier.id ? 'Clique de novo para confirmar' : 'Remover'}
                      className={cn(
                        'shrink-0 p-2 rounded-lg transition-colors disabled:opacity-50',
                        confirmingDelete === tier.id
                          ? 'text-red-500 bg-red-500/10'
                          : 'text-slate-400 hover:text-red-500 hover:bg-red-500/10',
                      )}
                    >
                      {confirmingDelete === tier.id ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-1">Confirmar?</span>
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>,
    document.body,
  );
}
