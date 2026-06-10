// DEV-ONLY · preview multi-casa. A OTG já LISTA a SportingBet pra agência, mas a
// casa está "acesa e VAZIA" (0 afiliados / 0 dados) e a nossa x-api-key ainda só
// traz Superbet (ver [[boost-external-api-state]]). Para validar a UI multi-casa
// seguindo o MESMO modelo do portal — casa LISTADA mesmo sem dados —, este módulo,
// quando ligado, faz a SportingBet (e qualquer KNOWN_BRANDS) aparecer VAZIA nas
// visões por casa, sem inventar produção falsa.
//   liga com  localStorage.setItem('mockMultiHouse','1')  e recarrega,
//   ou com a env  VITE_MOCK_MULTIHOUSE=1.
// Sem o flag, tudo é no-op (produção intacta: só as casas reais da API).
import { KNOWN_BRANDS } from './brand';

export function mockMultiHouseEnabled(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('mockMultiHouse') === '1') return true;
  } catch { /* ignore */ }
  try {
    return (import.meta as any)?.env?.VITE_MOCK_MULTIHOUSE === '1';
  } catch {
    return false;
  }
}

// Linha de marca ZERADA (casa vazia) no shape do groupBy=brand da API.
const emptyBrandRow = (b: { id?: string; name: string }) => ({
  id: b.id ?? b.name,
  label: b.name,
  registrations: 0,
  first_deposits: 0,
  qualified_cpa: 0,
  rvs: 0,
  deposit: 0,
  cpa: 0,
  total_commission: 0,
});

// Garante que toda casa conhecida apareça nas linhas por casa, VAZIA quando a API
// não trouxe dados dela (modelo do portal OTG). Usado tanto na visão da rede
// (admin) quanto no breakdown por afiliado. No-op sem o flag.
export function withKnownHouses<T>(real: T[]): T[] {
  if (!mockMultiHouseEnabled()) return real;
  const rows = Array.isArray(real) ? [...real] : [];
  const presentIds = new Set(rows.map((r: any) => String(r?.id ?? '').toLowerCase()));
  const presentNames = new Set(rows.map((r: any) => String(r?.label ?? r?.name ?? '').toLowerCase()));
  for (const b of KNOWN_BRANDS) {
    const idKey = String(b.id ?? '').toLowerCase();
    if ((idKey && presentIds.has(idKey)) || presentNames.has(b.name.toLowerCase())) continue;
    rows.push(emptyBrandRow(b) as unknown as T);
  }
  return rows;
}

// Inclui as casas conhecidas no filtro de marca (dropdown) mesmo sem afiliados na
// casa — espelha o portal, que lista a casa vazia. No-op sem o flag.
export function withKnownBrandNames(realNames: string[]): string[] {
  if (!mockMultiHouseEnabled()) return realNames;
  const set = new Set(realNames);
  for (const b of KNOWN_BRANDS) set.add(b.name);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
