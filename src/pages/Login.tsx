import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { LogIn, Mail, Lock, AlertCircle, ShieldCheck } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import { createTotpSignInChallenge, isMfaRequiredError, normalizeAuthEmail, resolveTotpSignIn, type TotpSignInChallenge } from '../lib/authSecurity';

import { BRAND } from '../lib/brandingClient';

export default function Login() {
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [challenge, setChallenge] = useState<TotpSignInChallenge | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, normalizeAuthEmail(email), password);
      navigate('/dashboard');
    } catch (err: any) {
      if (isMfaRequiredError(err)) {
        try {
          setChallenge(createTotpSignInChallenge(auth, err));
          setOtpCode('');
        } catch {
          setError('Não foi possível iniciar a verificação em duas etapas.');
        }
      } else {
        setError('E-mail ou senha inválidos.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setLoading(true);
    setError('');
    try {
      await resolveTotpSignIn(challenge, otpCode.trim());
      navigate('/dashboard');
    } catch {
      setError('Código inválido. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("relative min-h-screen overflow-hidden bg-slate-50 dark:bg-neutral-950 flex items-center justify-center p-4 transition-colors duration-300", theme === 'dark' && 'dark')}>
      <div className="pointer-events-none fixed top-[-15%] right-[-10%] w-[45%] h-[45%] rounded-full bg-white/5 blur-[120px] hidden dark:block" />

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md bg-glass-card dark:bg-glass-card-dark backdrop-blur-glass-strong p-8 md:p-10 rounded-3xl shadow-xl shadow-slate-900/5 dark:shadow-black/30 border border-slate-200/70 dark:border-neutral-800"
      >
        <div className="text-center mb-8">
          <img src={BRAND.logoUrl} alt={BRAND.shortName} className="h-7 w-auto mx-auto mb-4 invert dark:invert-0" />
          <p className="text-slate-400 dark:text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Acesse sua área restrita</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/40 flex items-center gap-2 text-[11px] font-bold">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {challenge ? (
          <form onSubmit={handleTotpSubmit} className="space-y-4">
            <div className="mb-2 p-4 bg-slate-50 dark:bg-neutral-800/50 rounded-2xl border border-slate-100 dark:border-neutral-800">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <ShieldCheck size={16} /> Verificação em duas etapas
              </div>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-2">Digite o código de 6 dígitos do seu autenticador para concluir o login.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">Código do autenticador</label>
              <div className="relative">
                <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
                <input
                  type="text"
                  inputMode="numeric"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                  placeholder="000000"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length < 6}
              className="w-full py-4 rounded-2xl font-bold mt-4 flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-brand text-white hover:bg-brand-light shadow-lg shadow-brand/20 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 dark:shadow-white/10"
            >
              {loading ? 'Validando...' : 'Confirmar código'}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => { setChallenge(null); setOtpCode(''); setError(''); }}
              className="w-full py-3 rounded-2xl font-bold transition-all disabled:opacity-50 border border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300"
            >
              Voltar
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
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

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">Senha de Acesso</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                  placeholder="••••••••"
                />
              </div>
              <div className="text-right pt-1">
                <Link to="/forgot-password" className="text-[11px] font-bold text-brand dark:text-white hover:underline">
                  Esqueci minha senha
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl font-bold mt-4 flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-brand text-white hover:bg-brand-light shadow-lg shadow-brand/20 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 dark:shadow-white/10"
            >
              {loading ? 'Processando...' : <><LogIn size={18} /> Entrar no sistema</>}
            </button>
          </form>
        )}

        {!challenge && (
          <p className="text-center mt-8 text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-tight">
            Novo aqui? <Link to="/register" className="text-brand dark:text-white hover:underline">Solicitar cadastro</Link>
          </p>
        )}
      </motion.div>
    </div>
  );
}
