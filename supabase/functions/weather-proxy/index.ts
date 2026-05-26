import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const VC_BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const location = url.searchParams.get('location');
    const endpoint = url.searchParams.get('endpoint') || '';
    
    if (!location) {
      return new Response(JSON.stringify({ error: 'Missing location' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const API_KEY = Deno.env.get('VISUALCROSSING_API_KEY');
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing API Key in environment' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Reconstruct the remaining query parameters (excluding location and endpoint)
    const params = new URLSearchParams(url.searchParams);
    params.delete('location');
    params.delete('endpoint');
    params.set('key', API_KEY);

    const targetUrl = `${VC_BASE_URL}/${location}${endpoint ? `/${endpoint}` : ''}?${params.toString()}`;

    const res = await fetch(targetUrl);
    const data = await res.text();

    return new Response(data, {
      status: res.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});