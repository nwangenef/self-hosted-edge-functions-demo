import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
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
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!GEMINI_API_KEY) {
    console.error('Gemini API key is not set in environment variables');
    return new Response(JSON.stringify({
      error: 'Gemini API key not configured'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  try {
    const { texts, model = "models/text-embedding-004", projectId, storeInDatabase = false, keywordIds } = await req.json();
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return new Response(JSON.stringify({
        error: 'Texts array is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Create embeddings using Gemini API
    const embeddings = [];
    const errors = [];
    // Process in batches to avoid rate limits (adjust batch size as needed)
    const batchSize = 10;
    for(let i = 0; i < texts.length; i += batchSize){
      const batch = texts.slice(i, i + batchSize);
      try {
        const batchResults = await Promise.all(batch.map(async (text)=>{
          try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:embedContent?key=${GEMINI_API_KEY}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model,
                content: {
                  parts: [
                    {
                      text
                    }
                  ]
                }
              })
            });
            const result = await response.json();
            if (result.error) {
              console.error(`Error embedding text: ${result.error.message}`);
              errors.push({
                text,
                error: result.error.message
              });
              return null;
            }
            // Extract embedding vector
            return result.embedding.values;
          } catch (error) {
            console.error(`Error embedding text "${text}":`, error);
            errors.push({
              text,
              error: error.message
            });
            return null;
          }
        }));
        embeddings.push(...batchResults);
      } catch (error) {
        console.error(`Error processing batch ${i}:`, error);
        // Fill missing embeddings with nulls
        embeddings.push(...new Array(batch.length).fill(null));
      }
      // Add a small delay between batches to avoid rate limits
      if (i + batchSize < texts.length) {
        await new Promise((resolve)=>setTimeout(resolve, 200));
      }
    }
    // Store embeddings in database if requested
    if (storeInDatabase && SUPABASE_URL && SUPABASE_SERVICE_KEY && keywordIds && keywordIds.length === texts.length) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const embeddingsToStore = embeddings.map((embedding, index)=>{
        if (!embedding || !keywordIds[index]) return null;
        return {
          keyword_id: keywordIds[index],
          model: model.split('/').pop(),
          vector_data: embedding
        };
      }).filter((item)=>item !== null);
      if (embeddingsToStore.length > 0) {
        const { error } = await supabase.from('embeddings').insert(embeddingsToStore);
        if (error) {
          console.error('Error storing embeddings in database:', error);
        }
      }
    }
    return new Response(JSON.stringify({
      embeddings,
      errors: errors.length > 0 ? errors : null
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in Gemini embedding function:', error);
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
