import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Settings as SettingsIcon,
  Key,
  ExternalLink,
  Save,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  LifeBuoy,
  Megaphone
} from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import firebaseConfig from '../../firebase-applet-config.json';
import { fetchSupportContact, saveSupportContact } from '../services/supportService';
import { formatSupportPhone, SUPPORT_LABEL_DEFAULT } from '../lib/supportContact';
import { fetchShowcaseConfig, saveShowcaseConfig } from '../services/showcaseService';
import { SHOWCASE_DESCRIPTION_MAX } from '../lib/showcase';

export default function Settings() {
  const { profile } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Local state for Firebase Override (Display only or persist if requested)
  const [fbConfig, setFbConfig] = useState(JSON.stringify(firebaseConfig, null, 2));

  // Contato de suporte (aba Suporte → WhatsApp do operador da label).
  const [supportPhone, setSupportPhone] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportLabel, setSupportLabel] = useState(SUPPORT_LABEL_DEFAULT);
  const [supportActive, setSupportActive] = useState(true);
  const [supportSaving, setSupportSaving] = useState(false);
  const [supportSaved, setSupportSaved] = useState(false);
  const [supportError, setSupportError] = useState('');

  // Vitrine AffiliaCore (opt-in): aparecer na seção "clientes" da LP do produto.
  const [showcaseEnabled, setShowcaseEnabled] = useState(false);
  const [showcaseDescription, setShowcaseDescription] = useState('');
  const [showcaseSiteUrl, setShowcaseSiteUrl] = useState('');
  const [showcaseSaving, setShowcaseSaving] = useState(false);
  const [showcaseSaved, setShowcaseSaved] = useState(false);
  const [showcaseError, setShowcaseError] = useState('');

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    fetchSupportContact()
      .then((contact) => {
        // Mostramos o número já formatado; o servidor devolve só dígitos.
        setSupportPhone(formatSupportPhone(contact.phone));
        setSupportMessage(contact.message || '');
        setSupportLabel(contact.label || SUPPORT_LABEL_DEFAULT);
        // Nunca configurado (sem telefone) → a caixa já vem marcada: quem digita
        // o número e salva espera ver o item aparecer, não descobrir depois que
        // faltava um toggle. Com telefone gravado, respeita o que está salvo.
        setSupportActive(contact.phone ? contact.active : true);
      })
      .catch(() => {});
  }, [profile]);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    fetchShowcaseConfig()
      .then((cfg) => {
        setShowcaseEnabled(cfg.enabled);
        setShowcaseDescription(cfg.description || '');
        setShowcaseSiteUrl(cfg.siteUrl || '');
      })
      .catch(() => {});
  }, [profile]);

  const handleSaveShowcase = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowcaseSaving(true);
    setShowcaseError('');
    setShowcaseSaved(false);
    try {
      const saved = await saveShowcaseConfig({
        enabled: showcaseEnabled,
        description: showcaseDescription,
        siteUrl: showcaseSiteUrl,
      });
      setShowcaseEnabled(saved.enabled);
      setShowcaseDescription(saved.description);
      setShowcaseSiteUrl(saved.siteUrl);
      setShowcaseSaved(true);
      setTimeout(() => setShowcaseSaved(false), 3000);
    } catch (err: any) {
      setShowcaseError(err?.message || 'Falha ao salvar a vitrine.');
    } finally {
      setShowcaseSaving(false);
    }
  };

  const handleSaveSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupportSaving(true);
    setSupportError('');
    setSupportSaved(false);
    try {
      const saved = await saveSupportContact({
        phone: supportPhone,
        message: supportMessage,
        label: supportLabel,
        active: supportActive,
      });
      setSupportPhone(formatSupportPhone(saved.phone));
      setSupportActive(saved.active);
      setSupportSaved(true);
      setTimeout(() => setSupportSaved(false), 3000);
    } catch (err: any) {
      setSupportError(err?.message || 'Falha ao salvar o contato de suporte.');
    } finally {
      setSupportSaving(false);
    }
  };

  useEffect(() => {
    async function loadSettings() {
      if (profile?.role !== 'admin') return;

      try {
        const docRef = doc(db, 'settings', 'external_api');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setApiKey(docSnap.data().value);
        }
      } catch (err) {
        console.error('Erro ao carregar configurações:', err);
      }
    }
    loadSettings();
  }, [profile]);

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile?.role !== 'admin') return;

    setLoading(true);
    setError('');
    setSaveSuccess(false);

    try {
      await setDoc(doc(db, 'settings', 'external_api'), {
        key: 'client_capture_api_key',
        value: apiKey,
        description: 'Chave de API para captura de dados de clientes',
        updatedAt: serverTimestamp()
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/external_api');
      setError('Falha ao salvar a chave de API.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (profile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="p-4 rounded-2xl border border-slate-200/70 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900/60">
          <ShieldCheck size={40} className="text-slate-500 dark:text-neutral-300" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-white">Acesso Restrito</h2>
          <p className="text-slate-500 dark:text-neutral-400 text-sm">Esta página está disponível apenas para administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <span className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 text-slate-500 dark:text-neutral-300 text-[10px] font-bold uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Integrações
        </span>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
          <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
            <SettingsIcon size={24} className="text-slate-900 dark:text-white" />
          </span>
          Configurações
        </h1>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">Gerencie chaves de API e integração Firebase.</p>
      </header>

      <div className="grid grid-cols-1 gap-8">
        {/* API Settings */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden hover:border-slate-300 dark:hover:border-neutral-700 transition-colors"
        >
          <div className="p-5 border-b border-slate-100 dark:border-neutral-800 flex items-center gap-3">
            <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
              <Key size={16} className="text-slate-900 dark:text-neutral-100" />
            </span>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white tracking-tight">API de Captura de Dados</h3>
          </div>
          <div className="p-6 space-y-6">
            <p className="text-xs text-slate-500 dark:text-neutral-400 leading-relaxed">
              Insira abaixo a chave da API que será utilizada pelo sistema para capturar e processar os dados dos clientes vinculados aos seus afiliados.
            </p>

            <form onSubmit={handleSaveApiKey} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest ml-1">Chave da API (Secret)</label>
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all outline-none"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <ShieldCheck size={16} className="text-slate-400 dark:text-neutral-400" aria-label="Armazenamento Seguro" />
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl text-[11px] font-bold flex items-center gap-2 border border-red-100 dark:border-red-900/40">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-neutral-900 py-3 rounded-full text-xs font-bold hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : saveSuccess ? <Check size={14} /> : <Save size={14} />}
                {saveSuccess ? 'Chave Salva!' : 'Salvar Configuração'}
              </button>
            </form>
          </div>
        </motion.div>

        {/* Contato de suporte — vira a aba "Suporte" na barra lateral do afiliado */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden hover:border-slate-300 dark:hover:border-neutral-700 transition-colors"
        >
          <div className="p-5 border-b border-slate-100 dark:border-neutral-800 flex items-center gap-3">
            <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
              <LifeBuoy size={16} className="text-slate-900 dark:text-neutral-100" />
            </span>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white tracking-tight">Suporte (WhatsApp)</h3>
          </div>
          <div className="p-6 space-y-6">
            <p className="text-xs text-slate-500 dark:text-neutral-400 leading-relaxed">
              O número cadastrado aqui vira o item <strong>Suporte</strong> na barra lateral dos afiliados, abrindo
              a conversa direto no WhatsApp. Sem número, o item não aparece.
            </p>

            <form onSubmit={handleSaveSupport} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest ml-1 block">
                    WhatsApp (com DDD)
                  </label>
                  <input
                    type="tel"
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                    placeholder="(11) 98888-7777"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest ml-1 block">
                    Rótulo no menu
                  </label>
                  <input
                    type="text"
                    value={supportLabel}
                    onChange={(e) => setSupportLabel(e.target.value)}
                    placeholder={SUPPORT_LABEL_DEFAULT}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest ml-1 block">
                  Mensagem pré-preenchida (opcional)
                </label>
                <input
                  type="text"
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  placeholder="Olá! Preciso de ajuda com minha conta."
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all outline-none"
                />
              </div>

              <label className="flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={supportActive}
                  onChange={(e) => setSupportActive(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-neutral-600 accent-accent-500"
                />
                Exibir o item de suporte no menu dos afiliados
              </label>

              {supportError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl text-[11px] font-bold flex items-center gap-2 border border-red-100 dark:border-red-900/40">
                  <AlertCircle size={14} />
                  {supportError}
                </div>
              )}

              <button
                type="submit"
                disabled={supportSaving}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-neutral-900 py-3 rounded-full text-xs font-bold hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {supportSaving ? <RefreshCw size={14} className="animate-spin" /> : supportSaved ? <Check size={14} /> : <Save size={14} />}
                {supportSaved ? 'Contato Salvo!' : 'Salvar Contato de Suporte'}
              </button>
            </form>
          </div>
        </motion.div>

        {/* Vitrine AffiliaCore — opt-in de aparecer na LP do produto */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl shadow-sm overflow-hidden hover:border-slate-300 dark:hover:border-neutral-700 transition-colors"
        >
          <div className="p-5 border-b border-slate-100 dark:border-neutral-800 flex items-center gap-3">
            <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
              <Megaphone size={16} className="text-slate-900 dark:text-neutral-100" />
            </span>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white tracking-tight">Vitrine AffiliaCore &amp; auto-cadastro</h3>
          </div>
          <div className="p-6 space-y-6">
            <p className="text-xs text-slate-500 dark:text-neutral-400 leading-relaxed">
              Esta chave declara que sua agência <strong>aceita cadastro espontâneo de afiliados</strong> (sem
              convite): a página de cadastro fica aberta e a agência aparece na seção de clientes do site da
              AffiliaCore (affiliacore.com.br) — com o nome da instância, a apresentação abaixo e, se quiser,
              o link do seu site. Afiliados que procuram uma agência chegam até você por lá, já marcados com a
              origem na tela de Contatos. Desligada, o cadastro volta a ser somente por convite e nada é exibido
              na vitrine. Você pode alternar quando quiser.
            </p>

            <form onSubmit={handleSaveShowcase} className="space-y-4">
              <label className="flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showcaseEnabled}
                  onChange={(e) => setShowcaseEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-neutral-600 accent-accent-500"
                />
                Aceitar auto-cadastro e exibir minha agência na vitrine da AffiliaCore
              </label>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest ml-1 block">
                  Apresentação (opcional)
                </label>
                <textarea
                  value={showcaseDescription}
                  onChange={(e) => setShowcaseDescription(e.target.value)}
                  maxLength={SHOWCASE_DESCRIPTION_MAX}
                  rows={3}
                  placeholder="Conte em poucas linhas quem é a sua agência, com quais casas opera e o que oferece aos afiliados."
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all outline-none resize-y"
                />
                <p className="text-[10px] text-slate-400 dark:text-neutral-500 ml-1 text-right">
                  {showcaseDescription.length}/{SHOWCASE_DESCRIPTION_MAX}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest ml-1 block">
                  Site público (opcional)
                </label>
                <input
                  type="url"
                  value={showcaseSiteUrl}
                  onChange={(e) => setShowcaseSiteUrl(e.target.value)}
                  placeholder="https://suaagencia.com.br"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all outline-none"
                />
              </div>

              {showcaseError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl text-[11px] font-bold flex items-center gap-2 border border-red-100 dark:border-red-900/40">
                  <AlertCircle size={14} />
                  {showcaseError}
                </div>
              )}

              <button
                type="submit"
                disabled={showcaseSaving}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-neutral-900 py-3 rounded-full text-xs font-bold hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {showcaseSaving ? <RefreshCw size={14} className="animate-spin" /> : showcaseSaved ? <Check size={14} /> : <Save size={14} />}
                {showcaseSaved ? 'Vitrine Salva!' : 'Salvar Vitrine'}
              </button>
            </form>
          </div>
        </motion.div>
      </div>

      {/* Security Info */}
      <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 p-5 rounded-2xl flex gap-4 items-start">
        <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-500 shrink-0">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-800 dark:text-neutral-100 uppercase tracking-widest mb-1">Segurança de Dados</h4>
          <p className="text-[11px] text-slate-500 dark:text-neutral-400 leading-relaxed font-medium">
            Todas as chaves de API inseridas nesta área são armazenadas no Google Cloud Firestore com criptografia em repouso.
            O acesso a estes dados é restrito via Security Rules do Firebase, permitindo leitura e escrita exclusivamente para usuários com função de administrador autenticados.
          </p>
        </div>
      </div>
    </div>
  );
}
