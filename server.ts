import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Proxy route for Affiliate API to avoid CORS issues
  app.get('/api/affiliates', async (req, res) => {
    try {
      const BASE_URL = process.env.VITE_AFFILIATE_API_BASE_URL || 'https://affiliate-api-prd.partnersotg.com';
      const apiKey = process.env.VITE_AFFILIATE_API_KEY || process.env.AFFILIATE_API_KEY;

      if (!apiKey) {
        console.error('Affiliate API Error: API Key is missing in environment');
        return res.status(500).json({ error: 'Chave de API não configurada no ambiente' });
      }

      const targetUrl = `${BASE_URL}/api/v2/external/affiliates`;
      console.log(`Proxying request to: ${targetUrl}`);
      
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json',
          'User-Agent': 'AgenciaBoost-App/1.0',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`External API Error (${response.status}):`, errorText);
        return res.status(response.status).json({ 
          error: `Erro na API Externa: ${response.status}`, 
          details: errorText 
        });
      }

      const data = await response.json();
      res.json(data);
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
