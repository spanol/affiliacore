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
import { fetchAuditLogs, AuditLog } from '../services/affiliateService';

export default function Settings() {
  const { profile } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

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
    async function loadLogs() {
      try {
        setLoadingLogs(true);
        const logs = await fetchAuditLogs();
        setAuditLogs(logs);
      } catch (err) {
        console.error('Erro carregando logs de auditoria', err);
      } finally {
        setLoadingLogs(false);
      }
    }
    loadLogs();
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
        <ShieldCheck size={48} className="text-slate-500 dark:text-slate-300" />
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
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <SettingsIcon size={32} className="text-slate-900 dark:text-white" />
          Configurações
        </h1>
        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">Gerencie chaves de API e integração Firebase</p>
      </header>

      <div className="grid grid-cols-1 gap-8">
        {/* API Settings */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden"
        >
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center gap-2">
            <Key size={16} className="text-slate-900 dark:text-slate-200" />
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">API de Captura de Dados</h3>
          </div>
          <div className="p-6 space-y-6">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Insira abaixo a chave da API que será utilizada pelo sistema para capturar e processar os dados dos clientes vinculados aos seus afiliados.
            </p>
            
            <form onSubmit={handleSaveApiKey} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Chave da API (Secret)</label>
                <div className="relative">
                  <input 
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-sm dark:text-white focus:ring-1 focus:ring-brand transition-all outline-none"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <ShieldCheck size={16} className="text-slate-500 dark:text-slate-400" aria-label="Armazenamento Seguro" />
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
                className="w-full bg-brand text-white py-3 rounded-lg text-xs font-bold hover:bg-brand/90 dark:hover:bg-brand/80 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : saveSuccess ? <Check size={14} /> : <Save size={14} />}
                {saveSuccess ? 'Chave Salva!' : 'Salvar Configuração'}
              </button>
            </form>
          </div>
        </motion.div>
        {/* Audit Logs Table */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden"
        >
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center gap-2">
            <Database size={16} className="text-slate-900 dark:text-slate-200" />
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">Logs de Auditoria</h3>
          </div>
          <div className="p-6">
            {loadingLogs ? (
              <div className="py-8 text-center text-slate-500">Carregando logs...</div>
            ) : auditLogs.length === 0 ? (
              <div className="py-8 text-center text-slate-500">Nenhum log de auditoria encontrado.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-slate-400 uppercase">
                    <tr>
                      <th className="px-4 py-2">Data</th>
                      <th className="px-4 py-2">Afiliado</th>
                      <th className="px-4 py-2">Ação</th>
                      <th className="px-4 py-2">Usuário</th>
                      <th className="px-4 py-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-950">
                        <td className="px-4 py-3 text-[13px] text-slate-600 dark:text-slate-300">{log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR') : '-'}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{log.affiliateId}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{log.action}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{log.actorName || log.actorId}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{log.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Security Info */}
      <div className="bg-brand/5 dark:bg-brand/10 border border-brand/10 dark:border-brand/20 p-4 rounded-xl flex gap-4 items-start">
        <div className="p-2 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-brand/10 dark:border-brand/20">
          <ShieldCheck size={20} className="text-slate-900 dark:text-slate-200" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight mb-1">Segurança de Dados</h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            Todas as chaves de API inseridas nesta área são armazenadas no Google Cloud Firestore com criptografia em repouso. 
            O acesso a estes dados é restrito via Security Rules do Firebase, permitindo leitura e escrita exclusivamente para usuários com função de administrador autenticados.
          </p>
        </div>
      </div>
    </div>
  );
}
