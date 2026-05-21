import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import dotenv from 'dotenv';

// Ejecuta dotenv, pero si no encuentra el archivo .env, continuará sin romperse
dotenv.config();

// REEMPLAZA LOS TEXTOS ENTRE COMILLAS CON TUS DATOS REALES DE SUPABASE
const REAL_URL = "https://supabase.co"; 
const REAL_KEY = "tu-clave-service-role-larga-aqui";

// Intenta leer del sistema operativo; si viene vacío, usa los datos reales de arriba
const supabaseUrl = process.env.SUPABASE_URL || REAL_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || REAL_KEY;

console.log("📢 Iniciando conexión con Supabase URL:", supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  realtime: {
    webSocketConnectors: WebSocket
  }
});
