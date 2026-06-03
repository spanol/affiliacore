#!/usr/bin/env bash
# PoC-02 — HIGH: VITE_AFFILIATE_API_KEY embarcada no bundle do browser.
# Finding: SECURITY-AUDIT.md -> HIGH · src/services/affiliateService.ts:46
#
# Tudo com prefixo VITE_ é INLINADO no JS estático servido a todos os navegadores.
# Este script PROVA isso buildando com uma chave de teste e fazendo grep no dist/.
#
# Roda 100% LOCAL (vite build). Não toca produção. ~30-60s (tempo do build).
set -u
cd "$(dirname "$0")/../.." || exit 1   # raiz do projeto: D:/code/boost-afiliiados

FAKE_KEY="FAKE_KEY_FOR_TEST_abc123xyz"
echo "=============================================================="
echo " [VULNERÁVEL] build COM VITE_AFFILIATE_API_KEY setada"
echo "=============================================================="
rm -rf dist
VITE_AFFILIATE_API_KEY="$FAKE_KEY" npm run build >/dev/null 2>&1

echo "grep '$FAKE_KEY' dist/ :"
if grep -rE "$FAKE_KEY" dist/ 2>/dev/null | head -5; then
  echo ">>> LEAK CONFIRMADO: a chave aparece em texto claro no bundle. <<<"
else
  echo "(nenhum match — inesperado; o fallback de fetch direto referencia a env)"
fi

echo
echo "=============================================================="
echo " [PATCH] build SEM a env VITE_ (cliente usa só o proxy /api/external)"
echo "=============================================================="
rm -rf dist
npm run build >/dev/null 2>&1
echo "grep '$FAKE_KEY' dist/ :"
if grep -rE "$FAKE_KEY" dist/ 2>/dev/null | head -5; then
  echo "(ainda vaza — env presente no ambiente de build?)"
else
  echo ">>> SEM LEAK: a string da chave não está no bundle. <<<"
fi

echo
echo "NOTA: o patch real é remover o branch de fetch direto + a const"
echo "AFFILIATE_API_KEY de src/services/affiliateService.ts e renomear a env"
echo "para SEM prefixo VITE_ (o server.ts já lê process.env.AFFILIATE_API_KEY)."
