import 'dotenv/config';
import { readFileSync } from 'fs';
import admin from 'firebase-admin';
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
} else {
  try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./service-account.json','utf8'))) }); }
  catch { admin.initializeApp(); }
}
const db = admin.firestore();
const s = await db.collection('special_affiliates').get();
console.log('special_affiliates ('+s.size+'):');
s.forEach(d=>{const x=d.data();console.log('  id='+d.id+' | name='+(x.name||x.displayName||'?')+' | active='+x.active+' | affiliateId='+(x.affiliateId||'-'));});
console.log('\nlogins CarlosMarcos:');
const u = await db.collection('users').get();
u.forEach(d=>{const x=d.data(); if(String(x.name||'').toLowerCase().includes('carlosmarcos')) console.log('  uid='+d.id+' | name='+x.name+' | email='+x.email+' | role='+x.role+' | affiliateId='+x.affiliateId+' | isSpecial='+x.isSpecial);});
process.exit(0);
