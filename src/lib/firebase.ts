import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import appletConfig from '../../firebase-applet-config.json';
import { resolveFirebaseConfig } from './firebaseConfig';

// P4 (produtização): cada instância (App Hosting) builda com a config do PRÓPRIO
// projeto via __FIREBASE_WEBAPP_CONFIG__ (define do vite.config); o JSON commitado
// é só o fallback de dev/AI Studio. `typeof` guarda ambientes sem o define (vitest).
const firebaseConfig = resolveFirebaseConfig(
  typeof __FIREBASE_WEBAPP_CONFIG__ !== 'undefined' ? __FIREBASE_WEBAPP_CONFIG__ : '',
  appletConfig as Record<string, unknown>,
);

const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Standardized Firestore Error Handler
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  
  // SECURITY (LOW): logamos o detalhe (com PII do próprio usuário) só no console
  // para diagnóstico, mas NÃO embutimos PII na mensagem do Error relançado — ele
  // pode acabar exibido na UI (Register/Profile mostram `err.message`).
  console.error('Firestore Error Detailed: ', errInfo);

  if (error instanceof Error && (error.message.includes('permission-denied') || error.message.includes('insufficient permissions'))) {
    throw new Error('Sem permissão para concluir esta operação. Verifique seu acesso e tente novamente.');
  }

  throw error;
}
