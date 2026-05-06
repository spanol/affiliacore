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
    const response = await fetch(`/api/affiliates`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    
    // Handle different possible response structures
    if (Array.isArray(data)) {
      return data;
    } else if (data && typeof data === 'object') {
      // Check for common nested array keys
      if (Array.isArray(data.data)) return data.data;
      if (Array.isArray(data.affiliates)) return data.affiliates;
      if (Array.isArray(data.results)) return data.results;
    }
    
    return [];
  } catch (error) {
    console.error('Affiliate fetch error:', error);
    throw error;
  }
}
