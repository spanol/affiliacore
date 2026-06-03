# Dev-dependencies adicionais para rodar as PoCs

As PoCs usam o **Firebase Emulator** + a lib oficial de teste de rules. Nenhuma
delas toca a produção `agencia-boost-app`.

## Instalar (uma vez)

```bash
cd D:/code/boost-afiliiados

# Lib oficial do Firebase para testar firestore.rules contra o emulator
npm i -D @firebase/rules-unit-testing

# CLI do Firebase (se ainda não tiver) — fornece o emulator
npm i -D firebase-tools
# (ou global): npm i -g firebase-tools
```

`firebase-admin`, `firebase`, `express`, `vitest` e `@testing-library/*` **já estão**
no `package.json` do projeto — reaproveitamos.

## Versões alvo (compatíveis com o stack atual)

| Pacote | Versão sugerida | Por quê |
|---|---|---|
| `@firebase/rules-unit-testing` | `^4.0.1` | Casa com `firebase@^12` (SDK modular v9+ API) |
| `firebase-tools` | `^13.x` ou superior | Fornece `firebase emulators:start` |

## Checagem rápida

```bash
npx firebase --version          # deve imprimir uma versão
node -e "require('@firebase/rules-unit-testing'); console.log('rules-unit-testing OK')"
```

> Observação: o projeto usa `"type": "module"`. Os scripts `.mjs` já são ESM;
> os specs `.spec.ts` rodam via `vitest` (que o projeto já tem).
