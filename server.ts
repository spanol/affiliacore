import 'dotenv/config';
import express from 'express';
import admin from 'firebase-admin';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let adminApp: admin.app.App | null = null;
let adminDb: admin.firestore.Firestore | null = null;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    adminApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    adminApp = admin.initializeApp();
  }
  adminDb = adminApp.firestore();
  console.log('Firebase Admin initialized');
} catch (error) {
  console.error('Firebase Admin initialization failed:', error);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  const serializeTimestamp = (value: any) => {
    if (value?.toDate && typeof value.toDate === 'function') {
      return value.toDate().toISOString();
    }
    return value ?? null;
  };

  app.post('/api/create-user', async (req, res) => {
    if (!adminApp || !adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }

    try {
      const { name, email, password, role, affiliateId, mustChangePassword } = req.body;
      if (!email || !password || !name || !role) {
        return res.status(400).json({ error: 'Dados incompletos para criar usuário.' });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const normalizedName = String(name).trim();
      const normalizedRole = String(role);
      let userRecord: admin.auth.UserRecord;

      try {
        userRecord = await adminApp.auth().createUser({
          email: normalizedEmail,
          password: String(password),
          displayName: normalizedName,
        });
      } catch (error: any) {
        if (error.code === 'auth/email-already-exists') {
          userRecord = await adminApp.auth().getUserByEmail(normalizedEmail);
        } else {
          throw error;
        }
      }

      const userDoc = adminDb.collection('users').doc(userRecord.uid);
      await userDoc.set({
        uid: userRecord.uid,
        name: normalizedName,
        email: normalizedEmail,
        role: normalizedRole,
        affiliateId: affiliateId ? String(affiliateId) : null,
        mustChangePassword: !!mustChangePassword,
        avatarUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(normalizedName)}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return res.json({ uid: userRecord.uid });
    } catch (error: any) {
      console.error('Error creating auth user:', error);
      return res.status(500).json({ error: error.message || 'Erro interno criando usuário.' });
    }
  });

  app.get('/api/affiliate-statuses', async (_req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }

    try {
      const snapshot = await adminDb.collection('affiliate_statuses').get();
      const statuses = snapshot.docs.reduce<Record<string, { status: string; updatedAt: string | null }>>((acc, item) => {
        const data = item.data();
        acc[item.id] = {
          status: data.status || 'inactive',
          updatedAt: serializeTimestamp(data.updatedAt)
        };
        return acc;
      }, {});

      return res.json(statuses);
    } catch (error: any) {
      console.error('Error fetching affiliate statuses:', error);
      return res.status(500).json({ error: error.message || 'Erro interno listando status.' });
    }
  });

  app.patch('/api/affiliates/:affiliateId', async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }

    try {
      const { affiliateId } = req.params;
      const { status } = req.body ?? {};

      if (!affiliateId) {
        return res.status(400).json({ error: 'affiliateId é obrigatório.' });
      }

      if (status !== 'active' && status !== 'inactive') {
        return res.status(400).json({ error: 'Status inválido. Use active ou inactive.' });
      }

      await adminDb.collection('affiliate_statuses').doc(String(affiliateId)).set({
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return res.json({ affiliateId, status });
    } catch (error: any) {
      console.error('Error updating affiliate status:', error);
      return res.status(500).json({ error: error.message || 'Erro interno atualizando status.' });
    }
  });

  app.get('/api/audit-logs', async (_req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }

    try {
      const snapshot = await adminDb
        .collection('audit_logs')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();

      const logs = snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          ...data,
          createdAt: serializeTimestamp(data.createdAt),
          updatedAt: serializeTimestamp(data.updatedAt)
        };
      });

      return res.json(logs);
    } catch (error: any) {
      console.error('Error fetching audit logs:', error);
      return res.status(500).json({ error: error.message || 'Erro interno listando logs.' });
    }
  });

  app.post('/api/audit-logs', async (req, res) => {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firebase Admin não está inicializado.' });
    }

    try {
      const { affiliateId, actorId, actorName, action, reason } = req.body ?? {};

      if (!affiliateId || !action) {
        return res.status(400).json({ error: 'affiliateId e action são obrigatórios.' });
      }

      const payload = {
        affiliateId: String(affiliateId),
        actorId: actorId ? String(actorId) : null,
        actorName: actorName ? String(actorName) : null,
        action: String(action),
        reason: reason ? String(reason) : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const docRef = await adminDb.collection('audit_logs').add(payload);

      return res.status(201).json({
        id: docRef.id,
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error creating audit log:', error);
      return res.status(500).json({ error: error.message || 'Erro interno criando log.' });
    }
  });

  // Proxy route for Affiliate API to handle multiple endpoints dynamically
  app.get('/api/external/:endpoint/:id?', async (req, res) => {
    try {
      const { endpoint, id } = req.params;
      const BASE_URL = process.env.VITE_AFFILIATE_API_BASE_URL || 'https://affiliate-api-prd.partnersotg.com';
      const apiKey = process.env.VITE_AFFILIATE_API_KEY || process.env.AFFILIATE_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: 'Chave de API não configurada' });
      }

      const queryString = new URLSearchParams(req.query as any).toString();
      const targetUrl = id 
        ? `${BASE_URL}/api/v2/external/${endpoint}/${id}${queryString ? '?' + queryString : ''}`
        : `${BASE_URL}/api/v2/external/${endpoint}${queryString ? '?' + queryString : ''}`;
        
      console.log(`Proxying request to: ${targetUrl}`);
      
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json',
          'User-Agent': 'AgenciaBoost-App/1.0',
        },
      });

      const responseText = await response.text();
      let responseBody: any = null;
      try {
        responseBody = responseText ? JSON.parse(responseText) : null;
      } catch {
        responseBody = null;
      }

      if (!response.ok) {
        return res.status(response.status).json({ 
          error: `Erro na API Externa (${endpoint}): ${response.status}`,
          code: responseBody?.code || responseBody?.errorCode,
          message: responseBody?.message || responseBody?.error || response.statusText,
          details: responseBody?.details || responseBody || responseText
        });
      }

      if (responseBody !== null) {
        return res.json(responseBody);
      }

      return res.status(502).json({
        error: `Resposta inválida da API Externa (${endpoint})`,
        details: responseText
      });
    } catch (error) {
      console.error('Proxy Exception:', error);
      res.status(500).json({ 
        error: 'Erro interno no servidor proxy', 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
