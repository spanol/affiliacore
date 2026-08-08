import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Mail, AlertCircle, MailCheck, KeyRound } from 'lucide-react';
import { auth } from '../lib/firebase';
import { requestPasswordReset } from '../lib/authSecurity';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import InstanceLogo from '../components/InstanceLogo';

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
      // ATENÇÃO ao ler este catch: com a **Email Enumeration Protection** ligada
      // (padrão do Identity Platform em projeto novo — confirmado no
      // infinity-affiliacore em 07/08/2026), o `sendPasswordResetEmail` resolve com
      // SUCESSO para e-mail SEM conta e não envia nada. Ou seja, `auth/user-not-found`
      // é código MORTO nessas instâncias e o caminho feliz é indistinguível do
      // "não existe" — por isso a tela de sucesso NÃO pode afirmar que enviou.
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
          <InstanceLogo className="h-7 w-auto mx-auto mb-4" />
          <p className="text-slate-400 dark:text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Redefina sua senha</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/40 flex items-center gap-2 text-[11px] font-bold">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {success ? (
          <div className="p-5 bg-slate-50 dark:bg-neutral-800/60 text-slate-700 dark:text-neutral-300 rounded-2xl border border-slate-200 dark:border-neutral-700 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><MailCheck size={18} /> Pedido registrado</div>
            <p className="text-xs">
              Se <span className="font-bold break-all">{email.trim().toLowerCase()}</span> tiver uma conta na plataforma,
              o link para criar uma nova senha chega em instantes.
            </p>
            <p className="text-xs text-slate-500 dark:text-neutral-400">
              Não recebeu? Confira o spam / lixo eletrônico. Se não chegar, é provável que esse e-mail
              ainda <span className="font-bold">não tenha acesso criado</span> — peça o convite a quem administra a plataforma.
            </p>
            <Link to="/login" className="inline-block text-xs font-bold uppercase tracking-wider text-auth-cta dark:text-lp-cta hover:underline">Voltar para o login</Link>
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
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-auth-cta/20 focus:border-auth-cta transition-all outline-none"
                  placeholder="nome@empresa.com"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl font-bold mt-4 flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-auth-cta text-auth-cta-text hover:bg-auth-cta-hover shadow-lg shadow-auth-cta/20 dark:bg-lp-cta dark:text-lp-cta-text dark:hover:bg-lp-cta-hover dark:shadow-lp-cta/10"
            >
              {loading ? 'Enviando...' : <><KeyRound size={18} /> Enviar link de recuperação</>}
            </button>
            <p className="text-center mt-6 text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-tight">
              Lembrou sua senha? <Link to="/login" className="text-auth-cta dark:text-lp-cta hover:underline">Voltar ao login</Link>
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
