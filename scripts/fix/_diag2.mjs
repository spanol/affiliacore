import 'dotenv/config';
import { readFileSync } from 'fs';
import admin from 'firebase-admin';
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
else { try { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./service-account.json','utf8'))) }); } catch { admin.initializeApp(); } }
const db = admin.firestore();
const s = await db.collection('special_affiliates').get();
s.forEach(d=>console.log(d.id, JSON.stringify(d.data())));
process.exit(0);
