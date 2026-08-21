import { useEffect, useMemo, useState } from 'react';
import { pluralize } from '../lib/plural';
import { motion } from 'motion/react';
import { Link2, Loader2, Copy, Check, MousePointerClick, ExternalLink } from 'lucide-react';
import {
  fetchPartnerships, fetchAffiliateLinks, fetchDeals, fetchAffiliateConfigs, buildGoUrl, DEAL_MODEL_LABEL,
  type AffiliateConfig,
} from '../services/affiliateService';
import { fetchHouses } from '../services/houseService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { houseLogoOrPreset } from '../lib/housePresets';
import { dealKpiChips, myCommissionChips } from '../lib/dealShowcase';
import { buildMyLinkCards, type MyLinkCard } from '../lib/linkTriage';

export default function MyLinks() {
  const { push } = useToast();
  const { profile } = useAuth();
  // Cartões = parcerias aprovadas UNIDAS aos links atribuídos pela triagem ou
  // migrados de plataforma legada (esses não têm parceria e antes ficavam
  // invisíveis pro dono). Ver buildMyLinkCards em src/lib/linkTriage.ts.
  const [cards, setCards] = useState<MyLinkCard[]>([]);
  // A PRÓPRIA config do afiliado: é dela que sai a comissão que o gerente atribuiu
  // (byBrand da casa), mostrada no card de um acordo gerenciado. `null` = sem chip.
  const [myConfig, setMyConfig] = useState<AffiliateConfig | null>(null);
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Os acordos entram para o cartão mostrar os TERMOS do link, e não só a URL.
        // `catch` porque o marketplace é opt-in por instância: sem o módulo a rota não
        // existe, e a tela tem que continuar listando os links do mesmo jeito.
        const [parts, allLinks, houses, deals, configs] = await Promise.all([
          fetchPartnerships('approved'), fetchAffiliateLinks(), fetchHouses().catch(() => []),
          fetchDeals().catch(() => []),
          // O servidor escopa por papel (afiliado recebe a própria config); falha
          // aqui só faz o chip de comissão não aparecer, a tela segue inteira.
          fetchAffiliateConfigs().catch(() => ({} as Record<string, AffiliateConfig>)),
        ]);
        // O 5º argumento é o ESCOPO: as duas listas chegam com a rede do gerente
        // dentro (as rotas servem também as telas de gestão). Aqui é a página
        // pessoal, então só entram os links de quem está logado.
        setCards(buildMyLinkCards(parts, allLinks as any, houses as any, deals as any, profile?.affiliateId ?? ''));
        setMyConfig(profile?.affiliateId ? configs[String(profile.affiliateId)] ?? null : null);
        const hmap: Record<string, string | null> = {};
        (houses as any[]).forEach((h) => {
          hmap[String(h.id)] = houseLogoOrPreset(h.logo, h.slug, h.id, h.name);
        });
        setLogos(hmap);
      } catch {
        push({ type: 'error', message: 'Erro ao carregar seus links.' });
      } finally {
        setLoading(false);
      }
    })();
    /* eslint-disable-next-line */
  }, [profile?.affiliateId]);

  const totalClicks = useMemo(() => cards.reduce((s, c) => s + c.clicks, 0), [cards]);

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(buildGoUrl(code));
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-8 pb-16">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent-500">Divulgação</span>
        <div className="flex items-center gap-3 mt-1">
          <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
            <Link2 size={24} className="text-slate-900 dark:text-white" />
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">Meus Links</h1>
          {cards.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-accent-500/15 text-accent-500 text-[11px] font-bold">{pluralize(cards.length, 'link')} · {pluralize(totalClicks, 'clique')}</span>
          )}
        </div>
        {/* Nada de "um por casa": a mesma casa pode ter mais de um link do mesmo
            afiliado (link migrado do legado convivendo com o da parceria). */}
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">Seus links de divulgação. Compartilhe e acompanhe os cliques.</p>
      </motion.header>

      {loading ? (
        <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-accent-500" size={40} /></div>
      ) : cards.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-16 text-center bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl">
          <Link2 className="mx-auto text-slate-300 dark:text-neutral-600 mb-3" size={40} />
          <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100">Nenhum link ainda</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">Solicite uma parceria em "Parcerias". Quando ela for aprovada, o link aparece aqui. O administrador também pode atribuir um link direto a você.</p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {cards.map((card) => {
            const logo = card.houseId ? logos[card.houseId] : null;
            return (
              <div key={card.key} className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  {logo ? (
                    <img src={logo} alt={card.title} className="w-11 h-11 rounded-xl object-contain bg-slate-50 dark:bg-neutral-800 p-1 border border-slate-100 dark:border-neutral-700" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-accent-500/15 text-accent-500 flex items-center justify-center font-black text-lg">{card.title.charAt(0).toUpperCase()}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate">{card.title}</h3>
                    <p className="text-[11px] text-slate-400 dark:text-neutral-500 truncate">{card.subtitle}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1.5 text-slate-900 dark:text-white font-bold"><MousePointerClick size={15} className="text-accent-500" /> {card.clicks}</div>
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-neutral-500 font-bold">cliques</span>
                  </div>
                </div>
                {/* Termos do acordo que rege este link. Os KPIs saem da POLÍTICA do
                    tipo de acordo (a mesma da vitrine): num acordo gerenciado o CPA
                    nem chega aqui, o servidor já o removeu da resposta. */}
                {card.deal && (
                  <div data-testid={`acordo-${card.code}`} className="mt-4 flex flex-wrap gap-1.5">
                    {card.deal.model && (
                      <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-accent-500/15 text-accent-500 uppercase tracking-wide">
                        {DEAL_MODEL_LABEL[card.deal.model]}
                      </span>
                    )}
                    {/* A comissão do PRÓPRIO afiliado vem antes dos termos da
                        oferta: num acordo gerenciado o CPA do deal nem chega ao
                        client, e o que interessa a quem divulga é o que ELE ganha
                        (pedido do Maurício, 18/08/2026). Ver myCommissionChips. */}
                    {myCommissionChips(card.deal, myConfig, card.brandKey).map((chip) => (
                      <span key={chip.id} data-testid={`kpi-${chip.id}`} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        {chip.label} {chip.value}
                      </span>
                    ))}
                    {dealKpiChips(card.deal).map((chip) => (
                      <span key={chip.id} data-testid={`kpi-${chip.id}`} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300">
                        {chip.label} {chip.value}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-neutral-800">
                  {!card.deliverable ? (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">Link indisponível: ainda sem URL de cadastro, ou desativado. Fale com o administrador.</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs text-slate-700 dark:text-neutral-200 truncate">{buildGoUrl(card.code)}</code>
                      <button onClick={() => copyLink(card.code)} className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold hover:opacity-90 flex items-center gap-1.5">
                        {copied === card.code ? <Check size={14} /> : <Copy size={14} />} {copied === card.code ? 'Copiado' : 'Copiar'}
                      </button>
                      <a href={buildGoUrl(card.code)} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-500 hover:text-accent-500"><ExternalLink size={14} /></a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
