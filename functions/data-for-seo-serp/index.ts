import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  // Get environment variables
  const DATAFORSEO_LOGIN = Deno.env.get('DATAFORSEO_API_LOGIN');
  const DATAFORSEO_PASSWORD = Deno.env.get('DATAFORSEO_API_PASSWORD');
  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
    console.error('DataForSEO credentials are not set in environment variables');
    return new Response(JSON.stringify({
      error: 'DataForSEO credentials not configured'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  try {
    const { keyword, location_code = 2840, language_code = "en", device = "desktop" } = await req.json();
    if (!keyword) {
      return new Response(JSON.stringify({
        error: 'Keyword parameter is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Prepare auth
    const auth = btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);
    // DataForSEO SERP API request
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([
        {
          keyword,
          location_code,
          language_code,
          device,
          depth: 100,
          se_domain: "google.com"
        }
      ])
    });
    const result = await response.json();
    // Process the results to extract URLs
    let urls = [];
    let organicResults = [];
    if (result && result.tasks && result.tasks[0] && result.tasks[0].result && result.tasks[0].result[0] && result.tasks[0].result[0].items) {
      const items = result.tasks[0].result[0].items;
      organicResults = items.filter((item)=>item.type === 'organic').map((item)=>({
          position: item.rank_absolute,
          title: item.title,
          url: item.url,
          description: item.description
        }));
      urls = organicResults.map((item)=>item.url);
    }
    return new Response(JSON.stringify({
      keyword,
      urls,
      organicResults,
      raw: result
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in DataForSEO SERP function:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
