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

export const handler = async (event: any) => {
  const targetUrl = event.queryStringParameters?.url;
  if (!targetUrl) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Missing target url parameter' }),
    };
  }

  let targetUrlObj: URL | null = null;
  try {
    targetUrlObj = new URL(targetUrl);
  } catch (e) {}

  const limitParam = event.queryStringParameters?.limit ?? targetUrlObj?.searchParams.get('limit');
  const pageParam = event.queryStringParameters?.page ?? targetUrlObj?.searchParams.get('page');
  const isFast = event.queryStringParameters?.fast === '1' || limitParam !== null && limitParam !== undefined;
  const limit = Math.max(1, parseInt(String(limitParam || '100'), 10) || 100);
  const page = Math.max(1, parseInt(String(pageParam || '1'), 10) || 1);

  try {
    if (event.httpMethod === 'POST') {
      const gasRes = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: event.body || '',
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
      return {
        statusCode: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: text || JSON.stringify({ success: true, message: 'Row processed successfully' }),
      };
    } else {
      const gasRes = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'follow',
      });
      const text = await gasRes.text();
      const parsed = unpackJson(text);

      if (parsed && parsed.success && parsed.data) {
        if (isFast && Array.isArray(parsed.data.sessions) && !parsed.data.isPartialSessions) {
          const allSessions = parsed.data.sessions;
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
            ...parsed,
            data: {
              ...parsed.data,
              sessions: Array.from(sessionMap.values()),
              isPartialSessions: true,
              page,
              limit,
              hasMore: startIndex > 0,
              totalSessionsCount: allSessions.length,
            },
          };
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fastPayload),
          };
        }

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed),
        };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: text,
      };
    }
  } catch (err: any) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
