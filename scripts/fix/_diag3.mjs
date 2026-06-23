import 'dotenv/config';
import { readFileSync } from 'fs';
import admin from 'firebase-admin';
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
else { try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./service-account.json','utf8'))) }); } catch { admin.initializeApp(); } }
const db = admin.firestore();
const TARGET='cf3a1255-5388-491c-b86a-8a7214a1346f';
const s = await db.collection('special_affiliates').get();
let foundAsSub=null;
s.forEach(d=>{const subs=d.data().subAffiliateIds||[]; if(subs.includes(TARGET)) foundAsSub=d.id;});
console.log('cf3a1255 aparece como subAffiliateId de:', foundAsSub||'(ninguém)');
// affiliate_configs do Carlos?
const cfg = await db.collection('affiliate_configs').doc(TARGET).get();
console.log('affiliate_configs/cf3a1255 existe?', cfg.exists, cfg.exists?JSON.stringify(cfg.data()):'');
// special_affiliates/cf3a1255 existe?
const sp = await db.collection('special_affiliates').doc(TARGET).get();
console.log('special_affiliates/cf3a1255 existe?', sp.exists);
process.exit(0);
