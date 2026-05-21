import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// ⚠️ REEMPLAZA ESTOS DOS VALORES CON TUS DATOS REALES DE SUPABASE
const REAL_URL = "https://gctsgfjuwshqjxgnpzhg.supabase.co"; 
const REAL_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjdHNnZmp1d3NocWp4Z25wemhnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUwNzUxOCwiZXhwIjoyMDk0MDgzNTE4fQ.1lEblppEP282pthTpi-AICUsjGETAQ5qNUbBCGJ4zdc"; 

const supabaseUrl = process.env.SUPABASE_URL || REAL_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || REAL_KEY;

console.log("📢 URL detectada:", supabaseUrl);
console.log("📢 ¿Clave detectada?:", supabaseKey && supabaseKey !== "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjdHNnZmp1d3NocWp4Z25wemhnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUwNzUxOCwiZXhwIjoyMDk0MDgzNTE4fQ.1lEblppEP282pthTpi-AICUsjGETAQ5qNUbBCGJ4zdc" ? "SÍ" : "NO (Revisa las comillas)");

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  realtime: {
    webSocketConnectors: WebSocket
  }
});
