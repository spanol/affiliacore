import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';
import BrandName from '../components/BrandName';

// 404 client-side: renderizada para qualquer rota não mapeada no SPA.
//
// ⚠️ WHITE-LABEL: esta tela nasceu na paleta v1 (slate-* no escuro + `brand`,
// que é o NAVY DE SUPERFÍCIE e não a cor do cliente). O resultado numa label era
// um 404 azulado com botão navy, ignorando o accent declarado — a Infinity (roxo
// #8332B9) caía num botão navy. A cor de marca do app é accent-*, e o escuro é a
// ramp neutral-* (a que VITE_BRAND_CANVAS re-tinta). [[boost-design-v1-v2-dark-debt]]
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-neutral-950 px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md text-center bg-white dark:bg-neutral-900 border border-slate-100 dark:border-neutral-800 rounded-3xl shadow-sm p-12"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-600 dark:text-accent-400 text-[10px] font-black uppercase tracking-[0.2em] mb-7">
          <Compass size={14} /> <BrandName full />
        </div>
        <div className="text-6xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">404</div>
        <h1 className="mt-4 text-lg font-black text-slate-900 dark:text-white">Página não encontrada</h1>
        <p className="mt-2.5 text-sm text-slate-500 dark:text-neutral-400 leading-relaxed">
          O endereço que você tentou acessar não existe ou foi movido.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 mt-8 px-7 py-3.5 bg-accent-500 text-accent-contrast rounded-2xl font-black text-xs uppercase tracking-[0.15em] hover:opacity-90 transition-all"
        >
          <ArrowLeft size={16} /> Voltar ao início
        </Link>
      </motion.div>
    </div>
  );
}
