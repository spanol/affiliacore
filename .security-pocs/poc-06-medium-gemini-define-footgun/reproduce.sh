#!/usr/bin/env bash
# PoC-06 — reproduce.sh
# Prova que o `define` da GEMINI_API_KEY no vite.config.ts faz a chave VAZAR no
# bundle assim que QUALQUER código do cliente referenciar process.env.GEMINI_API_KEY.
# Finding: vite.config.ts:10-12 (CWE-522, footgun latente).
#
# O script: aplica plant.diff -> build com chave fake -> grep dist/ -> REVERTE.
# 100% local. ~1-2 min (build).  bash .security-pocs/poc-06-medium-gemini-define-footgun/reproduce.sh
set -u
cd "$(dirname "$0")/../.." || exit 1   # raiz do projeto
DIFF=".security-pocs/poc-06-medium-gemini-define-footgun/plant.diff"
FAKE_KEY="AIzaSyDoTestFakeKeyABCDEF123"

cleanup() {
  echo
  echo "→ Revertendo plant.diff (restaurando src/main.tsx)..."
  git apply -R "$DIFF" 2>/dev/null && echo "  ✓ revertido" || \
    echo "  ⚠ reverta manualmente: git checkout -- src/main.tsx"
}
trap cleanup EXIT

echo "=============================================================="
echo " [FOOTGUN] aplica plant.diff e builda com GEMINI_API_KEY setada"
echo "=============================================================="
git apply "$DIFF" || { echo "✖ git apply falhou (working tree suja?)"; exit 1; }

rm -rf dist
GEMINI_API_KEY="$FAKE_KEY" npm run build >/dev/null 2>&1

echo "grep '$FAKE_KEY' dist/ :"
if grep -rE "$FAKE_KEY" dist/ 2>/dev/null | head -5; then
  echo ">>> LEAK CONFIRMADO: a chave Gemini foi inlinada no bundle pelo define. <<<"
else
  echo "(sem match — verifique se @google/genai está instalado e o build ok)"
fi

echo
echo "PATCH: remova o bloco `define` do vite.config.ts e mova toda chamada Gemini"
echo "para o backend (server.ts, process.env.GEMINI_API_KEY lido em runtime no servidor)."
echo "Com o define removido, mesmo a linha plantada não consegue inlinar a chave."
# cleanup() roda no EXIT e reverte o diff.
