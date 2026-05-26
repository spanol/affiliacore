import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  Search, 
  Filter, 
  RefreshCw, 
  AlertCircle,
  Loader2,
  Save,
  CheckCircle,
  Percent
} from 'lucide-react';
import { fetchAffiliates, fetchAffiliateConfigs, saveAffiliateConfig, updateAffiliateStatus, createAuditLog, fetchRegisteredUsers, updateUserRole, AffiliateConfig } from '../services/affiliateService';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface Affiliate {
  id: string;
  name: string;
  email: string;
  status: string;
  brand?: {
    id: string;
    name: string;
  };
  createdAt: string;
  userUid?: string;
  role?: 'admin' | 'client';
}

export default function AffiliatesList() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [configs, setConfigs] = useState<Record<string, AffiliateConfig>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; affiliateId?: string; name?: string; pendingStatus?: 'active' | 'inactive' }>({ open: false });

  const isAdmin = profile?.role === 'admin';
  const pageTitle = isAdmin ? 'Gestão de Afiliados' : 'Meus Clientes';
  const pageSubTitle = isAdmin 
    ? 'Visualize e gerencie todos os parceiros conectados à rede.' 
    : 'Lista de clientes vinculados à sua conta de afiliado.';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isAdmin) {
        setAffiliates([]);
        setConfigs({});
        return;
      }

      const [affData, configData, registeredUsers] = await Promise.all([
        fetchAffiliates(),
        fetchAffiliateConfigs(),
        fetchRegisteredUsers()
      ]);

      // Create a lookup of registered affiliate IDs for quick checks
      const regLookup = new Set(registeredUsers.map(u => String(u.affiliateId || u.uid)));

      // Prioritize registered affiliates: map registered users to affiliate objects if present
      const registeredAffiliates: Affiliate[] = registeredUsers.map(u => {
        const affiliateKey = String(u.affiliateId || u.uid);
        const found = affData.find((a: any) => String(a.id) === affiliateKey || String(a._id) === affiliateKey);
        if (found) {
          return { ...found, status: found.status || 'active', userUid: u.uid, role: (u.role as 'admin'|'client') || 'client' } as Affiliate;
        }
        return { id: affiliateKey, name: u.name || u.email || 'Sem Nome', email: u.email || '', status: 'active', userUid: u.uid, role: 'client' } as Affiliate;
      });

      // Remaining affiliates from API that are not registered
      const remaining = affData.filter((a: any) => !regLookup.has(String(a.id) || String(a._id))).map((a: any) => ({
        ...a,
        status: 'inactive'
      } as Affiliate));

      setAffiliates([...registeredAffiliates, ...remaining]);
      setConfigs(configData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados da API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isAdmin]);

  const handleConfigChange = (affiliateId: string, field: 'cpaValue' | 'revPercentage', value: string) => {
    // allow empty string for easier typing, but convert to 0 for the state if needed
    // Actually, it's better to keep it as string if we want to allow typing freely, 
    // but the current state expects a number.
    let numValue = parseFloat(value);
    if (isNaN(numValue)) numValue = 0;
    
    // Prevent negative values
    numValue = Math.max(0, numValue);

    setConfigs(prev => ({
      ...prev,
      [affiliateId]: {
        ...(prev[affiliateId] || { affiliateId, cpaValue: 0, revPercentage: 0 }),
        [field]: numValue
      }
    }));
  };

  const handleSaveConfig = async (affiliateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavingId(affiliateId);
    try {
      const config = configs[affiliateId] || { affiliateId, cpaValue: 0, revPercentage: 0 };
      await saveAffiliateConfig(config);
      setSavedId(affiliateId);
      setTimeout(() => setSavedId(null), 2000);
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setSavingId(null);
    }
  };

  const filteredAffiliates = Array.isArray(affiliates) 
    ? affiliates.filter(item => 
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.id?.toString().includes(searchTerm)
      )
    : [];
  const visibleAffiliates = isAdmin ? filteredAffiliates : [];

  const handleOpenDetails = (affiliate: any) => {
    navigate(`/affiliates/${affiliate.id}`);
  };

  const handleToggleStatus = async (affiliateId: string, value: 'active' | 'inactive', reason?: string) => {
    // value expected 'active' or 'inactive'
    setUpdatingStatusId(affiliateId);
    try {
      await updateAffiliateStatus(affiliateId, value);
      setAffiliates(prev => prev.map(a => (a.id === affiliateId ? { ...a, status: value } : a)));
      // create audit log
      try {
        await createAuditLog({ affiliateId, actorId: profile?.uid, actorName: profile?.name, action: value === 'active' ? 'activated' : 'deactivated', reason });
      } catch (logErr) {
        console.error('Falha ao criar log de auditoria', logErr);
      }
    } catch (err) {
      console.error('Erro ao atualizar status do afiliado', err);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleRoleChange = async (userUid: string | undefined, newRole: 'admin' | 'client') => {
    if (!userUid) return;
    try {
      await updateUserRole(userUid, newRole);
      setAffiliates(prev => prev.map(a => a.userUid === userUid ? { ...a, role: newRole } : a));
    } catch (err) {
      console.error('Erro atualizando role do usuário', err);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Confirmation Modal */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Confirmar ação</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Tem certeza que deseja desativar o afiliado <span className="font-semibold">{confirmModal.name}</span>? Isso impedirá o acesso ao sistema.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" onClick={() => setConfirmModal({ open: false })}>Cancelar</button>
              <button className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm" onClick={async () => {
                if (!confirmModal.affiliateId) return;
                await handleToggleStatus(confirmModal.affiliateId, 'inactive');
                setConfirmModal({ open: false });
              }}>Confirmar Desativação</button>
            </div>
          </div>
        </div>
      )}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-light text-gray-900 dark:text-white flex items-center gap-3">
            <Users size={32} className="text-slate-900 dark:text-white" />
            {pageTitle}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{pageSubTitle}</p>
        </div>
        <button 
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm disabled:opacity-50"
        >
          <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          Atualizar Lista
        </button>
      </header>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden transition-colors">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-300" size={16} />
            <input 
              type="text" 
              placeholder="Buscar por nome, e-mail ou ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-brand transition-all dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-slate-500 dark:text-slate-300 hover:text-amber-500 transition-colors">
              <Filter size={18} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 mb-4">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Erro de Conexão</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto mb-6">
              {error}
            </p>
            <button 
              onClick={loadData}
              className="px-6 py-2 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand/90 transition-all"
            >
              Tentar Novamente
            </button>
          </div>
        ) : loading ? (
          <div className="p-24 flex flex-col items-center justify-center gap-4">
            <Loader2 size={40} className="text-brand animate-spin" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Sincronizando com a API...</p>
          </div>
        ) : visibleAffiliates.length === 0 ? (
          <div className="p-24 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 mb-4">
              <Users size={24} />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">Nenhum cliente associado</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A lista ficará disponível quando os clientes forem vinculados ao seu ID de afiliado.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Nome / Empresa</th>
                    {isAdmin && (
                    <>
                        <th className="px-6 py-4">Cargo</th>
                      <th className="px-6 py-4">Ativo</th>
                      <th className="px-6 py-4">Config. CPA (R$)</th>
                      <th className="px-6 py-4">Config. REV (%)</th>
                      <th className="px-6 py-4 text-right">Ação</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {visibleAffiliates.map((item: any) => {
                  const affiliateId = item.id || item._id;
                  const config = configs[affiliateId] || { affiliateId, cpaValue: 0, revPercentage: 0 };
                  
                  return (
                    <tr 
                      key={affiliateId || Math.random()} 
                      className="hover:bg-brand/[0.02] dark:hover:bg-white/[0.02] transition-colors group cursor-pointer"
                      onClick={() => handleOpenDetails(item)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {item.name || item.fullName || item.nome || 'Sem Nome'}
                          </span>
                          {(item.brand || item.marca) && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {(item.brand?.name || item.marca?.nome || item.brand || item.marca)}
                            </span>
                          )}
                        </div>
                      </td>
                      {isAdmin && (
                        <>
                          <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                            <div className="max-w-[160px]">
                              <select
                                value={item.role || 'client'}
                                onChange={async (e) => { e.stopPropagation(); const newRole = e.target.value as 'admin'|'client'; await handleRoleChange(item.userUid, newRole); }}
                                className="w-full py-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200"
                              >
                                <option value="client">Cliente</option>
                                <option value="admin">Administrador</option>
                              </select>
                            </div>
                          </td>
                          <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={item.status || 'active'}
                              onChange={(e) => { 
                                e.stopPropagation(); 
                                const chosen = e.target.value as 'active' | 'inactive';
                                // if deactivating, ask confirmation
                                if (chosen === 'inactive' && (item.status || 'active') === 'active') {
                                  setConfirmModal({ open: true, affiliateId, name: item.name, pendingStatus: 'inactive' });
                                } else {
                                  handleToggleStatus(affiliateId, chosen);
                                }
                              }}
                              disabled={updatingStatusId === affiliateId}
                              className="w-28 py-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200"
                            >
                              <option value="active">Ativo</option>
                              <option value="inactive">Desativado</option>
                            </select>
                          </td>
                          <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                            <div className="relative group/input">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">R$</span>
                              <input 
                                type="number" 
                                min="0"
                                step="0.01"
                                value={config.cpaValue}
                                onChange={(e) => handleConfigChange(affiliateId, 'cpaValue', e.target.value)}
                                className="w-24 pl-7 pr-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg text-[11px] font-bold outline-none focus:ring-1 focus:ring-amber-500 transition-all dark:text-white"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                            <div className="relative group/input">
                              <Percent size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300" />
                              <input 
                                type="number" 
                                min="0"
                                max="100"
                                step="0.1"
                                value={config.revPercentage}
                                onChange={(e) => handleConfigChange(affiliateId, 'revPercentage', e.target.value)}
                                className="w-24 pl-6 pr-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg text-[11px] font-bold outline-none focus:ring-1 focus:ring-amber-500 transition-all dark:text-white"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <button 
                              onClick={(e) => handleSaveConfig(affiliateId, e)}
                              disabled={savingId === affiliateId}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                savedId === affiliateId 
                                  ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white dark:bg-amber-900/10 dark:text-amber-400 dark:hover:bg-amber-500 dark:hover:text-white"
                              )}
                            >
                              {savingId === affiliateId ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : savedId === affiliateId ? (
                                <CheckCircle size={14} />
                              ) : (
                                <Save size={14} />
                              )}
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-[10px] text-slate-400 font-bold uppercase italic">
            Exibindo {visibleAffiliates.length} de {isAdmin ? affiliates.length : 0} registros
          </p>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-[10px] font-bold text-slate-400 disabled:opacity-30" disabled>Anterior</button>
            <button className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-[10px] font-bold text-slate-400 disabled:opacity-30" disabled>Próxima</button>
          </div>
        </div>
      </div>
    </div>
  );
}
