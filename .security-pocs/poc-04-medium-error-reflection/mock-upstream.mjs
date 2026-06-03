// PoC-04 — mock-upstream.mjs
// Simula a API de parceiros (partnersotg) retornando um ERRO 400 cujo corpo
// contém detalhes INTERNOS que não deveriam vazar ao cliente.
// Porta 4567.  node .security-pocs/poc-04-medium-error-reflection/mock-upstream.mjs

import express from 'express';
const app = express();

// Qualquer rota /api/v2/external/* responde 400 com "vazamento" interno.
app.get('/api/v2/external/:endpoint/:id?', (req, res) => {
  console.log(`[mock-upstream] hit ${req.originalUrl}`);
  res.status(400).json({
    code: 'UPSTREAM_VALIDATION_ERR',
    message: 'Invalid affiliateIds parameter',
    details: {
      internal_query: "SELECT * FROM partner_secret_table WHERE api_client='boost' AND tier='gold'",
      api_version: 'v3.beta-internal',
      upstream_host: 'pg-primary-01.partnersotg.internal:5432',
      echoed_api_key_hint: 'x-api-key starts with sk_live_PARTNER_...',
      stack: 'at ResultsController.validate (/srv/partners/src/results.js:88:13)',
    },
  });
});

app.listen(4567, () => console.log('[mock-upstream] listening on http://localhost:4567'));
