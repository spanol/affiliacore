---
name: instagram
description: Operar o Instagram da AffiliaCore (@affiliacore.br) pelo Chrome MCP — publicar posts (injeção via canvas, à prova de CSP), editar perfil/bio/foto, checar handles. Use quando o usuário pedir para postar no Instagram, subir criativo, mexer no perfil ou "operar no insta".
---

# Operar o Instagram (@affiliacore.br) via browser

Manual destilado da sessão de lançamento (2026-07-07), em que o perfil foi
populado e o post 1 foi publicado 100% via Chrome MCP. Siga os caminhos que
FUNCIONAM; os becos sem saída estão marcados para você não os re-descobrir.

## Fronteiras (não negociáveis)

- **Criar conta, digitar senha, pagar (Meta Ads)** = ação do operador, nunca sua.
- **Publicar/alterar perfil só com pedido explícito do usuário** na conversa.
- O Chrome é **compartilhado com o usuário**: crie sua própria aba
  (`tabs_create_mcp`), confirme no screenshot que a sessão logada é a
  @affiliacore.br antes de agir, e feche a aba ao terminar.
- Etapa de "informações de contato" (e-mail/telefone públicos): escolha
  **"Não usar minhas informações de contato"** — expor PII é decisão do usuário.

## Fatos da conta

- Handle: **@affiliacore.br** (o `@affiliacore` está OCUPADO por terceiro
  quase inativo; com o INPI registrado dá para reivindicar via formulário de
  marca da Meta).
- Conta **comercial**; categoria ficou "Produto/serviço" (a busca de categoria
  do IG web é QUEBRADA — retorna vazio para qualquer termo; refinar para
  "Empresa de software" só pelo app).
- Campo **Site** da bio NÃO é editável na web (só no app).
- Assets, bio, legendas prontas e cadência dos posts:
  `marketing/affiliacore/CAMPANHA-LANCAMENTO.md` (+ PNGs na mesma pasta).

## O único jeito de subir imagem (à prova de CSP)

Becos sem saída já provados — NÃO tente de novo:
- `file_upload`: não aceita caminho do host.
- `upload_image`: falha com "Unable to access message history".
- `fetch()` no contexto da página (mesmo p/ localhost com CORS): **bloqueado
  pelo CSP do Instagram**.
- Base64 inline no javascript_tool: estoura contexto (~50k tokens p/ 150KB).

O que FUNCIONA: **desenhar a imagem em canvas DENTRO da página** e injetar:

```js
// ...desenhos no canvas c...
const blob = await new Promise(r => c.toBlob(r, 'image/png'));
const file = new File([blob], 'post.png', { type: 'image/png' });
const dt = new DataTransfer(); dt.items.add(file);
const input = [...document.querySelectorAll('input[type=file]')]
  .find(i => (i.accept || '').includes('image'));
input.files = dt.files;
input.dispatchEvent(new Event('change', { bubbles: true }));
```

- PNG passa mesmo quando o input diz `accept="image/jpeg"`.
- **NUNCA clique** em "Selecionar do computador"/"Mudar foto" — abrem o file
  picker NATIVO, que congela a automação. Localize o `input[type=file]`
  escondido com o tool `find`.

### Imagem só-geometria (avatar, glifo)

Desenhe direto com a API 2D (gradiente radial + `arc` + círculo). O glifo
C-núcleo em (cx,cy) com raio externo r: anel = arc de 40° a 320° (gap à
direita), `lineWidth = r*0.328`, `lineCap='round'`, raio médio `r*0.836`;
dot central `r*0.314`. Cores da marca: ember `#e11d48`/`#e45b79`, canvas
plum `#26181c`→`#11070a`, dot branco.

### Criativo com TEXTO (posts da campanha)

Texto vira **curvas** (fontkit) antes — a página não tem as fontes da marca:

1. Gerador: `marketing/affiliacore/generator/gen-post-canvas.mjs`
   (deps: `npm i fontkit @resvg/resvg-js wawoff2` num dir temporário; fontes
   woff2 baixam de `https://cdn.jsdelivr.net/fontsource/fonts/<família>@latest/latin-<peso>-normal.woff2`
   — bricolage-grotesque 500/800, inter 400/600).
2. Edite os textos/posições no gerador e rode: ele emite
   `post1-draw.js` (strings picadas em 800 chars/linha — o Read não trunca) e
   um **PNG de validação local via resvg com os MESMOS paths**. Confira o PNG
   ANTES de injetar (deve ser idêntico ao criativo do kit).
3. Injete em ~5 chamadas `javascript_tool` (limite de tamanho por chamada),
   guardando estado em `window`: 1ª chamada = canvas+gradiente+arcos e
   `window.__pc=c;window.__px=x;` · chamadas 2–4 = cada camada de texto
   (`const x=window.__px;` + `x.fill(new Path2D("..."+"..."))`) · última =
   retângulos finais + `toBlob`→File→DataTransfer→input+change.

## Fluxo de postagem (web)

1. Perfil → sidebar **Criar (+)** → **Postar** → abre o modal "Criar novo post".
2. Injete a imagem (seção acima). O IG pula o crop se a imagem já é 1080×1080
   e cai em `/create/style/` (filtros).
3. **Avançar** (topo direito) → `/create/details/`.
4. Legenda: `find` "caption text area" → `form_input` com o texto completo
   (aceita emoji e multi-linha; legendas prontas no CAMPANHA-LANCAMENTO.md).
5. `find` "Compartilhar" → clique → aguarde o toast **"Sua foto foi postada."**
6. Verifique: navegue ao perfil e confirme o post no grid (screenshot).

## Edição de perfil (web)

- URL: `https://www.instagram.com/accounts/edit/`.
- **Bio**: `find` textarea → `form_input` → **role até o fim** e clique
  **Enviar** (sem isso não salva; o botão esmaece quando salvo).
- **Foto**: injete no `input[type=file]` escondido sob "Mudar foto" (via
  canvas). Aplica na hora, sem submit.
- **Conversão p/ comercial**: `/accounts/convert_to_professional_account/` →
  Comercial → Avançar → categoria (use as sugestões; busca quebrada) →
  Concluir → "Não usar minhas informações de contato".

## Checagem de handle

`instagram.com/<handle>` deslogado da conta-alvo: perfil renderiza = ocupado;
"Esta página não está disponível" = livre.
