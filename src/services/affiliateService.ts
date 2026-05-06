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
