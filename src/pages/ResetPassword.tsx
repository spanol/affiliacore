import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle, KeyRound, Loader2, Lock } from 'lucide-react';
import { auth } from '../lib/firebase';
import { applyPasswordReset, readPasswordResetEmail } from '../lib/authSecurity';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import { BRAND } from '../lib/brandingClient';

export default function ResetPassword() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const oobCode = useMemo(() => params.get('oobCode') || '', [params]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!oobCode) {
      setError('Link de redefinição inválido ou incompleto.');
      setChecking(false);
      return;
    }
    readPasswordResetEmail(auth, oobCode)
      .then((resolvedEmail) => setEmail(resolvedEmail))
      .catch(() => setError('Esse link de redefinição é inválido ou expirou.'))
      .finally(() => setChecking(false));
  }, [oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('A senha deve ter ao menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      await applyPasswordReset(auth, oobCode, password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch {
      setError('Não foi possível redefinir sua senha. Gere um novo link e tente novamente.');
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
          <p className="text-slate-400 dark:text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Crie sua nova senha</p>
        </div>

        {checking ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <Loader2 className="w-8 h-8 text-brand dark:text-white animate-spin" />
            <p className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest">Validando link...</p>
          </div>
        ) : success ? (
          <div className="p-5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold"><CheckCircle size={18} /> Senha redefinida</div>
            <p className="text-xs">Sua senha foi atualizada com sucesso. Redirecionando para o login...</p>
          </div>
        ) : error && !email ? (
          <div className="p-5 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/40 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold"><AlertCircle size={18} /> Link indisponível</div>
            <p className="text-xs">{error}</p>
            <Link to="/forgot-password" className="inline-block text-xs font-bold uppercase tracking-wider hover:underline">Pedir novo link</Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/40 flex items-center gap-2 text-[11px] font-bold">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
            <div className="mb-6 p-4 bg-slate-50 dark:bg-neutral-800/50 rounded-2xl border border-slate-100 dark:border-neutral-800">
              <p className="text-[10px] font-black text-slate-400 dark:text-neutral-500 uppercase tracking-widest mb-1">Conta</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{email}</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">Nova senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">Confirme a nova senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                    placeholder="Repita a nova senha"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-2xl font-bold mt-4 flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-brand text-white hover:bg-brand-light shadow-lg shadow-brand/20 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 dark:shadow-white/10"
              >
                {loading ? 'Salvando...' : <><KeyRound size={18} /> Salvar nova senha</>}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
