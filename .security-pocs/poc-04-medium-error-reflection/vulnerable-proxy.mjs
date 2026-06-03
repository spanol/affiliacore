// PoC-04 — vulnerable-proxy.mjs
// Réplica FIEL do trecho de tratamento de erro do proxy real (server.ts:638-654),
// isolada para PoC (sem Firebase Admin/auth). A lógica de reflexão de erro é
// IDÊNTICA à de produção. Porta 5000, rota GET /api/external/:endpoint/:id?.
//
// Alterne o modo VULNERÁVEL/PATCHED via env PATCHED=1.
//   node .security-pocs/poc-04-medium-error-reflection/vulnerable-proxy.mjs
//   PATCHED=1 node .security-pocs/poc-04-medium-error-reflection/vulnerable-proxy.mjs

import express from 'express';
const app = express();

const BASE_URL = process.env.VITE_AFFILIATE_API_BASE_URL || 'http://localhost:4567';
const PATCHED = process.env.PATCHED === '1';

// (Em produção há requireAuth aqui; omitido na PoC — não muda o comportamento do leak.)
app.get('/api/external/:endpoint/:id?', async (req, res) => {
  try {
    const { endpoint, id } = req.params;
    const targetUrl = `${BASE_URL}/api/v2/external/${endpoint}${id ? '/' + id : ''}`;
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'x-api-key': 'sk_live_PARTNER_fake', 'Accept': 'application/json' },
    });

    const responseText = await response.text();
    let responseBody = null;
    try { responseBody = responseText ? JSON.parse(responseText) : null; } catch { responseBody = null; }

    if (!response.ok) {
      if (PATCHED) {
        // PATCH sugerido: logar server-side, devolver erro genérico + requestId.
        const requestId = 'req_' + Math.abs(hashCode(targetUrl + response.status));
        console.error(`[proxy] upstream ${response.status} for ${endpoint} reqId=${requestId}:`, responseText);
        return res.status(502).json({ error: 'Erro ao consultar a API externa.', requestId });
      }
      // VULNERÁVEL (server.ts:638-644): reflete corpo bruto do upstream.
      return res.status(response.status).json({
        error: `Erro na API Externa (${endpoint}): ${response.status}`,
        code: responseBody?.code || responseBody?.errorCode,
        message: responseBody?.message || responseBody?.error || response.statusText,
        details: responseBody?.details || responseBody || responseText,
      });
    }
    return res.json(responseBody);
  } catch (e) {
    res.status(500).json({ error: 'proxy error', message: String(e) });
  }
});

function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i) | 0; } return h; }

app.listen(5000, () => console.log(`[proxy] listening on http://localhost:5000 (PATCHED=${PATCHED})`));
