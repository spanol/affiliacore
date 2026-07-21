// Scan PURO da lista de afiliados por id, extraído do fallback de fetchAffiliateById
// (quando o mirror local do Firestore 404a/sem-dados, varre a lista completa da API).
// Casa tanto `a.id` quanto `a._id` (a API externa varia o nome do campo) e coage os
// dois lados a string (id pode vir number). Não acha → null (nunca lança). R19.
export function findAffiliateInList(list: any[], id: string): any | null {
  if (!Array.isArray(list)) return null;
  const normalizedId = String(id);
  return list.find((a: any) => String(a?.id || a?._id || '') === normalizedId) ?? null;
}

// Sintetiza um objeto "afiliado" a partir do doc de LOGIN (`users/{uid}`) para o caso
// em que o afiliado existe SÓ como conta — sem mirror `affiliates` e sem produção
// externa (OTG). É o afiliado que se auto-cadastrou pelo /register ("Solicite sua
// afiliação"): a lista do admin já o mostra (sintetizado do `users`, id = uid), então
// a ficha `/affiliates/:id` TAMBÉM tem que abrir — antes dava "Afiliado não encontrado"
// (garantido numa instância OTG-free, onde não há roster nem funil de fallback).
// Mantém o `id` da ROTA (o uid quando não há affiliateId, ou o affiliateId já vinculado).
// Puro: só formata o doc; a leitura (e as rules) ficam no serviço. Nunca lança.
export function userDocToAffiliate(id: string, data: any): {
  id: string; name: string; email: string; phone: string;
  socialMedia: string; cpf: string; avatarUrl: string; source: 'user';
} {
  const d = data && typeof data === 'object' ? data : {};
  return {
    id: String(id),
    name: String(d.name || d.email || 'Sem Nome'),
    email: String(d.email || ''),
    phone: String(d.phone || ''),
    socialMedia: String(d.socialMedia || ''),
    cpf: String(d.cpf || ''),
    avatarUrl: String(d.avatarUrl || ''),
    source: 'user',
  };
}
