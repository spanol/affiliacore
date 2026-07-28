// Preferência de leitura do contador de afiliados: a CARTEIRA inteira ou só quem
// produziu no período selecionado.
//
// Existe porque a migração de uma base legada traz a carteira de contatos junto
// (na Infinity: 159 afiliados, ~30 produzindo) — o número de capa passa a responder
// "quantos cadastros eu tenho", não "quantos estão operando". O toggle deixa as
// duas leituras à mão em vez de escolher uma pelo cliente.
//
// A escolha é POR NAVEGADOR (localStorage), não por perfil: é preferência de
// visualização, não dado de domínio — não vale uma escrita no Firestore.

export type AffiliateCountMode = 'all' | 'producing';

export const AFFILIATE_COUNT_MODE_KEY = 'affiliacore:affiliateCountMode';

/**
 * Lê a preferência salva. Default `all` — mantém o comportamento histórico do card
 * para quem nunca clicou, então ninguém acha que "sumiram afiliados" após o deploy.
 * localStorage pode lançar (modo restrito/SSR): qualquer falha cai no default.
 */
export function readAffiliateCountMode(storage?: Pick<Storage, 'getItem'>): AffiliateCountMode {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    return store?.getItem(AFFILIATE_COUNT_MODE_KEY) === 'producing' ? 'producing' : 'all';
  } catch {
    return 'all';
  }
}

/** Grava a preferência; falha de storage é silenciosa (o toggle segue funcionando na sessão). */
export function writeAffiliateCountMode(mode: AffiliateCountMode, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    store?.setItem(AFFILIATE_COUNT_MODE_KEY, mode);
  } catch {
    /* preferência de UI: perder a persistência não é erro que valha interromper a tela */
  }
}
