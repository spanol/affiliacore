import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { fetchInvite, acceptInvite } from '../services/affiliateService';
import { UserPlus, Mail, Lock, AlertCircle, CheckCircle, Loader2, Instagram, Phone } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';

const boostLogo = `${import.meta.env.BASE_URL}boost-home/logo.svg`;

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const { theme } = useTheme();
  const navigate = useNavigate();

  const [validating, setValidating] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [affiliateName, setAffiliateName] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setInviteError('Convite inválido.');
      setValidating(false);
      return;
    }
    fetchInvite(token)
      .then((info) => setAffiliateName(info.affiliateName))
      .catch((err) => setInviteError(err instanceof Error ? err.message : 'Convite inválido.'))
      .finally(() => setValidating(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');

    if (password.length < 6) {
      setError('A senha deve ter ao menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setError('Informe um número de telefone para contato.');
      return;
    }

    setSubmitting(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedInstagram = instagram.trim().replace(/^@+/, '');
      await acceptInvite(token, normalizedEmail, password, {
        phone: trimmedPhone,
        instagram: normalizedInstagram ? `@${normalizedInstagram}` : '',
      });
      setSuccess(true);
      // Sign the affiliate in so AuthContext loads the profile and redirects.
      try {
        await signInWithEmailAndPassword(auth, normalizedEmail, password);
        setTimeout(() => navigate('/client'), 1500);
      } catch {
        setTimeout(() => navigate('/login'), 1500);
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível concluir o cadastro.');
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className={cn('relative min-h-screen overflow-hidden bg-slate-50 dark:bg-neutral-950 flex items-center justify-center p-4 transition-colors duration-300', theme === 'dark' && 'dark')}>
      <div className="pointer-events-none fixed top-[-15%] right-[-10%] w-[45%] h-[45%] rounded-full bg-white/5 blur-[120px] hidden dark:block" />
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md bg-white dark:bg-neutral-900/60 backdrop-blur-xl p-8 md:p-10 rounded-3xl shadow-xl shadow-slate-900/5 dark:shadow-black/30 border border-slate-200/70 dark:border-neutral-800"
      >
        {children}
      </motion.div>
    </div>
  );

  if (validating) {
    return shell(
      <div className="flex flex-col items-center gap-4 py-8">
        <Loader2 className="w-8 h-8 text-brand dark:text-white animate-spin" />
        <p className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest">Validando convite...</p>
      </div>
    );
  }

  if (inviteError) {
    return shell(
      <div className="text-center space-y-4 py-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/30 text-red-500">
          <AlertCircle size={28} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Convite indisponível</h2>
        <p className="text-sm text-slate-500 dark:text-neutral-400">{inviteError}</p>
        <Link to="/login" className="inline-block text-brand dark:text-white hover:underline text-xs font-bold uppercase tracking-wider">Ir para o login</Link>
      </div>
    );
  }

  if (success) {
    return shell(
      <div className="text-center space-y-4 py-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 text-green-500 animate-bounce">
          <CheckCircle size={36} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Acesso criado!</h2>
        <p className="text-sm text-slate-500 dark:text-neutral-400">Entrando na sua área...</p>
      </div>
    );
  }

  return shell(
    <>
      <div className="text-center mb-8">
        <img src={boostLogo} alt="Boost" className="h-7 w-auto mx-auto mb-4 invert dark:invert-0" />
        <p className="text-slate-400 dark:text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Ative seu acesso de afiliado</p>
      </div>

      {affiliateName && (
        <div className="mb-6 p-4 bg-slate-50 dark:bg-neutral-800/50 rounded-2xl border border-slate-100 dark:border-neutral-800">
          <p className="text-[10px] font-black text-slate-400 dark:text-neutral-500 uppercase tracking-widest mb-1">Convite para</p>
          <p className="text-sm font-bold text-slate-900 dark:text-white">{affiliateName}</p>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/40 flex items-center gap-2 text-[11px] font-bold">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">Seu e-mail</label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
              placeholder="nome@exemplo.com"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">Telefone (WhatsApp)</label>
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
              placeholder="(11) 99999-9999"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">Instagram <span className="text-slate-300 dark:text-neutral-600 normal-case font-medium">(opcional)</span></label>
          <div className="relative">
            <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
              placeholder="@seuperfil"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">Crie uma senha</label>
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
          <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">Confirme a senha</label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
              placeholder="Repita a senha"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 rounded-2xl font-bold mt-4 flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-brand text-white hover:bg-brand-light shadow-lg shadow-brand/20 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 dark:shadow-white/10"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <><UserPlus size={18} /> Ativar meu acesso</>}
        </button>
      </form>

      <p className="text-center mt-8 text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-tight">
        Já tem acesso? <Link to="/login" className="text-brand dark:text-white hover:underline">Fazer login</Link>
      </p>
    </>
  );
}
