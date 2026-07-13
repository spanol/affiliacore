import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Gift, X, Save, Loader2, Trash2, Pencil, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from '../contexts/ToastContext';
import {
  PRIZE_DESCRIPTION_MAX,
  PRIZE_MAX_POSITION,
  PRIZE_TITLE_MAX,
  positionLabel,
  sanitizePrize,
  sortPrizes,
} from '../lib/prizes';
import { Prize, createPrize, updatePrize, deletePrize } from '../services/prizeService';

interface Props {
  // Lista realtime do pai (o /ranking já assina ranking_prizes) — o modal só
  // dispara os writes; a lista se atualiza sozinha pelo onSnapshot.
  prizes: Prize[];
  onClose: () => void;
}

// Gestão das premiações por posição do ranking (chamariz de captação da
// instância). A exclusão é em DOIS cliques (sem window.confirm — dialog nativo
// travaria a automação de browser dos smoke tests).
export default function PrizeManagerModal({ prizes, onClose }: Props) {
  const { push } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [position, setPosition] = useState('1');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setPosition('1');
    setTitle('');
    setDescription('');
    setActive(true);
  };

  const startEdit = (prize: Prize) => {
    setEditingId(prize.id);
    setPosition(String(prize.position));
    setTitle(prize.title);
    setDescription(prize.description || '');
    setActive(prize.active);
    setConfirmingDelete(null);
  };

  const handleSave = async () => {
    const parsed = sanitizePrize({ position, title, description, active });
    if (!parsed.ok) {
      push({ type: 'error', message: parsed.error });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updatePrize(editingId, parsed.value);
        push({ type: 'success', message: 'Premiação atualizada.' });
      } else {
        await createPrize(parsed.value);
        push({ type: 'success', message: 'Premiação cadastrada.' });
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
      await deletePrize(id);
      if (editingId === id) resetForm();
      push({ type: 'success', message: 'Premiação removida.' });
    } catch (err) {
      push({ type: 'error', message: err instanceof Error ? err.message : 'Falha ao remover.' });
    } finally {
      setDeleting(false);
      setConfirmingDelete(null);
    }
  };

  const sorted = sortPrizes(prizes);

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
          className="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200/70 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[calc(100vh_-_2rem)]"
        >
          <div className="shrink-0 p-6 border-b border-slate-100 dark:border-neutral-800 flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-2 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-bold uppercase tracking-widest">
                <Gift size={12} /> Premiações
              </span>
              <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Prêmios do ranking
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
                Aparecem no pódio e na página pública — o chamariz para novos afiliados.
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 min-h-0 p-6 space-y-5 overflow-y-auto">
            {/* Form de criação/edição */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-neutral-800/40 border border-slate-100 dark:border-neutral-800 space-y-4">
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <div>
                  <label className={labelClass}>Posição</label>
                  <input
                    type="number"
                    min={1}
                    max={PRIZE_MAX_POSITION}
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Prêmio</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex.: R$ 5.000 · iPhone 16 Pro"
                    className={inputClass}
                    maxLength={PRIZE_TITLE_MAX}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Descrição (opcional)</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: Para o 1º lugar do ranking de julho"
                  className={inputClass}
                  maxLength={PRIZE_DESCRIPTION_MAX}
                />
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

            {/* Lista das premiações existentes */}
            {sorted.length === 0 ? (
              <p className="text-center text-xs text-slate-400 dark:text-neutral-500 py-6">
                Nenhuma premiação cadastrada ainda.
              </p>
            ) : (
              <div className="rounded-2xl border border-slate-100 dark:border-neutral-800 divide-y divide-slate-100 dark:divide-neutral-800 overflow-hidden">
                {sorted.map((prize) => (
                  <div key={prize.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="shrink-0 inline-flex items-center justify-center min-w-9 h-9 px-2 rounded-xl bg-accent-500/10 text-accent-600 dark:text-accent-400 text-xs font-black">
                      {prize.position}º
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-neutral-100 truncate">{prize.title}</p>
                      <p className="text-[11px] text-slate-500 dark:text-neutral-400 truncate">
                        {positionLabel(prize.position)}
                        {prize.description ? ` · ${prize.description}` : ''}
                      </p>
                    </div>
                    {!prize.active && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
                        Inativa
                      </span>
                    )}
                    <button
                      onClick={() => startEdit(prize)}
                      title="Editar"
                      className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-accent-500 hover:bg-accent-500/10 transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(prize.id)}
                      disabled={deleting}
                      title={confirmingDelete === prize.id ? 'Clique de novo para confirmar' : 'Remover'}
                      className={cn(
                        'shrink-0 p-2 rounded-lg transition-colors disabled:opacity-50',
                        confirmingDelete === prize.id
                          ? 'text-red-500 bg-red-500/10'
                          : 'text-slate-400 hover:text-red-500 hover:bg-red-500/10',
                      )}
                    >
                      {confirmingDelete === prize.id ? (
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
