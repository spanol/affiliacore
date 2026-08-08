import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserPlus, Mail, Lock, User, AlertCircle, CheckCircle, Phone, Share2, IdCard, MailQuestion } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import { maskCPF, maskPhone, isValidCPF, isValidPhone } from '../lib/validators';
import InstanceLogo from '../components/InstanceLogo';
import { readStoredRegistrationSource } from '../lib/registrationSource';
import { selfRegistrationOpen } from '../lib/showcase';


export default function Register() {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [socialMedia, setSocialMedia] = useState('');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  // O estado da vitrine (settings/showcase) É a declaração de auto-cadastro da
  // agência: desligada = onboarding só por convite, e este formulário fecha.
  // Consulta o próprio GET /api/showcase (público). FAIL-OPEN via
  // selfRegistrationOpen: erro de rede ou build antiga não trancam o cadastro.
  const [selfRegOpen, setSelfRegOpen] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    fetch('/api/showcase', { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((payload) => {
        if (alive) setSelfRegOpen(selfRegistrationOpen(payload));
      })
      .catch(() => {
        if (alive) setSelfRegOpen(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidCPF(cpf)) {
      setError('CPF inválido. Verifique os números digitados.');
      return;
    }

    if (!isValidPhone(phone)) {
      setError('Telefone inválido. Use o formato (00) 00000-0000.');
      return;
    }

    // P1.10: normaliza o e-mail UMA vez e usa em TODO lugar (Auth + Firestore). Antes o
    // Auth recebia o e-mail cru (linha do createUser) e só o Firestore gravava
    // trim+lowercase → divergência (queries por e-mail e o login podiam não casar).
    const normalizedEmail = email.trim().toLowerCase();

    setLoading(true);

    // Explicit path for logging
    let currentPath = '';

    try {
      let user;
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        user = userCredential.user;
      } catch (authErr: any) {
        // Se o e-mail já existe, vamos ver se o usuário está logado e tentar criar o perfil
        // Isso ajuda em casos onde o Auth funcionou mas o Firestore falhou anteriormente
        if (authErr.code === 'auth/email-already-in-use') {
          if (auth.currentUser && auth.currentUser.email === normalizedEmail) {
            user = auth.currentUser;
          } else {
            setError('Este e-mail já está cadastrado. Tente fazer login ou use outro.');
            setLoading(false);
            return;
          }
        } else {
          throw authErr;
        }
      }

      // Create user profile in Firestore. SECURITY (CRITICAL-1): o self-cadastro
      // SEMPRE cria role 'client' — as rules bloqueiam qualquer outro valor. Promover
      // a admin é feito fora do cliente (console / Admin SDK), nunca por e-mail aqui.
      const role = 'client';
      currentPath = `users/${user.uid}`;

      // Origem do auto-cadastro (ex.: 'vitrine-affiliacore'), capturada no boot.
      // O create de `users` não tem allowlist de campos — o carimbo passa direto.
      const registrationSource = readStoredRegistrationSource();

      try {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          name: name.trim(),
          email: normalizedEmail,
          phone: phone.trim(),
          socialMedia: socialMedia.trim(),
          cpf: cpf.trim(),
          role,
          avatarUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(name)}`,
          ...(registrationSource ? { source: registrationSource } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (firestoreErr: any) {
        console.error('Firestore creation failed:', firestoreErr);
        setError(`Erro ao salvar perfil: ${firestoreErr.message || 'Verifique as permissões do Firebase.'}`);
        handleFirestoreError(firestoreErr, OperationType.WRITE, currentPath);
        return;
      }

      setSuccess(true);

      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está em uso.');
      } else {
        setError('Ocorreu um erro ao criar sua conta.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!selfRegOpen) {
    return (
      <div className={cn("relative min-h-screen overflow-hidden bg-slate-50 dark:bg-neutral-950 flex items-center justify-center p-4 transition-colors duration-300", theme === 'dark' && 'dark')}>
        <div className="pointer-events-none fixed top-[-15%] right-[-10%] w-[45%] h-[45%] rounded-full bg-white/5 blur-[120px] hidden dark:block" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative bg-glass-card dark:bg-glass-card-dark backdrop-blur-glass-strong p-10 rounded-3xl shadow-xl shadow-slate-900/5 dark:shadow-black/30 border border-slate-200/70 dark:border-neutral-800 text-center max-w-sm"
        >
          <InstanceLogo className="h-7 w-auto mx-auto mb-6" />
          <div className="flex justify-center mb-5">
            <MailQuestion size={48} className="text-slate-400 dark:text-neutral-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Cadastro por convite</h2>
          <p className="text-sm text-slate-500 dark:text-neutral-400 mb-8">
            No momento, novos afiliados entram por convite da agência. Fale com a gente pela página
            inicial para pedir o seu acesso — ou, se você já recebeu um link de convite, é só abri-lo.
          </p>
          <Link
            to="/"
            className="inline-flex w-full items-center justify-center py-3.5 rounded-2xl font-bold text-sm transition-all bg-auth-cta text-auth-cta-text hover:bg-auth-cta-hover dark:bg-lp-cta dark:text-lp-cta-text dark:hover:bg-lp-cta-hover"
          >
            Ir para a página inicial
          </Link>
          <p className="text-center mt-6 text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-tight">
            Já possui acesso? <Link to="/login" className="text-auth-cta dark:text-lp-cta hover:underline">Fazer login</Link>
          </p>
        </motion.div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={cn("relative min-h-screen overflow-hidden bg-slate-50 dark:bg-neutral-950 flex items-center justify-center p-4 transition-colors duration-300", theme === 'dark' && 'dark')}>
        <div className="pointer-events-none fixed top-[-15%] right-[-10%] w-[45%] h-[45%] rounded-full bg-white/5 blur-[120px] hidden dark:block" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative bg-glass-card dark:bg-glass-card-dark backdrop-blur-glass-strong p-12 rounded-3xl shadow-xl shadow-slate-900/5 dark:shadow-black/30 border border-slate-200/70 dark:border-neutral-800 text-center max-w-sm"
        >
          <div className="flex justify-center mb-6">
            <CheckCircle size={64} className="text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Conta Criada!</h2>
          <p className="text-slate-500 dark:text-neutral-400 mb-6">Um e-mail de confirmação e boas vindas foi enviado para <b>{email}</b>.</p>
          <p className="text-xs text-slate-400 dark:text-neutral-500">Redirecionando para o painel...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("relative min-h-screen overflow-hidden bg-slate-50 dark:bg-neutral-950 flex items-center justify-center p-4 transition-colors duration-300", theme === 'dark' && 'dark')}>
      <div className="pointer-events-none fixed top-[-15%] right-[-10%] w-[45%] h-[45%] rounded-full bg-white/5 blur-[120px] hidden dark:block" />

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md bg-glass-card dark:bg-glass-card-dark backdrop-blur-glass-strong p-8 md:p-10 rounded-3xl shadow-xl shadow-slate-900/5 dark:shadow-black/30 border border-slate-200/70 dark:border-neutral-800"
      >
        <div className="text-center mb-8">
          <InstanceLogo className="h-7 w-auto mx-auto mb-4" />
          <p className="text-slate-400 dark:text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Solicite sua afiliação</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/40 flex items-center gap-2 text-[11px] font-bold">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">Nome Completo</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-auth-cta/20 focus:border-auth-cta transition-all outline-none"
                placeholder="Seu nome"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-auth-cta/20 focus:border-auth-cta transition-all outline-none"
                placeholder="nome@exemplo.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">Telefone</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-auth-cta/20 focus:border-auth-cta transition-all outline-none"
                placeholder="(11) 98765-4321"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">Rede Social</label>
            <div className="relative">
              <Share2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
              <input
                type="text"
                value={socialMedia}
                onChange={(e) => setSocialMedia(e.target.value)}
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-auth-cta/20 focus:border-auth-cta transition-all outline-none"
                placeholder="@seu_perfil"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-neutral-500 tracking-widest ml-1">CPF</label>
            <div className="relative">
              <IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500" size={16} />
              <input
                type="text"
                inputMode="numeric"
                value={cpf}
                onChange={(e) => setCpf(maskCPF(e.target.value))}
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-auth-cta/20 focus:border-auth-cta transition-all outline-none"
                placeholder="000.000.000-00"
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
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-auth-cta/20 focus:border-auth-cta transition-all outline-none"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl font-bold mt-4 flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-auth-cta text-auth-cta-text hover:bg-auth-cta-hover shadow-lg shadow-auth-cta/20 dark:bg-lp-cta dark:text-lp-cta-text dark:hover:bg-lp-cta-hover dark:shadow-lp-cta/10"
          >
            {loading ? 'Enviando...' : <><UserPlus size={18} /> Enviar solicitação</>}
          </button>
        </form>

        <p className="text-center mt-8 text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-tight">
          Já possui acesso? <Link to="/login" className="text-auth-cta dark:text-lp-cta hover:underline">Fazer login</Link>
        </p>
      </motion.div>
    </div>
  );
}
