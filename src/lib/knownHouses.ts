// Casas conhecidas SEMPRE listadas (modelo do portal OTG): a casa aparece
// "acesa e VAZIA" (0 dados) mesmo quando a API não traz produção dela. A OTG já
// LISTA a SportingBet pra agência sem dados, e replicamos isso — a x-api-key
// ainda só traz Superbet com produção (ver [[boost-external-api-state]]).
// Importante: aqui só ZERAMOS casas faltantes; nunca inventamos produção falsa —
// as casas reais da API entram com seus números, as demais entram zeradas.
import { getKnownBrands } from './brand';
import { OTG_ENABLED } from './instanceClient';

// Só casas ATIVAS aparecem "acesas e vazias" (uma casa desativada no backoffice
// some das visões por casa, mas getBrandMeta ainda a resolve p/ dados históricos).
// P2 (produtização): numa instância OTG-free NÃO espelhamos o portal OTG — as
// casas-semente Superbet/SportingBet são `dataSource:'otg'` e apareceriam
// "fantasma" no dashboard/filtro mesmo sem estar em /casas (o auto-seed de /casas
// já é OTG-gated no server, server.ts). Com OTG desligada, só entram casas
// conhecidas NÃO-otg (ex.: casas manuais promovidas a conhecidas via setKnownBrands).
const activeKnownBrands = () =>
  getKnownBrands().filter((b) => b.active !== false && (OTG_ENABLED || b.dataSource !== 'otg'));

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
// (admin) quanto no breakdown por afiliado.
export function withKnownHouses<T>(real: T[]): T[] {
  const rows = Array.isArray(real) ? [...real] : [];
  const presentIds = new Set(rows.map((r: any) => String(r?.id ?? '').toLowerCase()));
  const presentNames = new Set(rows.map((r: any) => String(r?.label ?? r?.name ?? '').toLowerCase()));
  for (const b of activeKnownBrands()) {
    const idKey = String(b.id ?? '').toLowerCase();
    if ((idKey && presentIds.has(idKey)) || presentNames.has(b.name.toLowerCase())) continue;
    rows.push(emptyBrandRow(b) as unknown as T);
  }
  return rows;
}

// Inclui as casas conhecidas no filtro de marca (dropdown) mesmo sem afiliados na
// casa — espelha o portal, que lista a casa vazia.
export function withKnownBrandNames(realNames: string[]): string[] {
  const set = new Set(realNames);
  for (const b of activeKnownBrands()) set.add(b.name);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
