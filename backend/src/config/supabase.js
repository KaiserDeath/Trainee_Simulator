import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// Lee los nombres exactos que tienes configurados en Back4App
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("📢 URL detectada desde Back4App:", supabaseUrl);
console.log("📢 ¿Clave detectada desde Back4App?:", supabaseKey ? "SÍ" : "NO");

let supabaseInstance = null;

// Inicialización segura para evitar el crash 'throw new Error' de la librería
if (supabaseUrl && supabaseKey && supabaseKey.trim() !== "") {
  try {
    supabaseInstance = createClient(supabaseUrl.trim(), supabaseKey.trim(), {
      auth: { persistSession: false },
      realtime: { webSocketConnectors: WebSocket }
    });
    console.log("🚀 SDK de Supabase enlazado correctamente.");
  } catch (error) {
    console.error("❌ Error al procesar el string de la clave:", error.message);
  }
} else {
  console.error("❌ CRÍTICO: No se inició Supabase. Verifica las variables en el panel web.");
}

export const supabase = supabaseInstance;
