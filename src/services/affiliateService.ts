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
    console.log('Fetching affiliates from /api/affiliates...');
    const response = await fetch('/api/affiliates', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Erro na API: ${response.status}`);
    }

    const data = await response.json();
    console.log('API Response received');
    return extractArray(data);
  } catch (error) {
    console.error('Affiliate fetch error:', error);
    throw error;
  }
}

export async function fetchAffiliateById(id: string): Promise<any> {
  try {
    const response = await fetch(`/api/external/affiliates/${id}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

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

    const response = await fetch(`/api/external/results?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Erro na API: ${response.status}`);
    }

    const data = await response.json();
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

    const response = await fetch(`/api/external/results?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Erro na API: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.data && Array.isArray(data.data.data)) {
      return data.data.data;
    }
    return Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error fetching all results:', error);
    throw error;
  }
}

export async function createUser(userData: { uid: string, name: string, email: string, role: 'admin' | 'client' }): Promise<void> {
  try {
    const docRef = doc(db, 'users', userData.uid);
    await setDoc(docRef, {
      ...userData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
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
