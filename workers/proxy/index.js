const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/api/stops/name/')) {
      const query = path.replace('/api/stops/name/', '');
      const stopsKey = env.TRAFIKLAB_STOPS_KEY;
      
      if (!stopsKey) {
        return new Response('API key not configured', { status: 500, headers: CORS_HEADERS });
      }
      
      const targetUrl = `https://transport.trafiklab.se/api2/v1/stops/name/${query}?key=${stopsKey}`;
      
      const response = await fetch(targetUrl);
      return new Response(response.body, {
        status: response.status,
        headers: { 
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }

    if (path.startsWith('/api/timetable/')) {
      const stopId = path.replace('/api/timetable/', '');
      const realtimeKey = env.TRAFIKLAB_REALTIME_KEY;
      
      if (!realtimeKey) {
        return new Response('API key not configured', { status: 500, headers: CORS_HEADERS });
      }
      
      const targetUrl = `https://transport.trafiklab.se/api2/v1/timetable/${stopId}?key=${realtimeKey}`;
      
      const response = await fetch(targetUrl);
      return new Response(response.body, {
        status: response.status,
        headers: { 
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }
};
