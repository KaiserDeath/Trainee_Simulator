import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws'; // Mantén el parche de WebSockets por seguridad
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(
  supabaseUrl || 'https://supabase.co', 
  supabaseKey || 'placeholder-key',
  {
    auth: { persistSession: false },
    realtime: { webSocketConnectors: WebSocket }
  }
);
