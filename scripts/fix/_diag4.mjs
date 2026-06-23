import 'dotenv/config';
import { readFileSync } from 'fs';
import admin from 'firebase-admin';
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
else { try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./service-account.json','utf8'))) }); } catch { admin.initializeApp(); } }
const db = admin.firestore();
const specials=['5041a616-3696-48f7-8499-0877c99f3178','69753208-45c5-4771-8b0a-3a9998124c26','85c31899-260e-4b89-af22-d74e4f30beb9','8a581857-0779-45c2-9f15-70077020c33c','9ade9760-ec71-43de-ab2e-9a01cc7f7de7','af7b9c72-b027-4c62-b207-112bc5b58b56','e320d0a0-7a65-4f18-a7ee-834c90975657'];
const TARGET='cf3a1255-5388-491c-b86a-8a7214a1346f';
console.log('Nomes dos affiliates (coleção affiliates):');
for (const id of [...specials, TARGET]) {
  const d = await db.collection('affiliates').doc(id).get();
  const x = d.exists?d.data():null;
  console.log('  '+id+' -> '+(x?(x.name||x.label||x.fullName||JSON.stringify(Object.keys(x))):'(sem doc em affiliates)'));
}
process.exit(0);
