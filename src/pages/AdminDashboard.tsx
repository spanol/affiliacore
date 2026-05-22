import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  DollarSign, 
  BarChart3, 
  TrendingUp,
  Loader2,
  HelpCircle,
  Mail,
  Phone,
  MessageSquare
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  Cell
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { fetchAffiliates, fetchAllResults } from '../services/affiliateService';
import {
  type ContactInquiry,
  subscribeToContactInquiries,
} from '../services/contactService';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [affiliatesCount, setAffiliatesCount] = useState<number>(0);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<ContactInquiry[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [totals, setTotals] = useState({
    commission: 0,
    cpa: 0,
    rev: 0
  });

  useEffect(() => {
    async function getDashboardData() {
      try {
        setLoading(true);
        const [affiliates, allResults] = await Promise.all([
          fetchAffiliates(),
          fetchAllResults()
        ]);
        
        setAffiliatesCount(affiliates.length);
        setResults(allResults);

        // Calculate totals
        const calculatedTotals = allResults.reduce((acc, curr) => ({
          commission: acc.commission + (curr.total_commission || 0),
          cpa: acc.cpa + (curr.cpa || 0),
          rev: acc.rev + (curr.rvs || 0)
        }), { commission: 0, cpa: 0, rev: 0 });

        setTotals(calculatedTotals);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    getDashboardData();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToContactInquiries(
      (nextContacts) => {
        setContacts(nextContacts);
        setContactsLoading(false);
        setContactsError(null);
      },
      (error) => {
        console.error('Error loading contacts:', error);
        setContactsError('Nao foi possivel carregar os contatos no momento.');
        setContactsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const metrics = [
    { label: 'Total de Afiliados', value: affiliatesCount.toString(), icon: Users, color: 'brand' },
    { label: 'Total comissão', value: `R$ ${totals.commission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'green' },
    { label: 'Total CPA', value: `R$ ${totals.cpa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: BarChart3, color: 'blue' },
    { label: 'Total REV', value: `R$ ${totals.rev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: 'purple' },
  ];

  // Prepare data for the chart - top 10 affiliates by commission
  const chartData = [...results]
    .sort((a, b) => (b.total_commission || 0) - (a.total_commission || 0))
    .slice(0, 10)
    .map(item => ({
      name: item.affiliate_name || item.affiliate_id || '---',
      shortName: (item.affiliate_name || item.affiliate_id || '---').substring(0, 12),
      Comissão: item.total_commission || 0,
      CPA: item.cpa || 0,
      REV: item.rvs || 0
    }));

  const formatContactDate = (contact: ContactInquiry) => {
    if (!contact.createdAt) {
      return 'Agora';
    }

    return contact.createdAt.toDate().toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  return (
    <div className="space-y-8 pb-20">
      <header>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Dashboard Administrativo</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Bem-vindo de volta, {profile?.name}. Visão geral do desempenho da rede.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={cn(
              "p-6 rounded-2xl border shadow-sm transition-all relative overflow-hidden",
              idx === 0 
                ? "bg-slate-900 text-white border-transparent" 
                : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800"
            )}
          >
            {loading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="animate-spin text-brand" />
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-4">
                  <div className={cn(
                    "p-2.5 rounded-xl",
                    idx === 0 ? "bg-white/10" : "bg-slate-50 dark:bg-slate-800"
                  )}>
                    <metric.icon size={20} className={cn(
                      idx === 0 ? "text-white" : "text-brand"
                    )} />
                  </div>
                </div>
                
                <div>
                  <p className={cn(
                    "text-[10px] uppercase font-black tracking-widest mb-1",
                    idx === 0 ? "text-slate-400" : "text-slate-400"
                  )}>
                    {metric.label}
                  </p>
                  <h3 className="text-xl font-black dark:text-white truncate">{metric.value}</h3>
                </div>
              </>
            )}
          </motion.div>
        ))}
      </div>

      {/* Chart Section */}
      <section className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
              Desempenho por Afiliado <HelpCircle size={14} className="text-slate-300" />
            </h3>
            <p className="text-xs text-slate-500 font-medium">Top 10 parceiros por volume de comissão</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
             <TrendingUp size={16} className="text-brand" />
             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest italic">Performance em tempo real</span>
          </div>
        </div>

        <div className="h-[400px] w-full">
          {loading ? (
            <div className="w-full h-full flex items-center justify-center text-slate-400 font-medium">
              Carregando dados do gráfico...
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.5} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} 
                  angle={-45} 
                  textAnchor="end"
                  interval={0}
                  tickFormatter={(value) => value.length > 15 ? `${value.substring(0, 12)}...` : value}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }}
                  tickFormatter={(value) => `R$ ${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}`}
                />
                <Tooltip 
                  cursor={{ fill: '#F1F5F9', radius: 10 }}
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    padding: '12px'
                  }}
                  itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                  labelStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', marginBottom: '8px' }}
                  formatter={(value: number, name: string) => [
                    `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                    name
                  ]}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right" 
                  iconType="circle" 
                  wrapperStyle={{ paddingBottom: '20px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }} 
                />
                <Bar name="Comissão" dataKey="Comissão" fill="#64748B" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar name="CPA" dataKey="CPA" fill="#94A3B8" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar name="REV" dataKey="REV" fill="#CBD5E1" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-4">
              <BarChart3 size={48} className="opacity-20" />
              <p className="font-bold text-sm uppercase tracking-widest">Sem dados disponíveis</p>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
              <Mail size={16} className="text-brand" />
              Contatos recebidos
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Leads enviados pelo formulário da landing page.
            </p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {contacts.length} contato{contacts.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {contactsLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : contactsError ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-medium text-red-600 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400">
            {contactsError}
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-slate-400">
            <MessageSquare size={42} className="opacity-30" />
            <p className="text-sm font-bold uppercase tracking-widest">
              Nenhum contato enviado ainda
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="hidden overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800 lg:block">
              <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Contato</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Telefone</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Instagram</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Mercado</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Mensagem</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Recebido em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td className="px-4 py-4 align-top">
                        <div className="font-bold text-slate-900 dark:text-white">{contact.name}</div>
                        <div className="text-sm text-slate-500">{contact.email}</div>
                      </td>
                      <td className="px-4 py-4 align-top text-sm text-slate-600 dark:text-slate-300">
                        {contact.phone}
                      </td>
                      <td className="px-4 py-4 align-top text-sm text-slate-600 dark:text-slate-300">
                        {contact.instagram}
                      </td>
                      <td className="px-4 py-4 align-top text-sm text-slate-600 dark:text-slate-300">
                        {contact.affiliateExperience === 'sim' ? 'Já atua' : 'Ainda não atua'}
                      </td>
                      <td className="px-4 py-4 align-top text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {contact.presentation}
                      </td>
                      <td className="px-4 py-4 align-top text-sm text-slate-500 dark:text-slate-400">
                        {formatContactDate(contact)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 lg:hidden">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">{contact.name}</h4>
                      <p className="text-sm text-slate-500">{contact.email}</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {formatContactDate(contact)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <p><span className="font-bold">Telefone:</span> {contact.phone}</p>
                    <p><span className="font-bold">Instagram:</span> {contact.instagram}</p>
                    <p><span className="font-bold">Mercado:</span> {contact.affiliateExperience === 'sim' ? 'Já atua' : 'Ainda não atua'}</p>
                    <p><span className="font-bold">Mensagem:</span> {contact.presentation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

    </div>
  );
}


function clsx(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
