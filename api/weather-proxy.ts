import type { VercelRequest, VercelResponse } from '@vercel/node';

const VC_BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { location, endpoint, ...queryParams } = req.query;

    if (!location) {
      return res.status(400).json({ error: 'Missing location' });
    }

    const API_KEY = process.env.VISUALCROSSING_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: 'Missing API Key in environment' });
    }

    // Reconstruct the remaining query parameters
    const params = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
      } else if (value) {
        params.append(key, value);
      }
    });
    params.set('key', API_KEY);

    const targetUrl = `${VC_BASE_URL}/${location}${endpoint ? `/${endpoint}` : ''}?${params.toString()}`;

    const fetchRes = await fetch(targetUrl);
    const data = await fetchRes.json();

    return res.status(fetchRes.status).json(data);
  } catch (err: any) {
    console.error('Weather Proxy Error:', err);
    return res.status(500).json({ error: err.message });
  }
}