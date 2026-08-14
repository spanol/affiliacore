// Contato de suporte da instância (aba "Suporte" → WhatsApp do operador da label).
// A plataforma legada tinha chat próprio; aqui o suporte é um deep link para o
// WhatsApp cadastrado pelo operador — sem infra de mensageria.
//
// Núcleo PURO (sem Firebase): compartilhado entre a rota /api/support-contact do
// servidor (saneamento) e o form do admin + a sidebar (montagem do link), mesma
// regra de commission.ts (o server só importa de src/lib).

export interface SupportContactInput {
  phone?: string; // telefone em qualquer formato digitado; guardamos só os dígitos
  message?: string; // mensagem pré-preenchida no WhatsApp (opcional)
  label?: string; // rótulo do item na sidebar (default "Suporte")
  active?: boolean; // desligado = o item some da sidebar
}

export interface SupportContact extends SupportContactInput {
  active: boolean;
}

export const SUPPORT_MESSAGE_MAX = 300;
export const SUPPORT_LABEL_MAX = 24;
export const SUPPORT_LABEL_DEFAULT = 'Suporte';

const PHONE_ERROR =
  'Telefone inválido. Informe o WhatsApp com DDD (ex.: (11) 98888-7777) ou com o código do país.';

export interface SupportSanitizeResult {
  ok: boolean;
  value?: { phone: string; message: string; label: string; active: boolean };
  error?: string;
}

// Normaliza para o formato que o wa.me exige: só dígitos, com código do país.
// Número BR digitado sem o 55 (o caso comum: "11988887777") recebe o 55; quem
// digitar com DDI — inclusive um número estrangeiro — é preservado como veio.
// Devolve '' para entrada vazia (= desligar o contato) e null para inválido.
export function normalizeWhatsappPhone(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  // 10 = fixo com DDD, 11 = celular com DDD (9º dígito).
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  // Com DDI: 12–15 dígitos (E.164 permite até 15).
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

export function sanitizeSupportContact(body: unknown): SupportSanitizeResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const phone = normalizeWhatsappPhone(b.phone);
  if (phone == null) return { ok: false, error: PHONE_ERROR };
  const message = String(b.message ?? '').trim().slice(0, SUPPORT_MESSAGE_MAX);
  const label = String(b.label ?? '').trim().slice(0, SUPPORT_LABEL_MAX) || SUPPORT_LABEL_DEFAULT;
  // Sem telefone não há para onde levar: o contato fica desligado, mesmo que o
  // form mande active:true.
  const active = phone ? (b.active === undefined ? true : !!b.active) : false;
  return { ok: true, value: { phone, message, label, active } };
}

// URL do deep link. Devolve '' quando não há contato utilizável — a sidebar usa
// isso para decidir se mostra o item (não renderize um link para lugar nenhum).
export function buildWhatsappUrl(contact?: SupportContact | null): string {
  if (!contact || !contact.active) return '';
  const phone = String(contact.phone ?? '').replace(/\D/g, '');
  if (!phone) return '';
  const message = String(contact.message ?? '').trim();
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${phone}${query}`;
}

// Exibição pt-BR do número guardado ("5511988887777" → "+55 (11) 98888-7777").
// Número fora do padrão BR é devolvido só com o "+" para não inventar formato.
export function formatSupportPhone(phone?: string | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    const head = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
    const tail = rest.length === 9 ? rest.slice(5) : rest.slice(4);
    return `+55 (${ddd}) ${head}-${tail}`;
  }
  return `+${digits}`;
}

export const SUPPORT_CONTACT_EMPTY: SupportContact = {
  phone: '',
  message: '',
  label: SUPPORT_LABEL_DEFAULT,
  active: false,
};
