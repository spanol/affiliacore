import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Check, FileSpreadsheet, ShieldCheck, Users } from 'lucide-react';
import { BRAND } from '../lib/brandingClient';
import LeadDiagnostic from '../components/LeadDiagnostic';

const benefits = [
  {
    icon: FileSpreadsheet,
    title: 'Fechamento sem planilha',
    text: 'CPA e REV configurados por afiliado e por casa, com cálculo centralizado.',
  },
  {
    icon: Users,
    title: 'Portal do afiliado',
    text: 'Cada parceiro acompanha apenas os próprios resultados em um painel claro.',
  },
  {
    icon: ShieldCheck,
    title: 'Operação auditável',
    text: 'Alterações, taxas e decisões ficam registradas para sua equipe ter controle.',
  },
];

export default function Home() {
  const startDiagnostic = () => {
    document.getElementById('diagnostico')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen overflow-hidden bg-neutral-950 text-neutral-100 selection:bg-accent-400 selection:text-neutral-950">
      <div className="pointer-events-none fixed inset-0 bg-grid-white opacity-[0.025]" />
      <div className="pointer-events-none fixed left-1/2 top-[-22rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-accent-500/10 blur-[140px]" />

      <header className="relative z-20 border-b border-white/5 bg-glass-chrome-dark backdrop-blur-glass-medium">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link to="/" aria-label={`Início — ${BRAND.name}`}>
            <img src={BRAND.logoUrl} alt={BRAND.shortName} className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/login" className="px-3 py-2 text-sm font-semibold text-neutral-300 transition hover:text-white">
              Entrar
            </Link>
            <Link to="/register" className="hidden rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:border-accent-400/60 hover:bg-white/5 sm:block">
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl items-center gap-14 px-6 py-20 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-accent-400/20 bg-accent-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-accent-300">
              <span className="h-2 w-2 rounded-full bg-accent-400" />
              Gestão de afiliados para iGaming
            </div>
            <h1 className="max-w-3xl font-display text-5xl font-extrabold leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
              Sua agência cresceu. <span className="text-accent-400">A planilha não.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-neutral-400 sm:text-xl">
              Centralize CPA e REV por casa, entregue um portal aos seus afiliados e opere com auditoria — tudo em um painel white-label com a sua marca.
            </p>
            <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <button type="button" onClick={startDiagnostic} className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-accent-500 px-7 py-4 font-bold text-[var(--color-accent-contrast)] shadow-xl shadow-accent-950/30 transition hover:bg-accent-400 sm:w-auto">
                Diagnosticar minha operação
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </button>
              <span className="text-sm text-neutral-500">Leva menos de 2 minutos</span>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-neutral-400">
              {['Sem compromisso', 'Diagnóstico personalizado', 'Contato humano'].map((item) => (
                <span key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-accent-400" />{item}</span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-6 rounded-[2.5rem] bg-accent-500/10 blur-3xl" />
            <div className="relative rounded-[2rem] border border-white/10 bg-glass-frame-dark p-5 shadow-2xl backdrop-blur-glass-strong sm:p-7">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div><p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Visão da operação</p><p className="mt-1 font-display text-xl font-bold">Painel da sua agência</p></div>
                <div className="rounded-xl bg-accent-500/10 p-3"><BarChart3 className="h-6 w-6 text-accent-400" /></div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[['Casas conectadas', 'Multi-casa'], ['Modelos', 'CPA + REV'], ['Experiência', 'Sua marca'], ['Controle', 'Auditável']].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/8 bg-neutral-950/50 p-4"><p className="text-xs text-neutral-500">{label}</p><p className="mt-2 font-semibold text-white">{value}</p></div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-accent-400/15 bg-accent-500/5 p-5">
                <div className="mb-4 flex justify-between text-sm"><span className="text-neutral-400">Fechamento mensal</span><span className="font-semibold text-accent-300">Organizado</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-800"><div className="h-full w-[84%] rounded-full bg-accent-500" /></div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-neutral-900/35 py-20">
          <div className="mx-auto max-w-7xl px-6">
            <p className="text-center text-sm font-bold uppercase tracking-[0.2em] text-neutral-500">Infraestrutura para sua agência operar com clareza</p>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {benefits.map(({ icon: Icon, title, text }) => (
                <article key={title} className="rounded-3xl border border-white/8 bg-glass-card-dark p-7 backdrop-blur-glass-soft">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-500/10"><Icon className="h-5 w-5 text-accent-400" /></div>
                  <h2 className="font-display text-xl font-bold text-white">{title}</h2><p className="mt-3 leading-relaxed text-neutral-400">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <LeadDiagnostic />
      </main>

      <footer className="relative z-10 border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-neutral-500 sm:flex-row">
          <span>© {new Date().getFullYear()} {BRAND.shortName}</span>
          <div className="flex gap-6"><Link to="/login" className="hover:text-white">Entrar</Link><Link to="/register" className="hover:text-white">Criar conta</Link></div>
        </div>
      </footer>
    </div>
  );
}
