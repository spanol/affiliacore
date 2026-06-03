// PoC-05 — patched-endpoint-demo.mjs
// Demonstra o PATCH: o mesmo endpoint COM rate limit por IP devolve 429 após o
// teto. Mostra o comportamento de `express-rate-limit` sem exigir a dep (limiter
// mínimo equivalente). O patch real usa: app.use('/api/accept-invite', rateLimit({...})).
// Porta 5001.  node .security-pocs/poc-05-medium-no-ratelimit/patched-endpoint-demo.mjs
// Depois: TARGET=http://localhost:5001/api/accept-invite node flood.mjs

import express from 'express';
const app = express();
app.use(express.json({ limit: '32kb' }));

// --- limiter mínimo equivalente a express-rate-limit (janela fixa por IP) ----
const WINDOW_MS = 60_000;
const MAX = 10; // 10 req / min / IP
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || 'local';
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, reset: now + WINDOW_MS };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + WINDOW_MS; }
  rec.count++;
  hits.set(ip, rec);
  if (rec.count > MAX) {
    res.setHeader('Retry-After', Math.ceil((rec.reset - now) / 1000));
    return res.status(429).json({ error: 'Muitas requisições. Tente mais tarde.' });
  }
  next();
}
// -----------------------------------------------------------------------------

app.post('/api/accept-invite', rateLimit, (req, res) => {
  // (lógica real omitida; aqui só provamos o gate de rate limit)
  return res.status(404).json({ error: 'Convite não encontrado.' }); // token inválido
});

app.listen(5001, () => console.log('[patched] http://localhost:5001 (MAX=10/min/IP)'));
