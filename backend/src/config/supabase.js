import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws'; // 1. Importamos el parche de WebSockets
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
// Acepta tanto la Service Key como la Anon Key como respaldo
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️ Alerta: Faltan variables de entorno de Supabase en este entorno.');
}

export const supabase = createClient(
  supabaseUrl || 'https://supabase.co', 
  supabaseKey || 'placeholder-key',
  {
    auth: {
      persistSession: false // Configuración recomendada para servidores backend
    },
    realtime: {
      webSocketConnectors: WebSocket // 2. Forzamos a Supabase a usar la librería 'ws'
    }
  }
);
