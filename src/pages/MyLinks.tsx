import { useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, Copy, Check, MousePointerClick, ExternalLink } from 'lucide-react';
import {
  fetchPartnerships, fetchAffiliateLinks, buildGoUrl,
  type PartnershipRequest, type AffiliateLink,
} from '../services/affiliateService';
import { fetchHouses } from '../services/houseService';
import { useToast } from '../contexts/ToastContext';

export default function MyLinks() {
  const { push } = useToast();
  const [approved, setApproved] = useState<PartnershipRequest[]>([]);
  const [links, setLinks] = useState<Record<string, AffiliateLink>>({});
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [parts, allLinks, houses] = await Promise.all([
          fetchPartnerships('approved'), fetchAffiliateLinks(), fetchHouses().catch(() => []),
        ]);
        setApproved(parts.filter((p) => p.code));
        const lmap: Record<string, AffiliateLink> = {};
        allLinks.forEach((l) => { lmap[l.code] = l; });
        setLinks(lmap);
        const hmap: Record<string, string | null> = {};
        (houses as any[]).forEach((h) => { hmap[String(h.id)] = h.logo ?? null; });
        setLogos(hmap);
      } catch {
        push({ type: 'error', message: 'Erro ao carregar seus links.' });
      } finally {
        setLoading(false);
      }
    })();
    /* eslint-disable-next-line */
  }, []);

  const totalClicks = useMemo(
    () => approved.reduce((s, p) => s + (p.code ? links[p.code]?.clicks || 0 : 0), 0),
    [approved, links]
  );

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(buildGoUrl(code));
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-8 pb-16">
      <header>
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent-500">Divulgação</span>
        <div className="flex items-center gap-3 mt-1">
          <span className="p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-100 dark:border-neutral-700/60">
            <Link2 size={24} className="text-slate-900 dark:text-white" />
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tighter">Meus Links</h1>
          {approved.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-accent-500/15 text-accent-500 text-[11px] font-bold">{approved.length} link(s) · {totalClicks} clique(s)</span>
          )}
        </div>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-2">Links aprovados para divulgação, um por acordo. Compartilhe e acompanhe os cliques.</p>
      </header>

      {loading ? (
        <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-accent-500" size={40} /></div>
      ) : approved.length === 0 ? (
        <div className="p-16 text-center bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl">
          <Link2 className="mx-auto text-slate-300 dark:text-neutral-600 mb-3" size={40} />
          <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-100">Nenhum link aprovado ainda</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">Solicite uma parceria em "Parcerias"; ao ser aprovada, o link aparece aqui.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approved.map((p) => {
            const link = p.code ? links[p.code] : undefined;
            const logo = p.houseId ? logos[String(p.houseId)] : null;
            const inactive = link && link.active === false;
            return (
              <div key={p.id} className="bg-white dark:bg-neutral-900/60 border border-slate-200/70 dark:border-neutral-800 rounded-3xl p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  {logo ? (
                    <img src={logo} alt={p.operatorName || ''} className="w-11 h-11 rounded-xl object-contain bg-slate-50 dark:bg-neutral-800 p-1 border border-slate-100 dark:border-neutral-700" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-accent-500/15 text-accent-500 flex items-center justify-center font-black text-lg">{(p.operatorName || '?').charAt(0).toUpperCase()}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate">{p.operatorName || 'Operadora'}</h3>
                    <p className="text-[11px] text-slate-400 dark:text-neutral-500 truncate">{p.dealLabel}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1.5 text-slate-900 dark:text-white font-bold"><MousePointerClick size={15} className="text-accent-500" /> {link?.clicks ?? 0}</div>
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-neutral-500 font-bold">cliques</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-neutral-800">
                  {inactive || !link?.registerUrl ? (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">Link indisponível — a casa ainda não tem URL de cadastro configurada. Fale com o administrador.</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 rounded-xl text-xs text-slate-700 dark:text-neutral-200 truncate">{buildGoUrl(p.code!)}</code>
                      <button onClick={() => copyLink(p.code!)} className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold hover:opacity-90 flex items-center gap-1.5">
                        {copied === p.code ? <Check size={14} /> : <Copy size={14} />} {copied === p.code ? 'Copiado' : 'Copiar'}
                      </button>
                      <a href={buildGoUrl(p.code!)} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-500 hover:text-accent-500"><ExternalLink size={14} /></a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
