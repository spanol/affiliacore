import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs,
  query,
  where,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Affiliate {
  id: string;
  name: string;
  email: string;
  status: string;
  brand?: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export interface AffiliateConfig {
  affiliateId: string;
  cpaValue: number;
  revPercentage: number;
  updatedAt?: any;
}

interface ApiErrorInfo {
  code?: string;
  message: string;
  noData: boolean;
}

const AFFILIATE_API_BASE_URL = (import.meta.env.VITE_AFFILIATE_API_BASE_URL || 'https://affiliate-api-prd.partnersotg.com').replace(/\/+$/, '');
const AFFILIATE_API_KEY = import.meta.env.VITE_AFFILIATE_API_KEY || '';

async function fetchAffiliateApi(endpoint: string, query?: URLSearchParams): Promise<Response> {
  const proxyUrl = `/api/external/${endpoint}${query && query.toString() ? `?${query.toString()}` : ''}`;
  const proxyResponse = await fetch(proxyUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (proxyResponse.status !== 404) {
    return proxyResponse;
  }

  console.warn(`Proxy route unavailable for ${endpoint}, retrying against external affiliate API directly.`);

  if (!AFFILIATE_API_KEY) {
    return proxyResponse;
  }

  const directUrl = `${AFFILIATE_API_BASE_URL}/api/v2/external/${endpoint}${query && query.toString() ? `?${query.toString()}` : ''}`;
  return fetch(directUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'x-api-key': AFFILIATE_API_KEY,
    },
  });
}

export async function fetchAffiliateConfigs(): Promise<Record<string, AffiliateConfig>> {
  try {
    const querySnapshot = await getDocs(collection(db, 'affiliate_configs'));
    const configs: Record<string, AffiliateConfig> = {};
    querySnapshot.forEach((doc) => {
      configs[doc.id] = doc.data() as AffiliateConfig;
    });
    return configs;
  } catch (error) {
    console.error('Error fetching affiliate configs:', error);
    return {};
  }
}

export async function saveAffiliateConfig(config: AffiliateConfig): Promise<void> {
  try {
    const docRef = doc(db, 'affiliate_configs', config.affiliateId);
    await setDoc(docRef, {
      ...config,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error saving affiliate config:', error);
    throw error;
  }
}

export async function fetchAffiliates(): Promise<Affiliate[]> {
  try {
    console.log('Fetching affiliates from affiliate API...');
    const response = await fetchAffiliateApi('affiliates');

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Erro na API: ${response.status}`);
    }

    const data = await response.json();
    const apiError = extractApiError(data);
    if (apiError) {
      if (apiError.noData) {
        console.warn(`Affiliate API returned no data (${apiError.code || 'no-code'}): ${apiError.message}`);
        return [];
      }
      throw new Error(apiError.message);
    }

    console.log('API Response received');
    return extractArray(data);
  } catch (error) {
    console.error('Affiliate fetch error:', error);
    throw error;
  }
}

export async function fetchAffiliateById(id: string): Promise<any> {
  try {
    const response = await fetchAffiliateApi(`affiliates/${id}`);

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Affiliate ${id} not found via direct endpoint, falling back to list lookup...`);
        const allAffiliates = await fetchAffiliates();
        const found = allAffiliates.find((a: any) => (a.id || a._id) === id);
        if (found) return found;
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Erro na API: ${response.status}`);
    }

    const data = await response.json();
    const apiError = extractApiError(data);
    if (apiError) {
      if (apiError.noData) {
        const allAffiliates = await fetchAffiliates();
        const found = allAffiliates.find((a: any) => String(a.id || a._id) === id);
        if (found) return found;
        return null;
      }
      throw new Error(apiError.message);
    }

    return data.data || data;
  } catch (error) {
    console.error(`Error fetching affiliate ${id}:`, error);
    // Even if it's another error, try fallback one last time
    try {
      const allAffiliates = await fetchAffiliates();
      const found = allAffiliates.find((a: any) => (a.id || a._id) === id);
      if (found) return found;
    } catch (fallbackError) {
      console.error('Fallback lookup failed too:', fallbackError);
    }
    throw error;
  }
}

export async function fetchAffiliateResults(id: string): Promise<any> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const params = new URLSearchParams({
      startDate: '2024-01-01',
      endDate: today,
      groupBy: 'affiliate',
      affiliateIds: id
    });

    const response = await fetchAffiliateApi('results', params);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Erro na API: ${response.status}`);
    }

    const data = await response.json();
    const apiError = extractApiError(data);
    if (apiError) {
      if (apiError.noData) {
        return [];
      }
      throw new Error(apiError.message);
    }

    // The response structure for results is { data: { data: [...] } }
    if (data.data && Array.isArray(data.data.data)) {
      return data.data.data;
    }
    return data.data || data;
  } catch (error) {
    console.error(`Error fetching results for affiliate ${id}:`, error);
    throw error;
  }
}

export async function fetchAllResults(): Promise<any[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const params = new URLSearchParams({
      startDate: '2024-01-01',
      endDate: today,
      groupBy: 'affiliate'
    });

    const response = await fetchAffiliateApi('results', params);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Erro na API: ${response.status}`);
    }

    const data = await response.json();
    const apiError = extractApiError(data);
    if (apiError) {
      if (apiError.noData) {
        return [];
      }
      throw new Error(apiError.message);
    }
    
    if (data.data && Array.isArray(data.data.data)) {
      return data.data.data;
    }
    return Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error fetching all results:', error);
    throw error;
  }
}

export async function updateAffiliateStatus(affiliateId: string, status: 'active' | 'inactive'): Promise<any> {
  try {
    const response = await fetch(`/api/affiliates/${affiliateId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Erro na API: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error updating affiliate ${affiliateId} status:`, error);
    throw error;
  }
}

export interface AuditLog {
  id?: string;
  affiliateId: string;
  actorId?: string;
  actorName?: string;
  action: string;
  reason?: string;
  createdAt?: any;
}

export async function createAuditLog(log: AuditLog): Promise<AuditLog> {
  try {
    const response = await fetch('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(log)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Erro na API: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating audit log:', error);
    throw error;
  }
}

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  try {
    const response = await fetch('/api/audit-logs', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Erro na API: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : (data.data || []);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    throw error;
  }
}

export async function fetchRegisteredUsers(): Promise<Array<{ uid: string; affiliateId?: string; name?: string; email?: string; role?: string }>> {
  try {
    const q = query(collection(db, 'users'));
    const snapshot = await getDocs(q);
    const users: Array<{ uid: string; affiliateId?: string; name?: string; email?: string; role?: string }> = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      users.push({ uid: docSnap.id, affiliateId: data.affiliateId, name: data.name, email: data.email, role: data.role });
    });
    return users;
  } catch (err) {
    console.error('Error fetching registered users:', err);
    return [];
  }
}

export async function updateUserRole(uid: string, role: 'admin' | 'client'): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, { role, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error('Error updating user role:', err);
    throw err;
  }
}

export async function isUserRegistered(uidOrAffiliateId: string): Promise<boolean> {
  try {
    const normalizedId = String(uidOrAffiliateId);
    const docRef = doc(db, 'users', normalizedId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return true;
    }

    const affiliateQuery = query(collection(db, 'users'), where('affiliateId', '==', normalizedId));
    const affiliateSnapshot = await getDocs(affiliateQuery);
    return !affiliateSnapshot.empty;
  } catch (err) {
    console.error('Error checking user registration:', err);
    return false;
  }
}

export interface AffiliateUserData {
  uid?: string;
  affiliateId?: string;
  name: string;
  email: string;
  role: 'admin' | 'client';
  password?: string;
  mustChangePassword?: boolean;
}

export async function createUser(userData: AffiliateUserData): Promise<void> {
  if (userData.password) {
    try {
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(userData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `Erro ao criar usuário: ${response.status}`);
      }

      return;
    } catch (error) {
      console.error('Error creating user via backend:', error);
      throw error;
    }
  }

  try {
    const userId = userData.uid;
    if (!userId) {
      throw new Error('O ID do usuário não foi definido ao criar a conta.');
    }

    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, {
      uid: userId,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      affiliateId: userData.affiliateId || null,
      mustChangePassword: userData.mustChangePassword ?? false,
      avatarUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(userData.name)}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

export async function fetchSetting(key: string): Promise<string | null> {
  try {
    const docRef = doc(db, 'settings', key);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().value;
    }
    
    // Fallback search by key property if not found by ID
    const q = query(collection(db, 'settings'), where('key', '==', key));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data().value;
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching setting ${key}:`, error);
    return null;
  }
}

function extractArray(data: any): Affiliate[] {
  if (!data) return [];
  
  if (Array.isArray(data)) {
    return data;
  }
  
  if (typeof data === 'object') {
    // Check common locations for the array of data
    const potentialPaths = [
      'data.data', // Nested structure: { data: { data: [...] } }
      'data',
      'affiliates',
      'results',
      'items',
      'list',
      'payload',
      'content',
      'data.items',
      'data.results',
      'response',
      'rows'
    ];
    
    for (const path of potentialPaths) {
      if (path.includes('.')) {
        const parts = path.split('.');
        let current = data;
        for (const part of parts) {
          current = current ? current[part] : undefined;
        }
        if (Array.isArray(current)) return current;
      } else {
        if (Array.isArray(data[path])) return data[path];
      }
    }
    
    // Last resort: look for any array that isn't empty
    const keys = Object.keys(data);
    for (const key of keys) {
      if (Array.isArray(data[key]) && data[key].length > 0) {
        return data[key];
      }
      if (data[key] && typeof data[key] === 'object') {
        const subKeys = Object.keys(data[key]);
        for (const subKey of subKeys) {
          if (Array.isArray(data[key][subKey]) && data[key][subKey].length > 0) {
            return data[key][subKey];
          }
        }
      }
    }
  }

  return [];
}

function extractApiError(payload: any): ApiErrorInfo | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidates = [payload, payload.data, payload.error, payload.meta].filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;

    const rawCode = candidate.code ?? candidate.errorCode ?? candidate.statusCode ?? candidate.status;
    const code = rawCode != null ? String(rawCode).trim() : '';
    const rawMessage =
      candidate.message ??
      candidate.error ??
      candidate.details ??
      candidate.description;
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    const success = candidate.success;
    const hasExplicitFailure = success === false || Boolean(code && code !== '200' && code !== '201');

    if (!hasExplicitFailure && !messageLooksLikeError(message)) {
      continue;
    }

    const noData = isNoDataError(code, message);
    return {
      code: code || undefined,
      message: message || (noData ? 'Nenhum dado encontrado.' : 'Erro retornado pela API externa.'),
      noData
    };
  }

  return null;
}

function isNoDataError(code: string, message: string): boolean {
  const normalizedCode = code.replace(/^0+/, '') || code;
  const normalizedMessage = message.toLowerCase();

  return (
    code === '040' ||
    normalizedCode === '40' ||
    normalizedMessage.includes('nenhum') ||
    normalizedMessage.includes('nao encontrado') ||
    normalizedMessage.includes('não encontrado') ||
    normalizedMessage.includes('not found') ||
    normalizedMessage.includes('no data') ||
    normalizedMessage.includes('sem dados')
  );
}

function messageLooksLikeError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes('erro') ||
    normalizedMessage.includes('error') ||
    normalizedMessage.includes('invalid') ||
    normalizedMessage.includes('unauthorized') ||
    normalizedMessage.includes('forbidden') ||
    normalizedMessage.includes('not found') ||
    normalizedMessage.includes('não encontrado') ||
    normalizedMessage.includes('nao encontrado')
  );
}
