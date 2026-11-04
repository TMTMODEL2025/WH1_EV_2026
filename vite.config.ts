import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function unpackJson(text: string) {
  try { return JSON.parse(text); } catch (e) {}
  const startIdx = text.indexOf('{"success":');
  if (startIdx !== -1) {
    const endIdx = text.lastIndexOf('}') + 1;
    if (endIdx > startIdx) {
      try { return JSON.parse(text.substring(startIdx, endIdx)); } catch (e) {}
    }
  }
  return null;
}

function gasProxyPlugin() {
  let memoryCache: {
    url: string;
    parsedData: any;
    timestamp: number;
  } | null = null;

  return {
    name: 'gas-proxy',
    configureServer(server: any) {
      server.middlewares.use('/api/gas-proxy', async (req: any, res: any) => {
        try {
          const parsedUrl = new URL(req.url, 'http://localhost');
          const targetUrl = parsedUrl.searchParams.get('url');
          if (!targetUrl) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Missing target url parameter' }));
            return;
          }

          if (req.method === 'POST') {
            // Write mutation: clear cache immediately
            memoryCache = null;

            let body = '';
            req.on('data', (chunk: any) => { body += chunk; });
            req.on('end', async () => {
              try {
                const gasRes = await fetch(targetUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/plain' },
                  body,
                  redirect: 'manual',
                });
                let text = '';
                if (gasRes.status === 302 || gasRes.status === 301) {
                  const location = gasRes.headers.get('location');
                  if (location) {
                    const echoRes = await fetch(location);
                    text = await echoRes.text();
                  }
                } else {
                  text = await gasRes.text();
                }
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(text || JSON.stringify({ success: true }));
              } catch (err: any) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
          } else {
            let targetUrlObj: URL | null = null;
            try {
              targetUrlObj = new URL(targetUrl);
            } catch (e) {}

            const limitParam = parsedUrl.searchParams.get('limit') || targetUrlObj?.searchParams.get('limit');
            const pageParam = parsedUrl.searchParams.get('page') || targetUrlObj?.searchParams.get('page');
            const isFast = parsedUrl.searchParams.get('fast') === '1' || limitParam !== null;
            const limit = Math.max(1, parseInt(limitParam || '100', 10) || 100);
            const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);
            const forceFresh = parsedUrl.searchParams.get('fresh') === '1';

            const now = Date.now();
            // Only use memoryCache when targetUrl is fetching full or page 1 recent data, or cache by targetUrl
            let fullData = (memoryCache && memoryCache.url === targetUrl && (now - memoryCache.timestamp < 30000) && !forceFresh)
              ? memoryCache.parsedData
              : null;

            if (!fullData) {
              const gasRes = await fetch(targetUrl, {
                method: 'GET',
                redirect: 'follow',
              });
              const text = await gasRes.text();
              const parsed = unpackJson(text);
              if (parsed && parsed.success && parsed.data) {
                memoryCache = {
                  url: targetUrl,
                  parsedData: parsed,
                  timestamp: now,
                };
                fullData = parsed;
              } else {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(text);
                return;
              }
            }

            // If upstream GAS has not already paginated (legacy GAS deployment returning all rows), slice by page & limit
            if (isFast && fullData.data && Array.isArray(fullData.data.sessions) && !fullData.data.isPartialSessions) {
              const allSessions = fullData.data.sessions;
              const endIndex = Math.max(0, allSessions.length - ((page - 1) * limit));
              const startIndex = Math.max(0, endIndex - limit);
              const pageSlice = allSessions.slice(startIndex, endIndex);

              const sessionMap = new Map();
              for (const s of pageSlice) {
                const id = s['Session ID'] || s.id;
                if (id) sessionMap.set(String(id).toUpperCase(), s);
              }

              if (page === 1) {
                const activeSessions = allSessions.filter((s: any) => {
                  const st = String(s['Status'] || s.status || '').toLowerCase();
                  return st === 'charging' || st === 'active';
                });
                for (const s of activeSessions) {
                  const id = s['Session ID'] || s.id;
                  if (id) sessionMap.set(String(id).toUpperCase(), s);
                }
              }

              const fastPayload = {
                ...fullData,
                data: {
                  ...fullData.data,
                  sessions: Array.from(sessionMap.values()),
                  isPartialSessions: true,
                  page,
                  limit,
                  hasMore: startIndex > 0,
                  totalSessionsCount: allSessions.length,
                },
              };
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(fastPayload));
              return;
            }

            // Return data as-is (either full data or already-paginated GAS data)
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(fullData));
          }
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), gasProxyPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
