import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { createContactInquiry, type ContactInquiryInput } from '../services/contactService';
import { useToast } from '../contexts/ToastContext';

const initialForm: ContactInquiryInput = { name: '', email: '', phone: '', socialMedia: '', affiliateExperience: 'sim', presentation: '' };
const totalSteps = 6;

const inputClass = 'w-full rounded-2xl border border-white/10 bg-neutral-950/70 px-5 py-4 text-lg text-white outline-none transition placeholder:text-neutral-600 focus:border-accent-400 focus:ring-2 focus:ring-accent-500/20';

export default function LeadDiagnostic() {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const { push } = useToast();

  const update = <K extends keyof ContactInquiryInput>(key: K, value: ContactInquiryInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const next = () => { setDirection(1); setStep((current) => Math.min(current + 1, totalSteps - 1)); };
  const back = () => { setDirection(-1); setStep((current) => Math.max(current - 1, 0)); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    try {
      await createContactInquiry(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) as unknown as ContactInquiryInput);
      setStatus('success');
      push({ type: 'success', message: 'Diagnóstico enviado. Em breve falaremos com você.' });
    } catch (error) {
      console.error('Falha ao enviar diagnóstico comercial', error);
      setStatus('idle');
      push({ type: 'error', message: 'Não foi possível enviar agora. Tente novamente.' });
    }
  };

  return (
    <section id="diagnostico" className="scroll-mt-8 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl">
        {!started ? (
          <div className="rounded-[2rem] border border-white/10 bg-glass-frame-dark p-8 text-center shadow-2xl backdrop-blur-glass-strong sm:p-14">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-accent-400">Diagnóstico da operação</span>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">Vamos entender onde sua agência pode ganhar controle?</h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-neutral-400">Uma pergunta por vez. No fim, nosso time recebe o contexto necessário para uma conversa objetiva.</p>
            <button type="button" onClick={() => setStarted(true)} className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-accent-500 px-7 py-4 font-bold text-[var(--color-accent-contrast)] transition hover:bg-accent-400">Começar agora <ArrowRight className="h-5 w-5" /></button>
          </div>
        ) : status === 'success' ? (
          <div className="rounded-[2rem] border border-accent-400/20 bg-glass-frame-dark p-10 text-center sm:p-16">
            <CheckCircle2 className="mx-auto h-14 w-14 text-accent-400" /><h2 className="mt-6 font-display text-3xl font-bold text-white">Seu diagnóstico chegou.</h2>
            <p className="mx-auto mt-4 max-w-lg text-lg text-neutral-400">Vamos analisar sua operação e entrar em contato pelos dados informados para definir o melhor próximo passo.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-[2rem] border border-white/10 bg-glass-frame-dark p-6 shadow-2xl backdrop-blur-glass-strong sm:p-10">
            <div className="mb-9">
              <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-neutral-500"><span>Diagnóstico AffiliaCore</span><span>{step + 1} de {totalSteps}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800"><motion.div className="h-full rounded-full bg-accent-500" animate={{ width: `${((step + 1) / totalSteps) * 100}%` }} /></div>
            </div>
            <div className="min-h-[330px] overflow-hidden">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div key={step} custom={direction} initial={{ opacity: 0, x: direction * 35 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -35 }} transition={{ duration: 0.22 }}>
                  {step === 0 && <Step title="Primeiro, como podemos chamar você?" hint="Queremos deixar essa conversa mais pessoal."><input autoFocus required className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Seu nome" /></Step>}
                  {step === 1 && <Step title={`Prazer, ${form.name.split(' ')[0] || 'vamos lá'}. Como é sua operação hoje?`} hint="Isso ajuda a entender seu momento."><Options value={form.affiliateExperience} onChange={(value) => { update('affiliateExperience', value as 'sim' | 'nao'); setTimeout(next, 180); }} options={[['sim', 'Já gerencio uma rede de afiliados'], ['nao', 'Estou estruturando minha agência agora']]} /></Step>}
                  {step === 2 && <Step title="Onde está o maior gargalo?" hint="Escolha o cenário que mais se aproxima do seu."><Options value={form.presentation} onChange={(value) => { update('presentation', value); setTimeout(next, 180); }} options={[['Fecho comissões em planilhas e quero automatizar.', 'Fechamento manual em planilhas'], ['Preciso consolidar CPA/REV de várias casas.', 'CPA/REV espalhados por casa'], ['Quero oferecer um portal e mais transparência aos afiliados.', 'Falta um portal para a rede'], ['Quero estruturar uma operação white-label do zero.', 'Estruturar minha marca white-label']]} /></Step>}
                  {step === 3 && <Step title="Qual é o melhor canal para conhecer sua operação?" hint="Instagram, LinkedIn, site ou outro perfil profissional."><input autoFocus required className={inputClass} value={form.socialMedia} onChange={(e) => update('socialMedia', e.target.value)} placeholder="@perfil ou https://seusite.com.br" /></Step>}
                  {step === 4 && <Step title="Em qual WhatsApp podemos falar com você?" hint="Usaremos este número somente para dar sequência ao diagnóstico."><input autoFocus required type="tel" className={inputClass} value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="(11) 99999-9999" /></Step>}
                  {step === 5 && <Step title="Por último, qual é o seu melhor e-mail?" hint="Revise e envie. Sem spam, sem compromisso."><input autoFocus required type="email" className={inputClass} value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="voce@empresa.com.br" /></Step>}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/8 pt-6">
              <button type="button" onClick={back} disabled={step === 0} className="flex items-center gap-2 px-2 py-3 text-sm font-semibold text-neutral-400 transition hover:text-white disabled:invisible"><ArrowLeft className="h-4 w-4" /> Voltar</button>
              {step !== 1 && step !== 2 && (step < totalSteps - 1 ? <button type="button" onClick={next} disabled={(step === 0 && !form.name.trim()) || (step === 3 && !form.socialMedia.trim()) || (step === 4 && !form.phone.trim())} className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40">Continuar <ArrowRight className="h-4 w-4" /></button> : <button type="submit" disabled={!form.email.trim() || status === 'submitting'} className="flex items-center gap-2 rounded-xl bg-accent-500 px-6 py-3 font-bold text-[var(--color-accent-contrast)] transition hover:bg-accent-400 disabled:opacity-50">{status === 'submitting' ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando</> : <>Enviar diagnóstico <ArrowRight className="h-4 w-4" /></>}</button>)}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function Step({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <div><h2 className="font-display text-2xl font-bold leading-tight text-white sm:text-4xl">{title}</h2><p className="mb-8 mt-3 text-neutral-400">{hint}</p>{children}</div>;
}

function Options({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <div className="grid gap-3">{options.map(([optionValue, label]) => <button type="button" key={optionValue} onClick={() => onChange(optionValue)} className={`flex items-center justify-between rounded-2xl border p-5 text-left font-semibold transition ${value === optionValue ? 'border-accent-400 bg-accent-500/10 text-white' : 'border-white/10 bg-neutral-950/40 text-neutral-300 hover:border-white/25 hover:bg-white/5'}`}><span>{label}</span><span className={`flex h-6 w-6 items-center justify-center rounded-full border ${value === optionValue ? 'border-accent-400 bg-accent-500 text-[var(--color-accent-contrast)]' : 'border-neutral-700'}`}>{value === optionValue && <CheckCircle2 className="h-4 w-4" />}</span></button>)}</div>;
}
