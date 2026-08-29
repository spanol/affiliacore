// Flag da instância no BUNDLE do cliente (o Vite embute import.meta.env no build).
// Módulo separado do puro `instance.ts` para o server.ts (tsx, sem Vite) nunca
// tocar import.meta.env — importar este arquivo no servidor quebraria o boot.
// O `?.` cobre ambientes de teste sem env definida (→ OTG ligada, retrocompat).
import { otgEnabled, marketplaceEnabled, revEnabled, topRateEditorEnabled } from './instance';
import { resolveDealType } from './dealType';

export const OTG_ENABLED = otgEnabled((import.meta as any).env?.VITE_OTG_ENABLED);
// REV Share nas telas de resultado do afiliado/gerente — default LIGADO. Ver instance.ts.
export const REV_ENABLED = revEnabled((import.meta as any).env?.VITE_REV_ENABLED);
// Marketplace de acordos/parcerias — opt-in por instância (default OFF). Ver instance.ts.
export const MARKETPLACE_ENABLED = marketplaceEnabled((import.meta as any).env?.VITE_MARKETPLACE_ENABLED);
// Editor inline da taxa de TOPO em /afiliados — default LIGADO. Ver instance.ts.
export const TOP_RATE_EDITOR_ENABLED = topRateEditorEnabled((import.meta as any).env?.VITE_TOP_RATE_EDITOR_ENABLED);
// Tipo de acordo pré-marcado no /acordos. Ausente = 'direto', que é o comportamento
// de sempre; a MESMA env já carimba o rascunho criado junto com a casa no servidor
// (server.ts, DEAL_TYPE_DEFAULT). Ver PLANO-TIPOS-DE-DEAL.md §1.
export const DEAL_TYPE_DEFAULT = resolveDealType((import.meta as any).env?.VITE_DEAL_TYPE_DEFAULT);
