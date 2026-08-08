import { authFetch } from '../lib/api';
import { SHOWCASE_EMPTY, type ShowcaseConfig, type ShowcaseInput } from '../lib/showcase';

// Vitrine AffiliaCore (opt-in da agência na LP do produto). A config mora em
// `settings/showcase`, e `settings` é admin-only nas rules — o editor do admin
// fala com os endpoints do servidor (mesmo padrão do supportService).

export async function fetchShowcaseConfig(): Promise<ShowcaseConfig> {
  try {
    const res = await authFetch('/api/showcase-config', { headers: { Accept: 'application/json' } });
    if (!res.ok) return SHOWCASE_EMPTY;
    const data = await res.json();
    return (data?.showcase as ShowcaseConfig) ?? SHOWCASE_EMPTY;
  } catch (error) {
    console.error('Error fetching showcase config:', error);
    return SHOWCASE_EMPTY;
  }
}

export async function saveShowcaseConfig(input: ShowcaseInput): Promise<ShowcaseConfig> {
  const res = await authFetch('/api/showcase-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let message = 'Falha ao salvar a vitrine.';
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(message);
  }
  const data = await res.json();
  return (data?.showcase as ShowcaseConfig) ?? SHOWCASE_EMPTY;
}
