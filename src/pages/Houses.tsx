import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Navigate } from 'react-router-dom';
import {
  Building2, Plus, Loader2, Pencil, Trash2, X, Upload, Link2, Check, Power,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  House, HouseInput, fetchHouses, createHouse, updateHouse, deleteHouse, syncKnownBrandsFrom,
} from '../services/houseService';

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
  const [confirmDel, setConfirmDel] = useState<House | null>(null);
  const [deleting, setDeleting] = useState(false);

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
          <span className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Backoffice
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
            <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Building2 size={24} className="text-amber-500" />
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
          <Loader2 size={40} className="text-amber-500 animate-spin" />
          <p className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest animate-pulse">Carregando casas...</p>
        </div>
      ) : houses.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm p-24 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 text-amber-500 mb-4">
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
              className="group relative overflow-hidden p-6 rounded-2xl border bg-white dark:bg-neutral-900/60 border-slate-200/70 dark:border-neutral-800 shadow-sm hover:border-amber-300 dark:hover:border-amber-800 transition-all"
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
                  <dt className="text-slate-400 dark:text-neutral-500 font-medium">brandId (OTG)</dt>
                  <dd className="font-mono text-slate-600 dark:text-neutral-300 truncate max-w-[60%]" title={h.brandId || ''}>
                    {h.brandId || <span className="text-slate-300 dark:text-neutral-600">—</span>}
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
              </dl>

              <div className="flex gap-2">
                <button
                  onClick={() => setModal({ open: true, house: h })}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60 text-xs font-bold text-slate-600 dark:text-neutral-200 hover:border-amber-500/40 hover:text-amber-600 dark:hover:text-amber-400 transition-all"
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
function HouseLogo({ house, size = 40 }: { house: House; size?: number }) {
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size } as React.CSSProperties;
  if (house.logo && !failed) {
    return (
      <img
        src={house.logo}
        alt={house.name}
        style={dim}
        onError={() => setFailed(true)}
        className="rounded-xl object-contain bg-white border border-slate-100 dark:border-neutral-700 shrink-0"
      />
    );
  }
  return (
    <span style={dim} className="rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-sm shrink-0">
      {(house.name || '?').charAt(0).toUpperCase()}
    </span>
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
  const [registerUrlTemplate, setRegisterUrlTemplate] = useState(house?.registerUrlTemplate ?? '');
  const [active, setActive] = useState(house?.active ?? true);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const autoSlug = useMemo(
    () => name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    [name]
  );
  const effectiveSlug = slugTouched ? slug : autoSlug;
  const logoPreview = logoBase64 ?? house?.logo ?? null;

  const onPickFile = (file?: File) => {
    if (!file) return;
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
    setSaving(true);
    try {
      const payload: HouseInput = {
        name: name.trim(),
        slug: effectiveSlug,
        brandId: brandId.trim() || null,
        registerUrlTemplate: registerUrlTemplate.trim() || null,
        active,
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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="min-h-full flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-800 max-h-[calc(100vh_-_2rem)] flex flex-col"
        >
          <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100 dark:border-neutral-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 size={18} className="text-amber-500" />
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
                  <div className="w-16 h-16 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black text-xl">
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
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-200 hover:border-amber-500/40 transition-all"
                >
                  <Upload size={13} /> {logoPreview ? 'Trocar logo' : 'Enviar logo'}
                </button>
                <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-1.5">PNG, JPG, WEBP ou SVG · máx. 2MB</p>
              </div>
            </div>

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

            <Field label="brandId (OTG)" hint="opcional — id da casa na OTG, se conhecido">
              <input
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                placeholder="ex.: cmm5dhdqm000e19b58dqc549a"
                className={`${inputCls} font-mono`}
              />
            </Field>

            <Field label="URL de cadastro" hint="opcional · use {ref} onde entra o código do afiliado">
              <input
                value={registerUrlTemplate}
                onChange={(e) => setRegisterUrlTemplate(e.target.value)}
                placeholder="https://casa.bet.br/register?wm={ref}"
                className={`${inputCls} font-mono`}
              />
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
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-60 transition-all"
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
      <div className="min-h-full flex items-center justify-center p-4">
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

const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed';

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
