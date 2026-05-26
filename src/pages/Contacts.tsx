import React, { useEffect, useState } from 'react';
import { Mail, Phone, Instagram, Clock4 } from 'lucide-react';
import { subscribeToContactInquiries, ContactInquiry } from '../services/contactService';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

export default function Contacts() {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<ContactInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role !== 'admin') return;

    const unsubscribe = subscribeToContactInquiries(
      (data) => {
        setContacts(data);
        setLoading(false);
      },
      (err) => {
        console.error('Erro ao carregar contatos:', err);
        setError('Não foi possível carregar os contatos no momento.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [profile?.role]);

  return (
    <div className="space-y-8 pb-20">
      <header>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Contatos</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Lista de mensagens da tabela de contatos do banco de dados.</p>
      </header>

      <section className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Contatos recentes</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Exibindo as últimas mensagens enviadas pela página de contato.</p>
          </div>
          <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">
            <Clock4 size={14} /> {contacts.length} registro{contacts.length === 1 ? '' : 's'}
          </span>
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-500 dark:text-slate-400">Carregando contatos...</div>
        ) : error ? (
          <div className="py-20 text-center text-red-500">{error}</div>
        ) : contacts.length === 0 ? (
          <div className="py-20 text-center text-slate-500 dark:text-slate-400">Nenhum contato encontrado.</div>
        ) : (
          <div className="space-y-4">
            {contacts.slice(0, 20).map((contact) => (
              <article key={contact.id} className="p-5 rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">{contact.name}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{contact.presentation || 'Sem mensagem adicional'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400 font-bold">
                    <span>{contact.affiliateExperience === 'sim' ? 'Já trabalhou com afiliado' : 'Sem experiência com afiliado'}</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="flex items-center gap-2 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    <Mail size={16} className="text-slate-500 dark:text-slate-300" />
                    <span className="text-sm text-slate-700 dark:text-slate-200 break-all">{contact.email}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    <Phone size={16} className="text-slate-500 dark:text-slate-300" />
                    <span className="text-sm text-slate-700 dark:text-slate-200">{contact.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    <Instagram size={16} className="text-slate-500 dark:text-slate-300" />
                    <span className="text-sm text-slate-700 dark:text-slate-200 break-all">{contact.instagram}</span>
                  </div>
                  <div className="rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-[11px] uppercase tracking-[0.2em] font-bold text-slate-500 dark:text-slate-400">
                    {contact.createdAt ? new Date(contact.createdAt.toDate()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem data'}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
