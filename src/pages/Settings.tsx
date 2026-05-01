import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Settings as SettingsIcon, 
  Key, 
  ExternalLink, 
  Save, 
  AlertCircle, 
  Database, 
  ShieldCheck,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import firebaseConfig from '../../firebase-applet-config.json';

export default function Settings() {
  const { profile } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Local state for Firebase Override (Display only or persist if requested)
  const [fbConfig, setFbConfig] = useState(JSON.stringify(firebaseConfig, null, 2));

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
        <ShieldCheck size={48} className="text-slate-300" />
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-800">Acesso Restrito</h2>
          <p className="text-slate-500 text-sm">Esta página está disponível apenas para administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <SettingsIcon size={24} className="text-brand" />
          Configurações do Sistema
        </h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">Gerencie chaves de API e integração Firebase</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* API Settings */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
        >
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <Key size={16} className="text-brand" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-tight">API de Captura de Dados</h3>
          </div>
          <div className="p-6 space-y-6">
            <p className="text-xs text-slate-500 leading-relaxed">
              Insira abaixo a chave da API que será utilizada pelo sistema para capturar e processar os dados dos clientes vinculados aos seus afiliados.
            </p>
            
            <form onSubmit={handleSaveApiKey} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Chave da API (Secret)</label>
                <div className="relative">
                  <input 
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-brand transition-all outline-none"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <ShieldCheck size={16} className="text-slate-300" title="Armazenamento Seguro" />
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded text-[11px] font-bold flex items-center gap-2 border border-red-100">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-brand text-white py-3 rounded-lg text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : saveSuccess ? <Check size={14} /> : <Save size={14} />}
                {saveSuccess ? 'Chave Salva!' : 'Salvar Configuração'}
              </button>
            </form>
          </div>
        </motion.div>

        {/* Firebase Config View */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
        >
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <Database size={16} className="text-brand" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-tight">Infraestrutura Firebase</h3>
          </div>
          <div className="p-6 h-full">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Configuração Atual</span>
              <button 
                onClick={() => copyToClipboard(fbConfig)}
                className="text-[10px] font-bold text-brand uppercase flex items-center gap-1 hover:underline"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copiado' : 'Copiar JSON'}
              </button>
            </div>
            <div className="relative group">
              <pre className="bg-slate-900 text-slate-300 p-4 rounded-lg text-[10px] font-mono overflow-x-auto max-h-[180px] border border-slate-800 scrollbar-hide">
                {fbConfig}
              </pre>
              <div className="absolute inset-0 bg-brand/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-lg" />
            </div>
            <p className="mt-4 text-[10px] text-slate-400 italic">
              * Para alterar o projeto do Firebase, edite o arquivo <code className="bg-slate-100 px-1 rounded">firebase-applet-config.json</code> no ambiente de desenvolvimento.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Security Info */}
      <div className="bg-brand/5 border border-brand/10 p-4 rounded-xl flex gap-4 items-start">
        <div className="p-2 bg-white rounded-lg shadow-sm border border-brand/10">
          <ShieldCheck size={20} className="text-brand" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight mb-1">Segurança de Dados</h4>
          <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
            Todas as chaves de API inseridas nesta área são armazenadas no Google Cloud Firestore com criptografia em repouso. 
            O acesso a estes dados é restrito via Security Rules do Firebase, permitindo leitura e escrita exclusivamente para usuários com função de administrador autenticados.
          </p>
        </div>
      </div>
    </div>
  );
}
