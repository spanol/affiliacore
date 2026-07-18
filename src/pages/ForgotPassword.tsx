import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Mail, AlertCircle, CheckCircle, KeyRound } from 'lucide-react';
import { auth } from '../lib/firebase';
import { requestPasswordReset } from '../lib/authSecurity';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import { BRAND } from '../lib/brandingClient';

export default function ForgotPassword() {
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await requestPasswordReset(auth, email);
      setSuccess(true);
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        setError('Não foi possível localizar esse e-mail.');
      } else {
        setError('Não foi possível enviar o link de redefinição agora.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('relative min-h-screen overflow-hidden bg-slate-50 dark:bg-neutral-950 flex items-center justify-center p-4 transition-colors duration-300', theme === 'dark' && 'dark')}>
      <div className="pointer-events-none fixed top-[-15%] right-[-10%] w-[45%] h-[45%] rounded-full bg-white/5 blur-[120px] hidden dark:block" />
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md bg-glass-card dark:bg-glass-card-dark backdrop-blur-glass-strong p-8 md:p-10 rounded-3xl shadow-xl shadow-slate-900/5 dark:shadow-black/30 border border-slate-200/70 dark:border-neutral-800"
      >
        <div className="text-center mb-8">
          <img src={BRAND.logoUrl} alt={BRAND.shortName} className="h-7 w-auto mx-auto mb-4 invert dark:invert-0" />
          <p className="text-slate-400 dark:text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Redefina sua senha</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/40 flex items-center gap-2 text-[11px] font-bold">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {success ? (
          <div className="p-5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold"><CheckCircle size={18} /> Link enviado</div>
            <p className="text-xs">Se esse e-mail existir na plataforma, você receberá um link para criar uma nova senha.</p>
            <Link to="/login" className="inline-block text-xs font-bold uppercase tracking-wider hover:underline">Voltar para o login</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">E-mail Corporativo</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                  placeholder="nome@empresa.com"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl font-bold mt-4 flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-brand text-white hover:bg-brand-light shadow-lg shadow-brand/20 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 dark:shadow-white/10"
            >
              {loading ? 'Enviando...' : <><KeyRound size={18} /> Enviar link de recuperação</>}
            </button>
            <p className="text-center mt-6 text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-tight">
              Lembrou sua senha? <Link to="/login" className="text-brand dark:text-white hover:underline">Voltar ao login</Link>
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
