# Adicionar os emulators ao `firebase.json`

O `firebase.json` atual do projeto é mínimo:

```json
{
  "firestore": {
    "rules": "firestore.rules"
  }
}
```

Para rodar as PoCs **localmente** (sem tocar produção), substitua por:

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "ui": {
      "enabled": true,
      "port": 4000
    },
    "singleProjectMode": true
  }
}
```

> **NÃO commite essa mudança** se o projeto não quiser emulators no repo. Use uma
> cópia local, ou um arquivo separado `firebase.emulators.json` e rode:
> `firebase emulators:start --config firebase.emulators.json --only auth,firestore`

## Subir os emulators

```bash
cd D:/code/boost-afiliiados

# Usa um projectId FICTÍCIO (demo-*) — o prefixo "demo-" garante que o SDK
# NUNCA fala com a nuvem real, mesmo se as credenciais estiverem no ambiente.
firebase emulators:start --only auth,firestore --project demo-boost
```

Saída esperada:

```
✔  firestore: Firestore Emulator listening at 127.0.0.1:8080
✔  auth: Authentication Emulator listening at 127.0.0.1:9099
✔  All emulators ready! View status at http://127.0.0.1:4000
```

## Variáveis de ambiente que os scripts esperam

Os scripts `.mjs` das PoCs leem estes hosts (já têm default):

```bash
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export GCLOUD_PROJECT="demo-boost"
```

Quando `FIRESTORE_EMULATOR_HOST` está setado, o `firebase-admin` e o SDK web
roteiam **automaticamente** para o emulator. É a salvaguarda nº1 contra tocar
produção.
