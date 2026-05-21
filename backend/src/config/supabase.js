import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl =
  process.env.SUPABASE_URL?.trim();

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

console.log(
  "📢 URL detectada:",
  supabaseUrl || "NO"
);

console.log(
  "📢 Clave detectada:",
  supabaseKey ? "SÍ" : "NO"
);

let supabase = null;

try {
  if (!supabaseUrl) {
    throw new Error(
      "Falta SUPABASE_URL"
    );
  }

  if (!supabaseKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  supabase = createClient(
    supabaseUrl,
    supabaseKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      realtime: {
        webSocketConnectors: WebSocket
      }
    }
  );

  console.log(
    "🚀 Supabase conectado correctamente."
  );
} catch (error) {
  console.error(
    "❌ Error iniciando Supabase:",
    error.message
  );
}

export { supabase };