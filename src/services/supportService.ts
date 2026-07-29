import { authFetch } from '../lib/api';
import { SUPPORT_CONTACT_EMPTY, type SupportContact, type SupportContactInput } from '../lib/supportContact';

// Contato de suporte da instância (aba Suporte → WhatsApp do operador). Mora em
// `settings/support_contact`, e `settings` é admin-only nas rules — por isso o
// afiliado lê pelo endpoint autenticado, nunca direto do Firestore.

export async function fetchSupportContact(): Promise<SupportContact> {
  try {
    const res = await authFetch('/api/support-contact', { headers: { Accept: 'application/json' } });
    if (!res.ok) return SUPPORT_CONTACT_EMPTY;
    const data = await res.json();
    return (data?.contact as SupportContact) ?? SUPPORT_CONTACT_EMPTY;
  } catch (error) {
    console.error('Error fetching support contact:', error);
    return SUPPORT_CONTACT_EMPTY;
  }
}

export async function saveSupportContact(input: SupportContactInput): Promise<SupportContact> {
  const res = await authFetch('/api/support-contact', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let message = 'Falha ao salvar o contato de suporte.';
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(message);
  }
  const data = await res.json();
  return (data?.contact as SupportContact) ?? SUPPORT_CONTACT_EMPTY;
}
