// Flag da instância no BUNDLE do cliente (o Vite embute import.meta.env no build).
// Módulo separado do puro `instance.ts` para o server.ts (tsx, sem Vite) nunca
// tocar import.meta.env — importar este arquivo no servidor quebraria o boot.
// O `?.` cobre ambientes de teste sem env definida (→ OTG ligada, retrocompat).
import { otgEnabled, marketplaceEnabled } from './instance';

export const OTG_ENABLED = otgEnabled((import.meta as any).env?.VITE_OTG_ENABLED);
// Marketplace de acordos/parcerias — opt-in por instância (default OFF). Ver instance.ts.
export const MARKETPLACE_ENABLED = marketplaceEnabled((import.meta as any).env?.VITE_MARKETPLACE_ENABLED);
