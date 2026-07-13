import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

let widgetState = { url: '', timestamp: 0 };

function widgetSyncPlugin() {
  return {
    name: 'widget-sync-plugin',
    configureServer(server) {
      server.middlewares.use('/api/sync', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            if (body) {
              try { widgetState = JSON.parse(body); } catch (e) {}
            }
            res.statusCode = 200;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ success: true }));
          });
        } else {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify(widgetState));
        }
      });
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), widgetSyncPlugin()],
  base: '/rettostock/', // Absolute base path for GitHub Pages
  server: {
    proxy: {
      '/api/cnbc': {
        target: 'https://quote.cnbc.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cnbc/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
    }
  }
})
