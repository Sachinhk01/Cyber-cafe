import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // 127.0.0.1 instead of "localhost" avoids IPv6 connection problems on Windows
  const target = env.VITE_PROXY_TARGET || 'http://127.0.0.1:5000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          // Fresh connection per request: avoids reusing a socket the backend just closed (ECONNRESET)
          agent: new http.Agent({ keepAlive: false }),
          configure(proxy) {
            let last = 0;
            proxy.on('error', (err, req, res) => {
              // One clear line every 5 seconds instead of a stack trace per request
              const down = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';
              if (Date.now() - last > 5000) {
                last = Date.now();
                console.error(
                  down
                    ? `\n[api] Backend not reachable at ${target}. Start it with: cd backend && npm run dev\n`
                    : `\n[api] ${req.method} ${req.url} failed: ${err.code || err.message}. Check the backend terminal.\n`
                );
              }
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(down ? 503 : 502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: down ? 'The backend server is not running. Start it with "npm run dev" in the backend folder.' : 'The request to the server failed. Please try again.' }));
              }
            });
          },
        },
      },
    },
    build: { sourcemap: false },
  };
});